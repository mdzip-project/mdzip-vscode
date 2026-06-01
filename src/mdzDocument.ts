import * as vscode from 'vscode';
import {
  buildNewArchiveBytesWithTitle,
  buildNewArchiveWithTitle,
  openMdzArchive,
  readBinaryFileFromArchive,
  updateBinaryInArchive,
  updateManifestTitleInArchive,
  updateMarkdownInArchive,
  OpenedArchive,
} from './mdzArchiveUtils';
import { fileBaseNameFromPath, suggestedTitleFromMarkdown } from './shared/editorMetadata';

/**
 * Represents an open .mdz document.
 *
 * Holds the current archive state in memory and handles saves back to disk.
 */
export class MdzDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri;
  private readonly _sourceFormat: 'mdz' | 'markdown';

  /** Raw bytes of the current archive (kept in sync with edits). */
  private _archiveBytes: Uint8Array;

  /** Parsed archive content (resolved after the first open). */
  private _content: OpenedArchive | undefined;

  /** The in-memory markdown text (may differ from disk if the user has edited). */
  private _currentMarkdown: string = '';

  /** The archive-relative markdown path currently loaded in the editor. */
  private _currentMarkdownPath: string = 'index.md';

  /** Current content type for the loaded path (drives in-place viewer behaviour). */
  private _currentPathType: 'markdown' | 'text' | 'image' | 'binary' = 'markdown';

  /** True when there are unsaved changes. */
  private _isDirty: boolean = false;

  private readonly _onDidChange = new vscode.EventEmitter<MdzDocumentChangeEvent>();
  /** Fired whenever the document changes (edit or external reload). */
  public readonly onDidChange = this._onDidChange.event;

  private constructor(uri: vscode.Uri, bytes: Uint8Array, sourceFormat: 'mdz' | 'markdown') {
    this.uri = uri;
    this._archiveBytes = bytes;
    this._sourceFormat = sourceFormat;
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
      const doc = new MdzDocument(uri, starterBytes, 'markdown');
      await doc._reload(starterBytes);
      doc._currentMarkdown = markdown;
      return doc;
    }

    if (bytes.byteLength === 0) {
      const starter = await buildNewArchiveWithTitle(
        '# New Document\n\nStart writing here.\n',
        fileBaseNameFromPath(uri.path)
      );
      const starterBytes = new Uint8Array(await starter.arrayBuffer());
      const doc = new MdzDocument(uri, starterBytes, 'mdz');
      await doc._reload(starterBytes);
      doc._isDirty = true;
      return doc;
    }

    const doc = new MdzDocument(uri, bytes, 'mdz');
    await doc._reload(bytes);
    return doc;
  }

  /** Reload archive content from the provided bytes. */
  private async _reload(bytes: Uint8Array): Promise<void> {
    this._archiveBytes = bytes;
    this._content = await openMdzArchive(bytes);
    this._currentMarkdown = this._content.markdownText;
    this._currentMarkdownPath = this._content.entryPoint;
    this._currentPathType = 'markdown';
    this._isDirty = false;
  }

  /** Return the parsed archive content. */
  public get content(): OpenedArchive {
    if (!this._content) throw new Error('Archive content not loaded yet.');
    return this._content;
  }

  public get sourceFormat(): 'mdz' | 'markdown' {
    return this._sourceFormat;
  }

  /** Return the current (possibly edited) markdown text. */
  public get currentMarkdown(): string {
    return this._currentMarkdown;
  }

  /** Return the currently loaded text path in the archive. */
  public get currentMarkdownPath(): string {
    return this._currentMarkdownPath;
  }

  /** Return the currently loaded path type in the editor pane. */
  public get currentPathType(): 'markdown' | 'text' | 'image' | 'binary' {
    return this._currentPathType;
  }

  /** Resolve display title, falling back to a tolerant raw-manifest read when needed. */
  public async resolveManifestTitle(): Promise<string | undefined> {
    const parsedTitle = this.content.manifest?.title;
    if (typeof parsedTitle === 'string' && parsedTitle.trim()) {
      return parsedTitle.trim();
    }

    try {
      const manifestBytes = await readBinaryFileFromArchive(this._archiveBytes, 'manifest.json');
      const manifestText = new TextDecoder('utf-8').decode(manifestBytes);
      const parsed = JSON.parse(manifestText) as { title?: unknown };
      if (typeof parsed.title === 'string' && parsed.title.trim()) {
        return parsed.title.trim();
      }
    } catch {
      // Ignore malformed/missing manifest and rely on filename fallback.
    }

    return undefined;
  }

  /** Read raw bytes for an archive entry by path. */
  public async readPathBytes(archivePath: string): Promise<Uint8Array | undefined> {
    if (this._sourceFormat === 'markdown') {
      if (archivePath.toLowerCase() === 'index.md') {
        return new TextEncoder().encode(this._currentMarkdown);
      }
      return undefined;
    }

    const target = this.content.paths.find(
      (entry) => entry.path.toLowerCase() === archivePath.toLowerCase()
    );
    if (!target) {
      return undefined;
    }

    return readBinaryFileFromArchive(this._archiveBytes, target.path);
  }

  /** Open any archive file in-place and classify it for the webview. */
  public async openPath(archivePath: string): Promise<boolean> {
    if (this._sourceFormat === 'markdown') {
      return false;
    }

    const target = this.content.paths.find(
      (entry) => entry.path.toLowerCase() === archivePath.toLowerCase()
    );
    if (!target) {
      return false;
    }

    if (target.path === this._currentMarkdownPath && targetTypeForEntry(target) === this._currentPathType) {
      return true;
    }

    if (target.isImage) {
      this._currentMarkdownPath = target.path;
      this._currentPathType = 'image';
      this._isDirty = false;
      this._onDidChange.fire({ reason: 'reload' });
      return true;
    }

    const bytes = await readBinaryFileFromArchive(this._archiveBytes, target.path);
    this._currentMarkdown = new TextDecoder('utf-8').decode(bytes);
    this._currentMarkdownPath = target.path;
    this._currentPathType = isLikelyBinary(bytes)
      ? 'binary'
      : target.isMarkdown
        ? 'markdown'
        : 'text';

    this._isDirty = false;
    this._onDidChange.fire({ reason: 'reload' });
    return true;
  }

  /** Apply an edit from the webview (new markdown text). */
  public edit(newMarkdown: string): void {
    if (!isEditableTextPath(this._currentPathType, this._currentMarkdownPath)) {
      return;
    }
    this._currentMarkdown = newMarkdown;
    this._isDirty = true;
    this._onDidChange.fire({ reason: 'edit' });
  }

  /** Add or replace an image asset in the archive without discarding pending markdown edits. */
  public async addImageAsset(archivePath: string, base64Data: string): Promise<void> {
    const imageBytes = Uint8Array.from(Buffer.from(base64Data, 'base64'));
    const nextBytes = await updateBinaryInArchive(this._archiveBytes, archivePath, imageBytes);

    const currentMarkdown = this._currentMarkdown;
    const currentMarkdownPath = this._currentMarkdownPath;
    const currentPathType = this._currentPathType;
    this._archiveBytes = nextBytes;
    this._content = await openMdzArchive(nextBytes);
    this._currentMarkdown = currentMarkdown;
    this._currentMarkdownPath = currentMarkdownPath;
    this._currentPathType = currentPathType;
    this._isDirty = true;
    this._onDidChange.fire({ reason: 'edit' });
  }

  /** Update manifest title and keep editor content in sync without dropping pending markdown edits. */
  public async setTitle(newTitle: string): Promise<void> {
    const nextBytes = await updateManifestTitleInArchive(this._archiveBytes, newTitle);
    const currentMarkdown = this._currentMarkdown;
    const currentMarkdownPath = this._currentMarkdownPath;
    const currentPathType = this._currentPathType;
    const preserveOpenTextBuffer = isEditableTextPath(currentPathType, currentMarkdownPath);

    this._archiveBytes = nextBytes;
    this._content = await openMdzArchive(nextBytes);
    this._currentMarkdownPath = currentMarkdownPath;
    this._currentPathType = currentPathType;

    if (preserveOpenTextBuffer) {
      this._currentMarkdown = currentMarkdown;
    } else if (currentPathType === 'text') {
      try {
        const refreshedBytes = await readBinaryFileFromArchive(nextBytes, currentMarkdownPath);
        this._currentMarkdown = new TextDecoder('utf-8').decode(refreshedBytes);
      } catch {
        // Fall back to entry point content if the previous path no longer resolves.
        this._currentMarkdown = this._content.markdownText;
        this._currentMarkdownPath = this._content.entryPoint;
        this._currentPathType = 'markdown';
      }
    } else {
      this._currentMarkdown = currentMarkdown;
    }

    this._isDirty = true;
    this._onDidChange.fire({ reason: 'edit' });
  }

  /** Persist unsaved changes to disk. */
  public async save(): Promise<void> {
    await this.saveAs(this.uri);
    this._isDirty = false;
  }

  /** Persist the document to a different URI (Save As). */
  public async saveAs(target: vscode.Uri): Promise<void> {
    if (this._sourceFormat === 'markdown') {
      if (target.path.toLowerCase().endsWith('.mdz')) {
        const bytes = await buildNewArchiveBytesWithTitle(
          this._currentMarkdown,
          suggestedTitleFromMarkdown(this._currentMarkdown, fileBaseNameFromPath(target.path))
        );
        await vscode.workspace.fs.writeFile(target, bytes);
      } else {
        await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(this._currentMarkdown));
      }
      return;
    }

    if (!isEditableTextPath(this._currentPathType, this._currentMarkdownPath)) {
      await vscode.workspace.fs.writeFile(target, this._archiveBytes);
      return;
    }

    const newBytes = await updateMarkdownInArchive(
      this._archiveBytes,
      this._currentMarkdownPath,
      this._currentMarkdown
    );
    await vscode.workspace.fs.writeFile(target, newBytes);
    if (target.toString() === this.uri.toString()) {
      // Reload archive so bytes stay in sync with what was written
      await this._reload(newBytes);
    }
  }

  /** Revert the document to its last saved state. */
  public async revert(): Promise<void> {
    const bytes = await vscode.workspace.fs.readFile(this.uri);
    if (this._sourceFormat === 'markdown') {
      const markdown = bytes.byteLength === 0 ? '' : new TextDecoder('utf-8').decode(bytes);
      const starter = await buildNewArchiveWithTitle(
        markdown,
        suggestedTitleFromMarkdown(markdown, fileBaseNameFromPath(this.uri.path))
      );
      const starterBytes = new Uint8Array(await starter.arrayBuffer());
      await this._reload(starterBytes);
      this._currentMarkdown = markdown;
      this._onDidChange.fire({ reason: 'reload' });
      return;
    }

    await this._reload(bytes);
    this._onDidChange.fire({ reason: 'reload' });
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
    return this._isDirty;
  }

  public dispose(): void {
    this._onDidChange.dispose();
  }
}

export interface MdzDocumentChangeEvent {
  reason: 'edit' | 'reload';
}

function targetTypeForEntry(entry: { isMarkdown: boolean; isImage: boolean }):
  'markdown' | 'text' | 'image' | 'binary' {
  if (entry.isImage) {
    return 'image';
  }
  if (entry.isMarkdown) {
    return 'markdown';
  }
  return 'text';
}

function isLikelyBinary(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }

  let suspicious = 0;
  const sampleSize = Math.min(bytes.length, 2048);
  for (let i = 0; i < sampleSize; i++) {
    const value = bytes[i];
    if (value === 0) {
      return true;
    }
    if (value < 9 || (value > 13 && value < 32)) {
      suspicious += 1;
    }
  }

  return suspicious / sampleSize > 0.15;
}

function isEditableTextPath(
  currentPathType: 'markdown' | 'text' | 'image' | 'binary',
  archivePath: string
): boolean {
  if (currentPathType !== 'markdown' && currentPathType !== 'text') {
    return false;
  }
  return !isManifestPath(archivePath);
}

function isManifestPath(archivePath: string): boolean {
  const lower = archivePath.toLowerCase();
  const fileName = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;
  return fileName === 'manifest.json';
}
