import * as vscode from 'vscode';
import * as path from 'path';
import {
  buildNewArchiveWithTitle,
  fileBaseNameFromPath,
  suggestedTitleFromMarkdown,
  MdzipWorkspaceService,
  OpenedArchive,
  MdzipWorkspaceSnapshot,
  inferMdzipSourceFormat,
} from '@mdzip/editor';

/**
 * Represents an open .mdz document.
 *
 * Thin wrapper around MdzipWorkspaceService that integrates with VS Code's CustomDocument lifecycle.
 */
export class MdzDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri;
  private readonly _sourceFormat: 'mdz' | 'markdown';
  private _service: MdzipWorkspaceService;
  private _unsubscribe: (() => void) | undefined;

  private readonly _onDidChange = new vscode.EventEmitter<MdzDocumentChangeEvent>();
  /** Fired whenever the document changes (edit or external reload). */
  public readonly onDidChange = this._onDidChange.event;

  private readonly _watcher: vscode.FileSystemWatcher | undefined;
  private _reloadTimer: NodeJS.Timeout | undefined;
  private _disposed = false;
  private _userDirty = false;
  private _suppressNextReload = false;
  private _latestWebviewBytes: Uint8Array | undefined;
  private _convertedToMdz = false;
  public readonly isNewDocument: boolean;

  private constructor(uri: vscode.Uri, service: MdzipWorkspaceService, sourceFormat: 'mdz' | 'markdown', isNewDocument = false) {
    this.uri = uri;
    this._service = service;
    this._sourceFormat = sourceFormat;
    this.isNewDocument = isNewDocument;
    this._watcher = this._createExternalChangeWatcher(uri);
    this._subscribeToServiceChanges();
  }

  private _subscribeToServiceChanges(): void {
    this._unsubscribe = this._service.subscribe((event) => {
      // Fire change event for all service changes (for VS Code tracking)
      // But only mark dirty for user edits from the webview (workspaceChanged)
      // Internal events like markPersisted() should not affect dirty state
      this._onDidChange.fire({ reason: event.reason });
    });
  }

  /** Factory — reads the file from disk and parses the archive. */
  public static async create(uri: vscode.Uri): Promise<MdzDocument> {
    const bytes = await vscode.workspace.fs.readFile(uri);

    if (uri.path.toLowerCase().endsWith('.md')) {
      // For plain .md files, pass them directly without wrapping in an archive
      const service = await MdzipWorkspaceService.open(bytes, {
        sourceFormat: 'markdown',
        fileName: uri.path,
      });
      const doc = new MdzDocument(uri, service, 'markdown', bytes.byteLength === 0);
      return doc;
    }

    if (bytes.byteLength === 0) {
      const starter = await buildNewArchiveWithTitle(
        '# New Document\n\nStart writing here.\n',
        fileBaseNameFromPath(uri.path)
      );
      const starterBytes = new Uint8Array(await starter.arrayBuffer());
      const service = await MdzipWorkspaceService.open(starterBytes, {
        sourceFormat: 'mdz',
        fileName: uri.path,
      });
      const doc = new MdzDocument(uri, service, 'mdz', true);
      return doc;
    }

    const sourceFormat = inferMdzipSourceFormat(bytes, uri.path);
    const service = await MdzipWorkspaceService.open(bytes, {
      sourceFormat,
      fileName: uri.path,
    });
    service.markPersisted();
    const doc = new MdzDocument(uri, service, sourceFormat);
    return doc;
  }

  /** Return the parsed archive content. */
  public get content(): OpenedArchive {
    return this._service.content;
  }

  public get sourceFormat(): 'mdz' | 'markdown' {
    return this._sourceFormat;
  }

  /** Return the current (possibly edited) markdown text. */
  public get currentMarkdown(): string {
    return this._service.currentText;
  }

  /** Return the currently loaded text path in the archive. */
  public get currentMarkdownPath(): string {
    return this._service.currentPath;
  }

  /** Return the currently loaded path type in the editor pane. */
  public get currentPathType(): 'markdown' | 'text' | 'image' | 'binary' {
    return this._service.currentPathType;
  }

  /** Resolve display title from manifest. */
  public async resolveManifestTitle(): Promise<string | undefined> {
    const manifest = this._service.manifest();
    if (typeof manifest?.title === 'string' && manifest.title.trim()) {
      return manifest.title.trim();
    }
    return undefined;
  }

  /** Read raw bytes for an archive entry by path. */
  public async readPathBytes(archivePath: string): Promise<Uint8Array | undefined> {
    return this._service.readPathBytes(archivePath);
  }

  /** Open any archive file in-place. */
  public async openPath(archivePath: string): Promise<boolean> {
    return this._service.openPath(archivePath);
  }

  /** Apply an edit from the webview (new markdown text). */
  public edit(newMarkdown: string): void {
    this._service.editText(newMarkdown);
  }

  /** Return a JSON-serializable workspace snapshot with all asset data URIs pre-resolved. */
  public async getSerializedWorkspace(): Promise<object> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workspace = this._service.snapshot().workspace as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assets = await Promise.all((workspace.assets as any[]).map(async (asset: any) => {
      // Strip the JSZip-backed closure functions; keep all plain data fields (including
      // undeclared ones like 'kind' that openedArchiveFromWorkspace depends on).
      const { readBytes: _rb, readDataUri, ...plain } = asset;
      return { ...plain, dataUri: readDataUri ? await readDataUri() : undefined };
    }));

    // Since 1.2.7 non-entry documents are lazy (text: '' + readText closure + isLazy
    // flag). The closure does not survive postMessage, and eagerly resolving every
    // text here can mean hundreds of MB for large archives (books.mdz: 749 docs /
    // 324MB). Strip the closure; the isLazy flag survives serialization and tells
    // the webview to rehydrate readText as a host round-trip.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const documents = (workspace.documents as any[]).map((doc: any) => {
      const { readText: _rt, ...plain } = doc;
      return plain;
    });

    // For plain .md files, include relative disk images as synthetic assets so the webview
    // can render them. The browser-side webview cannot load local files directly.
    const diskAssets = this._sourceFormat === 'markdown' && this.uri.scheme === 'file'
      ? await this._loadRelativeDiskImages(this._service.snapshot().currentText)
      : [];

    // Spread the full workspace so undeclared fields (validation, orphanedAssets, etc.)
    // are preserved — openedArchiveFromWorkspace and getValidationStatus need them.
    return { ...workspace, documents, assets: [...assets, ...diskAssets] };
  }

  private async _loadRelativeDiskImages(markdown: string): Promise<object[]> {
    const docDir = path.dirname(this.uri.fsPath);
    const relPaths = new Set<string>();

    for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1]?.trim() ?? '';
      if (target.startsWith('<') && target.endsWith('>')) { target = target.slice(1, -1).trim(); }
      target = target.split(/[?#]/)[0].trim();
      if (!target) { continue; }
      // Skip absolute URLs, protocol-relative, and absolute paths
      if (/^[a-zA-Z][\w+.-]*:/.test(target) || target.startsWith('//') || target.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(target)) { continue; }
      relPaths.add(target);
    }

    const results: object[] = [];
    await Promise.all([...relPaths].map(async (relPath) => {
      const absPath = path.resolve(docDir, relPath.replace(/\//g, path.sep));
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
        const archivePath = relPath.replace(/\\/g, '/');
        const ext = path.extname(archivePath).toLowerCase();
        const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' } as Record<string, string>)[ext] ?? 'image/png';
        const dataUri = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
        results.push({ path: archivePath, kind: 'image', dataUri });
      } catch { /* file not found or unreadable — skip */ }
    }));
    return results;
  }

  /** Return bytes in the format the shared browser editor expects to open. */
  public async exportForWorkspaceEditor(): Promise<Uint8Array> {
    // Use already-loaded bytes: every mutation (setManifestTitle, addAsset, removeAsset)
    // calls reloadPreservingCurrentText() which keeps archiveBytes current.
    // Calling saveToBytes() here is expensive (ZIP rebuild + JSZip re-parse) and unnecessary.
    const snapshot = this._service.snapshot();
    if (this._sourceFormat === 'markdown') {
      return new TextEncoder().encode(snapshot.currentText);
    }
    return snapshot.archiveBytes;
  }

  /** Add or replace an image asset in the archive. */
  public async addImageAsset(archivePath: string, base64Data: string): Promise<void> {
    const imageBytes = Uint8Array.from(Buffer.from(base64Data, 'base64'));
    await this._service.addAsset(archivePath, imageBytes);
  }

  /** Return orphaned image assets. */
  public async findCurrentOrphanedAssetPaths(): Promise<string[]> {
    const snapshot = this._service.snapshot();
    return snapshot.content?.orphanedAssetPaths ?? [];
  }

  /** Remove an orphaned image asset. */
  public async removeOrphanedAsset(archivePath: string): Promise<boolean> {
    return this._service.removeAsset(archivePath, { requireOrphaned: true });
  }

  /** Update manifest title. */
  public async setTitle(newTitle: string): Promise<void> {
    await this._service.setManifestTitle(newTitle);
  }

  /** Persist unsaved changes to disk. */
  public async save(): Promise<void> {
    await this.saveAs(this.uri);
  }

  /** The most recent bytes sent from the webview (updated on every workspaceChanged). */
  public get latestWebviewBytes(): Uint8Array | undefined { return this._latestWebviewBytes; }

  /** True when the browser has converted this markdown document to .mdz format. */
  public get isConvertedToMdz(): boolean { return this._convertedToMdz; }

  /** Apply bytes received from the webview after a user edit. */
  public updateFromWebview(bytes: Uint8Array): void {
    this._latestWebviewBytes = bytes;
  }

  /** Record that the browser has converted this markdown workspace to .mdz. */
  public markConvertedToMdz(): void {
    this._convertedToMdz = true;
  }

  /**
   * Called after the host has committed the converted .mdz bytes to disk.
   * Reverts the document to its on-disk markdown state so future saves don't redirect.
   */
  public async resetAfterMdzConversion(): Promise<void> {
    this._convertedToMdz = false;
    // Suppress the file-watcher reload triggered by the host writing the .md back to disk.
    this._suppressNextReload = true;
    await this.revert();
  }

  /** Persist the document to a different URI (Save As). */
  public async saveAs(target: vscode.Uri): Promise<void> {
    const bytes = this._latestWebviewBytes ?? await this._service.saveToBytes();
    await vscode.workspace.fs.writeFile(target, bytes);
    if (target.toString() === this.uri.toString()) {
      this._service.markPersisted();
      this._userDirty = false;
      this._suppressNextReload = true;
    }
  }

  /** Revert the document to its last saved state. */
  public async revert(): Promise<void> {
    const bytes = await vscode.workspace.fs.readFile(this.uri);
    const sourceFormat = inferMdzipSourceFormat(bytes, this.uri.path);
    this._service = await MdzipWorkspaceService.open(bytes, {
      sourceFormat,
      fileName: this.uri.path,
    });
    this._latestWebviewBytes = undefined;
    this._userDirty = false;
    this._convertedToMdz = false;
    this._subscribeToServiceChanges();
    this._onDidChange.fire({ reason: 'reload' });
  }

  /** Reload from disk after an external file change when no local edits would be lost. */
  public async reloadFromDiskIfClean(): Promise<boolean> {
    if (this._disposed || this._userDirty) {
      return false;
    }
    if (this._suppressNextReload) {
      this._suppressNextReload = false;
      return false;
    }

    const bytes = await vscode.workspace.fs.readFile(this.uri);
    const sourceFormat = inferMdzipSourceFormat(bytes, this.uri.path);
    this._service = await MdzipWorkspaceService.open(bytes, {
      sourceFormat,
      fileName: this.uri.path,
    });
    this._subscribeToServiceChanges();
    this._onDidChange.fire({ reason: 'reload' });
    return true;
  }

  /** Backup the document to the given destination. */
  public async backup(destination: vscode.Uri): Promise<vscode.CustomDocumentBackup> {
    await this.saveAs(destination);
    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(destination);
        } catch {
          // ignore
        }
      },
    };
  }

  public get isDirty(): boolean {
    return this._userDirty;
  }

  public markDirty(): void {
    this._userDirty = true;
  }

  public dispose(): void {
    this._disposed = true;
    if (this._reloadTimer) {
      clearTimeout(this._reloadTimer);
      this._reloadTimer = undefined;
    }
    this._unsubscribe?.();
    this._watcher?.dispose();
    this._onDidChange.dispose();
  }

  private _createExternalChangeWatcher(uri: vscode.Uri): vscode.FileSystemWatcher | undefined {
    if (uri.scheme !== 'file') {
      return undefined;
    }

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(uri.fsPath)), path.basename(uri.fsPath))
    );
    const scheduleReload = () => this._scheduleExternalReload();
    watcher.onDidChange(scheduleReload);
    watcher.onDidCreate(scheduleReload);
    return watcher;
  }

  private _scheduleExternalReload(): void {
    if (this._disposed || this._service.dirty) {
      return;
    }

    if (this._reloadTimer) {
      clearTimeout(this._reloadTimer);
    }

    this._reloadTimer = setTimeout(() => {
      this._reloadTimer = undefined;
      void this.reloadFromDiskIfClean();
    }, 100);
  }
}

export interface MdzDocumentChangeEvent {
  reason: 'edit' | 'reload';
}
