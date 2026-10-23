import * as vscode from 'vscode';
import * as path from 'path';
import { createHash } from 'crypto';
import { promises as fsPromises } from 'fs';
import {
  buildNewArchiveWithTitle,
  fileBaseNameFromPath,
  suggestedTitleFromMarkdown,
  MdzipWorkspaceService,
  OpenedArchive,
  MdzipWorkspaceSnapshot,
  inferMdzipSourceFormat,
} from '@mdzip/editor';
import { MdzArchiveCore } from '@mdzip/core-js';
import { logInfo, logError } from './mdzLog';

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

  private readonly _onDidChangeOnDisk = new vscode.EventEmitter<void>();
  /**
   * Fired when the file changes on disk (another program, the MCP server, an
   * AI agent) while this document has unsaved changes, so it can't simply
   * reload. Fired once per change; the provider asks the user what to do.
   */
  public readonly onDidChangeOnDisk = this._onDidChangeOnDisk.event;

  private readonly _watcher: vscode.FileSystemWatcher | undefined;
  private _reloadTimer: NodeJS.Timeout | undefined;
  private _disposed = false;
  private _userDirty = false;
  /**
   * The file on disk as this document last knew it: set on open, reload,
   * revert and this document's own save. A file that no longer matches was
   * changed by someone else, and saving over it would lose their change.
   */
  private _disk: DiskState | undefined;
  private _changedOnDisk = false;
  private _latestWebviewBytes: Uint8Array | undefined;
  private _convertedToMdz = false;
  public readonly isNewDocument: boolean;
  private _readOnly: boolean;

  private constructor(
    uri: vscode.Uri,
    service: MdzipWorkspaceService,
    sourceFormat: 'mdz' | 'markdown',
    isNewDocument = false,
    readOnly = false
  ) {
    this.uri = uri;
    this._service = service;
    this._sourceFormat = sourceFormat;
    this.isNewDocument = isNewDocument;
    this._readOnly = readOnly;
    this._watcher = this._createExternalChangeWatcher(uri);
    this._subscribeToServiceChanges();
  }

  /**
   * Whether the file on disk was read-only (OS permission bit) as of the last
   * check — checked at open and refreshed on every external-change reload, so
   * clearing the attribute while the document stays open is picked up without
   * a full re-open. The webview uses this to open in the library's built-in
   * `mode: 'read-only'` (disables editing, save/title buttons, drag — see
   * MdzipWorkspaceView) instead of silently accepting edits that fail with a
   * raw EPERM only at save time.
   */
  public get readOnly(): boolean {
    return this._readOnly;
  }

  /**
   * Re-stat the file's read-only bit. Swallows stat failures and non-`file:`
   * schemes (treated as writable — matches prior behavior).
   *
   * Uses Node's own `fs.stat()` on `uri.fsPath`, not `vscode.workspace.fs.stat()`
   * — confirmed via a real extension host log that the latter's `.permissions`
   * comes back `undefined` for a genuinely read-only local file on this vscode
   * build, while Node's `fs.stat().mode` correctly reflects the Windows
   * read-only attribute (write bit cleared) for the same file. For remote/WSL/
   * container workspaces this still resolves correctly since the extension
   * host process itself runs on that same remote side as `uri.fsPath`.
   */
  private static async _statReadOnly(uri: vscode.Uri): Promise<boolean> {
    if (uri.scheme !== 'file') {
      return false;
    }
    try {
      const stat = await fsPromises.stat(uri.fsPath);
      const result = (stat.mode & 0o200) === 0;
      logInfo(`statReadOnly(${uri.fsPath}): mode=${(stat.mode & 0o777).toString(8)} -> ${result}`);
      return result;
    } catch (error) {
      logError(`statReadOnly(${uri.fsPath}) threw`, error);
      return false;
    }
  }

  private _subscribeToServiceChanges(): void {
    this._unsubscribe?.();
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
    const readOnly = await MdzDocument._statReadOnly(uri);
    const doc = await MdzDocument._createFromBytes(uri, bytes, readOnly);
    await doc._setDiskBaseline(bytes);
    return doc;
  }

  private static async _createFromBytes(uri: vscode.Uri, bytes: Uint8Array, readOnly: boolean): Promise<MdzDocument> {
    if (uri.path.toLowerCase().endsWith('.md')) {
      // For plain .md files, pass them directly without wrapping in an archive
      const service = await MdzipWorkspaceService.open(bytes, {
        sourceFormat: 'markdown',
        fileName: uri.path,
      });
      return new MdzDocument(uri, service, 'markdown', bytes.byteLength === 0, readOnly);
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
      return new MdzDocument(uri, service, 'mdz', true, readOnly);
    }

    const sourceFormat = inferMdzipSourceFormat(bytes, uri.path);
    const service = await MdzipWorkspaceService.open(bytes, {
      sourceFormat,
      fileName: uri.path,
    });
    service.markPersisted();
    return new MdzDocument(uri, service, sourceFormat, false, readOnly);
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
    this._userDirty = true;
  }

  /** Return a JSON-serializable workspace snapshot with all asset data URIs pre-resolved. */
  public async getSerializedWorkspace(): Promise<object> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workspace = this._service.snapshot().workspace as any;
    const orphanedAssets = this._sourceFormat === 'mdz'
      ? await MdzArchiveCore.findOrphanedAssets(this.currentArchiveBytes())
      : undefined;
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
    return {
      ...workspace,
      documents,
      assets: [...assets, ...diskAssets],
      ...(orphanedAssets ? { orphanedAssets } : {}),
    };
  }

  private async _loadRelativeDiskImages(markdown: string): Promise<object[]> {
    const docDir = path.dirname(this.uri.fsPath);
    const relPaths = new Set<string>();

    // MdzArchiveCore.extractImageReferences is the one canonical scan for both
    // markdown ![]() syntax and raw HTML <img src> tags — this used to keep its
    // own ![]()-only copy, which is exactly why a raw-<img>-only file (like the
    // star-wars-demo sample) rendered with every relative image broken.
    for (const rawTarget of MdzArchiveCore.extractImageReferences(markdown)) {
      let target = rawTarget.split(/[?#]/)[0].trim();
      // Links are URL-encoded (`pasted%202.png`) but the file on disk isn't; the
      // editor also decodes refs before matching them against asset paths.
      try { target = decodeURIComponent(target); } catch { /* keep as written */ }
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

  /**
   * Persist unsaved changes to disk. Throws MdzDiskConflictError, writing
   * nothing, if the file changed on disk since this document last read or
   * wrote it, unless `overwrite` is set.
   */
  public async save(options: SaveOptions = {}): Promise<void> {
    await this.saveAs(this.uri, options);
  }

  /** The most recent bytes sent from the webview (updated on every workspaceChanged). */
  public get latestWebviewBytes(): Uint8Array | undefined { return this._latestWebviewBytes; }

  /** Current archive bytes: latest webview edit if any, else the service's bytes. */
  public currentArchiveBytes(): Uint8Array {
    return this._latestWebviewBytes ?? this._service.snapshot().archiveBytes;
  }

  /** True when the browser has converted this markdown document to .mdz format. */
  public get isConvertedToMdz(): boolean { return this._convertedToMdz; }

  /** Apply bytes received from the webview after a user edit. */
  public updateFromWebview(bytes: Uint8Array): void {
    this._latestWebviewBytes = bytes;
  }

  /**
   * Apply a manifest-only change from the webview (onManifestChanged path).
   * The webview skips its archive rebuild for manifest edits; the host patches
   * the manifest entry into the real bytes incrementally — no document reads.
   */
  public async applyManifest(manifest: unknown): Promise<void> {
    const current = this._latestWebviewBytes ?? this._service.snapshot().archiveBytes;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await MdzArchiveCore.updateFiles(current, [], [], { manifest: manifest as any });
    this._latestWebviewBytes = new Uint8Array(await result.blob.arrayBuffer());
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
    // revert() re-reads the .md the host just wrote and takes it as the new
    // baseline, so the watcher event for that write is recognised as ours.
    await this.revert();
  }

  /** Persist the document to a URI: its own (save) or another (Save As, backup). */
  public async saveAs(target: vscode.Uri, options: SaveOptions = {}): Promise<void> {
    const bytes = this._latestWebviewBytes ?? await this._service.saveToBytes();
    const toSelf = target.toString() === this.uri.toString();
    if (toSelf && !options.overwrite && await this._readIfChangedOnDisk()) {
      // Someone else wrote the file since this document read it; writing our
      // copy now would silently throw their change away.
      throw new MdzDiskConflictError(this.uri);
    }
    const previousDisk = this._disk;
    if (toSelf) {
      // Recorded before the write, so a watcher event that races it is still
      // recognised as this document's own write.
      this._disk = { size: bytes.byteLength, mtime: Number.NaN, hash: hashBytes(bytes) };
    }
    try {
      await vscode.workspace.fs.writeFile(target, bytes);
    } catch (error) {
      if (toSelf) this._disk = previousDisk;
      throw error;
    }
    if (toSelf) {
      await this._setDiskBaseline(bytes);
      this._service.markPersisted();
      this._userDirty = false;
      this._changedOnDisk = false;
      // The write above only succeeds if the file is currently writable —
      // cheaper and more current than a separate stat() call.
      this._readOnly = false;
    }
  }

  /** Revert the document to its last saved state. */
  public async revert(): Promise<void> {
    const bytes = await vscode.workspace.fs.readFile(this.uri);
    this._convertedToMdz = false;
    await this._loadFromBytes(bytes);
  }

  /**
   * Check the file on disk after the watcher reports a change. If someone
   * else changed it: reload when this document has no unsaved changes;
   * otherwise keep them and fire onDidChangeOnDisk. A change that is this
   * document's own save is ignored.
   */
  public async checkDisk(): Promise<'unchanged' | 'reloaded' | 'conflict'> {
    if (this._disposed) {
      return 'unchanged';
    }
    const bytes = await this._readIfChangedOnDisk();
    if (!bytes || this._disposed) {
      return 'unchanged';
    }
    if (this.hasUnsavedChanges) {
      if (!this._changedOnDisk) {
        this._changedOnDisk = true;
        this._onDidChangeOnDisk.fire();
      }
      return 'conflict';
    }
    await this._loadFromBytes(bytes);
    return 'reloaded';
  }

  /** Reload from disk after an external file change when no local edits would be lost. */
  public async reloadFromDiskIfClean(): Promise<boolean> {
    return (await this.checkDisk()) === 'reloaded';
  }

  /**
   * The user chose to keep their unsaved changes over a change on disk: take
   * the file as it is now as the baseline, so the next save replaces it
   * without asking again.
   */
  public async keepChangesOverDisk(): Promise<void> {
    try {
      await this._setDiskBaseline(await vscode.workspace.fs.readFile(this.uri));
    } catch {
      // The file is gone; the next save simply recreates it.
    }
    this._changedOnDisk = false;
  }

  /** Whether the file changed on disk while this document had unsaved changes. */
  public get changedOnDisk(): boolean {
    return this._changedOnDisk;
  }

  /** Unsaved changes that a reload from disk would throw away. */
  public get hasUnsavedChanges(): boolean {
    return this._userDirty || this._convertedToMdz;
  }

  /**
   * Replace the document's content with bytes read from disk, dropping every
   * copy of the previous state, including the last bytes from the webview
   * (a later save or rename would otherwise rebuild from them).
   */
  private async _loadFromBytes(bytes: Uint8Array): Promise<void> {
    const sourceFormat = inferMdzipSourceFormat(bytes, this.uri.path);
    this._service = await MdzipWorkspaceService.open(bytes, {
      sourceFormat,
      fileName: this.uri.path,
    });
    if (sourceFormat === 'mdz') {
      this._service.markPersisted();
    }
    this._latestWebviewBytes = undefined;
    this._userDirty = false;
    this._changedOnDisk = false;
    this._readOnly = await MdzDocument._statReadOnly(this.uri);
    await this._setDiskBaseline(bytes);
    this._subscribeToServiceChanges();
    this._onDidChange.fire({ reason: 'reload' });
  }

  private async _statDisk(): Promise<{ size: number; mtime: number } | undefined> {
    try {
      const stat = await vscode.workspace.fs.stat(this.uri);
      return { size: stat.size, mtime: stat.mtime };
    } catch {
      return undefined;
    }
  }

  private async _setDiskBaseline(bytes: Uint8Array): Promise<void> {
    const stat = await this._statDisk();
    this._disk = { size: stat?.size ?? bytes.byteLength, mtime: stat?.mtime ?? Number.NaN, hash: hashBytes(bytes) };
  }

  /**
   * The file's bytes if they differ from the baseline, else undefined. Size
   * and modification time decide quickly; the content hash confirms, so a
   * file that was only touched (or this document's own save) isn't a change.
   */
  private async _readIfChangedOnDisk(): Promise<Uint8Array | undefined> {
    if (!this._disk) {
      return undefined;
    }
    const stat = await this._statDisk();
    if (!stat) {
      return undefined; // Deleted: nothing to protect; a save recreates it.
    }
    if (stat.size === this._disk.size && stat.mtime === this._disk.mtime) {
      return undefined;
    }
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(this.uri);
    } catch {
      return undefined;
    }
    const hash = hashBytes(bytes);
    if (hash === this._disk.hash) {
      this._disk = { size: stat.size, mtime: stat.mtime, hash };
      return undefined;
    }
    return bytes;
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
    this._onDidChangeOnDisk.dispose();
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

  // Every change is checked, with or without unsaved edits: checkDisk()
  // decides between ignoring (our own save), reloading and warning.
  private _scheduleExternalReload(): void {
    if (this._disposed) {
      return;
    }

    if (this._reloadTimer) {
      clearTimeout(this._reloadTimer);
    }

    this._reloadTimer = setTimeout(() => {
      this._reloadTimer = undefined;
      this.checkDisk().catch((error) => logError(`Checking ${this.uri.fsPath} for external changes failed`, error));
    }, 100);
  }
}

export interface MdzDocumentChangeEvent {
  reason: 'edit' | 'reload';
}

export interface SaveOptions {
  /** Write even if the file changed on disk since it was read (the user chose to). */
  overwrite?: boolean;
}

interface DiskState {
  size: number;
  /** NaN until known, so it never matches and the hash decides. */
  mtime: number;
  hash: string;
}

/** A save refused because the file changed on disk since the document read it. */
export class MdzDiskConflictError extends Error {
  constructor(public readonly uri: vscode.Uri) {
    super(`${path.posix.basename(uri.path)} changed on disk since it was opened; saving would overwrite that change.`);
    this.name = 'MdzDiskConflictError';
  }
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
