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

  private constructor(uri: vscode.Uri, service: MdzipWorkspaceService, sourceFormat: 'mdz' | 'markdown') {
    this.uri = uri;
    this._service = service;
    this._sourceFormat = sourceFormat;
    this._watcher = this._createExternalChangeWatcher(uri);
    this._subscribeToServiceChanges();
  }

  private _subscribeToServiceChanges(): void {
    this._unsubscribe = this._service.subscribe((event) => {
      this._onDidChange.fire({ reason: event.reason });
    });
  }

  /** Factory — reads the file from disk and parses the archive. */
  public static async create(uri: vscode.Uri): Promise<MdzDocument> {
    const bytes = await vscode.workspace.fs.readFile(uri);

    if (uri.path.toLowerCase().endsWith('.md')) {
      const markdown = bytes.byteLength === 0 ? '' : new TextDecoder('utf-8').decode(bytes);
      const starter = await buildNewArchiveWithTitle(
        markdown,
        suggestedTitleFromMarkdown(markdown, fileBaseNameFromPath(uri.path))
      );
      const starterBytes = new Uint8Array(await starter.arrayBuffer());
      const service = await MdzipWorkspaceService.open(starterBytes, {
        sourceFormat: 'markdown',
        fileName: uri.path,
      });
      const doc = new MdzDocument(uri, service, 'markdown');
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
      const doc = new MdzDocument(uri, service, 'mdz');
      return doc;
    }

    const sourceFormat = inferMdzipSourceFormat(bytes, uri.path);
    const service = await MdzipWorkspaceService.open(bytes, {
      sourceFormat,
      fileName: uri.path,
    });
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

  /** Return bytes in the format the shared browser editor expects to open. */
  public async exportForWorkspaceEditor(): Promise<Uint8Array> {
    return this._service.saveToBytes();
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

  /** Persist the document to a different URI (Save As). */
  public async saveAs(target: vscode.Uri): Promise<void> {
    const bytes = await this._service.saveToBytes();
    await vscode.workspace.fs.writeFile(target, bytes);
    if (target.toString() === this.uri.toString()) {
      this._service.markPersisted();
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
    this._subscribeToServiceChanges();
    this._onDidChange.fire({ reason: 'reload' });
  }

  /** Reload from disk after an external file change when no local edits would be lost. */
  public async reloadFromDiskIfClean(): Promise<boolean> {
    if (this._disposed || this._service.dirty) {
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
    return this._service.dirty;
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
