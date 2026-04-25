import * as vscode from 'vscode';
import { openMdzArchive, updateMarkdownInArchive, OpenedArchive } from './mdzArchiveUtils';

/**
 * Represents an open .mdz document.
 *
 * Holds the current archive state in memory and handles saves back to disk.
 */
export class MdzDocument implements vscode.CustomDocument {
  public readonly uri: vscode.Uri;

  /** Raw bytes of the current archive (kept in sync with edits). */
  private _archiveBytes: Uint8Array;

  /** Parsed archive content (resolved after the first open). */
  private _content: OpenedArchive | undefined;

  /** The in-memory markdown text (may differ from disk if the user has edited). */
  private _currentMarkdown: string = '';

  /** True when there are unsaved changes. */
  private _isDirty: boolean = false;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  /** Fired whenever the document changes (edit or external reload). */
  public readonly onDidChange = this._onDidChange.event;

  private constructor(uri: vscode.Uri, bytes: Uint8Array) {
    this.uri = uri;
    this._archiveBytes = bytes;
  }

  /** Factory — reads the file from disk and parses the archive. */
  public static async create(uri: vscode.Uri): Promise<MdzDocument> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const doc = new MdzDocument(uri, bytes);
    await doc._reload(bytes);
    return doc;
  }

  /** Reload archive content from the provided bytes. */
  private async _reload(bytes: Uint8Array): Promise<void> {
    this._archiveBytes = bytes;
    this._content = await openMdzArchive(bytes);
    this._currentMarkdown = this._content.markdownText;
    this._isDirty = false;
  }

  /** Return the parsed archive content. */
  public get content(): OpenedArchive {
    if (!this._content) throw new Error('Archive content not loaded yet.');
    return this._content;
  }

  /** Return the current (possibly edited) markdown text. */
  public get currentMarkdown(): string {
    return this._currentMarkdown;
  }

  /** Apply an edit from the webview (new markdown text). */
  public edit(newMarkdown: string): void {
    this._currentMarkdown = newMarkdown;
    this._isDirty = true;
    this._onDidChange.fire();
  }

  /** Persist unsaved changes to disk. */
  public async save(): Promise<void> {
    await this.saveAs(this.uri);
    this._isDirty = false;
  }

  /** Persist the document to a different URI (Save As). */
  public async saveAs(target: vscode.Uri): Promise<void> {
    const newBytes = await updateMarkdownInArchive(
      this._archiveBytes,
      this._content!.entryPoint,
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
    await this._reload(bytes);
    this._onDidChange.fire();
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
