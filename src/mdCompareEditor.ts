// "Compare Changes": a custom text editor for an .md file that shows the
// file's current text against an older version, rendered or as source. The
// older version is a git version (HEAD by default), the file as saved on disk,
// or another file. Because it edits the file's own TextDocument, VS Code provides the
// rest: File > Save, the dirty dot, auto save, revert, undo, the close prompt,
// the breadcrumbs and the editor picker ("Reopen Editor With...").
import * as path from 'path';
import * as vscode from 'vscode';
import {
  MdzDiffPanel,
  buildDiffHtml,
  toWebviewSide,
  type DiffWebviewLoadMessage,
  type MdzDiffSideInput,
} from './mdzDiffPanel';
import { markdownVersionSource, normalizeLineEndings, readSavedText, refLabel } from './mdGitSource';

/** Serves an .md file's saved (on-disk) text, as the left side of "Open Text Diff". */
const SAVED_SCHEME = 'mdzip-saved';

export interface CompareTarget {
  /**
   * What the left side is: a git version, the file as saved on disk, or
   * another file. Unset: git when the file is in a repository, else saved.
   */
  readonly kind?: 'git' | 'saved' | 'file';
  /** Git ref of the old side: a commit-ish, or '~' for the index. Defaults to HEAD. */
  readonly beforeRef?: string;
  /** Git: path of the old version when it differs (a rename). File: the file to compare with. */
  readonly beforeFilePath?: string;
  /** Open rendered (or as source) instead of the remembered choice. */
  readonly rendered?: boolean;
}

function keyFor(uri: vscode.Uri): string {
  const value = uri.toString();
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

export class MdCompareEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly VIEW_TYPE = 'mdzip.mdCompare';
  private static instance: MdCompareEditorProvider | undefined;

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MdCompareEditorProvider(context.extensionUri);
    MdCompareEditorProvider.instance = provider;
    return vscode.Disposable.from(
      vscode.window.registerCustomEditorProvider(MdCompareEditorProvider.VIEW_TYPE, provider, {
        webviewOptions: { retainContextWhenHidden: true, enableFindWidget: true },
        supportsMultipleEditorsPerDocument: false,
      }),
      vscode.workspace.registerTextDocumentContentProvider(SAVED_SCHEME, {
        provideTextDocumentContent: async (uri) => await readSavedText(uri.fsPath) ?? '',
      })
    );
  }

  /** Opens (or re-targets and reveals) the comparison for an .md file. */
  public static async open(uri: vscode.Uri, target: CompareTarget): Promise<void> {
    const provider = MdCompareEditorProvider.instance;
    if (!provider) throw new Error('The MDZip comparison editor is not registered');
    const key = keyFor(uri);
    const session = provider.sessions.get(key);
    if (session) {
      session.retarget(target);
    } else {
      provider.pending.set(key, target);
    }
    await vscode.commands.executeCommand('vscode.openWith', uri, MdCompareEditorProvider.VIEW_TYPE);
  }

  /**
   * Opens VS Code's text diff of the same two versions as the comparison open
   * for `uri`: the older version on the left, the file on the right.
   */
  public static async openTextDiff(uri: vscode.Uri): Promise<void> {
    const session = MdCompareEditorProvider.instance?.sessions.get(keyFor(uri));
    const target: CompareTarget = session?.currentTarget ?? { kind: 'git' };
    const name = path.basename(uri.fsPath);
    let left: vscode.Uri;
    let leftLabel: string;
    if (target.kind === 'saved') {
      left = vscode.Uri.file(uri.fsPath).with({ scheme: SAVED_SCHEME });
      leftLabel = 'Saved';
    } else if (target.kind === 'file' && target.beforeFilePath) {
      left = vscode.Uri.file(target.beforeFilePath);
      leftLabel = path.basename(target.beforeFilePath);
    } else {
      const beforePath = target.beforeFilePath ?? uri.fsPath;
      const ref = target.beforeRef ?? 'HEAD';
      // The URI form VS Code's Git extension reads versions from ('~' is the index).
      left = vscode.Uri.file(beforePath).with({
        scheme: 'git',
        query: JSON.stringify({ path: beforePath, ref }),
      });
      leftLabel = refLabel(ref);
    }
    const rightLabel = target.kind === 'saved' || target.kind === 'file' ? 'Current' : 'Working Tree';
    await vscode.commands.executeCommand(
      '_workbench.diff',
      left,
      uri,
      `${name} (${leftLabel} ↔ ${rightLabel})`,
      // The default override keeps it in the text diff, not a custom editor.
      [vscode.ViewColumn.Active, { preview: true, override: 'default' }]
    );
  }

  /**
   * Turns a diff whose sides opened in this editor (VS Code or GitLens showing
   * an older version, a `git:` or `gitlens:` document, beside the file) into
   * one comparison of that version with the file. Set by the extension to the
   * MDZip Markdown editor's handling of the same case; true when it took over.
   */
  public static revisionRedirect: ((uri: vscode.Uri, panel: vscode.WebviewPanel) => boolean) | undefined;

  /** What the next open of a file compares against; set just before opening it. */
  private readonly pending = new Map<string, CompareTarget>();
  private readonly sessions = new Map<string, CompareSession>();

  private constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    if (document.uri.scheme !== 'file' && MdCompareEditorProvider.revisionRedirect?.(document.uri, panel)) {
      return;
    }
    const key = keyFor(document.uri);
    // The file's side of a diff tab (Source Control, GitLens) that was opened
    // in this editor: the other side, a git version, replaces the tab with one
    // comparison once it opens. While VS Code starts, that waits for the Git
    // extension, so show "Loading" rather than a comparison about to go away.
    // Checked again when the webview is ready, in case the tabs weren't listed yet.
    const holdMs = this.pending.has(key) ? 0 : inDiffTab(document.uri) ? DIFF_SIDE_HOLD_MS : -1;
    // Opened from the editor picker: compare with HEAD, or the saved file outside git.
    const target = this.pending.get(key) ?? {};
    this.pending.delete(key);
    const session = new CompareSession(document, panel, this.extensionUri, target, holdMs);
    this.sessions.set(key, session);
    panel.onDidDispose(() => {
      if (this.sessions.get(key) === session) this.sessions.delete(key);
    });
  }
}

/** How long the file's side of a diff tab waits to be replaced before showing its own comparison. */
const DIFF_SIDE_HOLD_MS = 15000;

/**
 * Whether a diff tab of this file is open. VS Code labels one "<name> (Working
 * Tree)", "<name> (1953930) ↔ <name>" and so on; a diff whose sides are custom
 * editors has no tab input, or a text-diff one when restored at startup. A
 * plain editor tab of the file (this one included) is just "<name>".
 */
function inDiffTab(uri: vscode.Uri): boolean {
  const prefix = `${path.basename(uri.fsPath)} (`.toLowerCase();
  return vscode.window.tabGroups.all
    .flatMap(group => group.tabs)
    .some(tab =>
      !(tab.input instanceof vscode.TabInputCustom)
      && !(tab.input instanceof vscode.TabInputText)
      && tab.label.toLowerCase().startsWith(prefix));
}

class CompareSession {
  private ready = false;
  /** Whether the webview has been sent a comparison. */
  private loaded = false;
  private disposed = false;
  /** The working text the webview has, so changes it made aren't sent back to it. */
  private webviewText: string;
  /** Edits from the webview being applied; document changes meanwhile are its own. */
  private applying = 0;
  private edits: Promise<void> = Promise.resolve();
  private sides: { before?: MdzDiffSideInput; after?: MdzDiffSideInput } = {};
  private resolved: CompareTarget | undefined;

  public constructor(
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private target: CompareTarget,
    private holdMs = 0
  ) {
    this.webviewText = normalizeLineEndings(document.getText());
    panel.webview.options = { enableScripts: true };
    panel.webview.html = buildDiffHtml(panel.webview, extensionUri, path.basename(document.uri.fsPath));
    const subscriptions = [
      panel.webview.onDidReceiveMessage((event: unknown) => { void this.onMessage(event); }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === document) this.documentChanged();
      }),
      // Compared with the saved file: saving moves that side on.
      vscode.workspace.onDidSaveTextDocument((saved) => {
        if (saved === document && this.resolved?.kind === 'saved') void this.post(true);
      }),
    ];
    panel.onDidDispose(() => {
      this.disposed = true;
      subscriptions.forEach(subscription => subscription.dispose());
    });
  }

  /** The target with its kind settled (known once the comparison has loaded). */
  public get currentTarget(): CompareTarget {
    return this.resolved ?? this.target;
  }

  public retarget(target: CompareTarget): void {
    this.target = target;
    this.holdMs = 0;
    void this.post(false);
  }

  private async onMessage(event: unknown): Promise<void> {
    if (!event || typeof event !== 'object' || !('type' in event)) return;
    const message = event as { type: unknown; [key: string]: unknown };
    switch (message.type) {
      case 'ready':
        this.ready = true;
        if (this.holdMs < 0) this.holdMs = inDiffTab(this.document.uri) ? DIFF_SIDE_HOLD_MS : 0;
        if (this.holdMs > 0) {
          // Usually disposed before this fires, when the diff tab is replaced.
          setTimeout(() => { if (!this.loaded && !this.disposed) void this.post(false); }, this.holdMs);
        } else {
          await this.post(false);
        }
        break;
      case 'refresh':
        await this.edits;
        await this.post(true);
        break;
      case 'readResource':
        await this.answerResource(message as { id?: unknown; side?: unknown; path?: unknown });
        break;
      case 'renderedChanged':
        await MdzDiffPanel.rememberRendered(message.rendered === true);
        break;
      case 'markdownEdited':
        if (message.side === 'after' && typeof message.text === 'string') {
          this.webviewText = message.text;
          this.queueEdit(message.text);
        }
        break;
      case 'save':
        // Ctrl+S in the webview: VS Code saves too, but this one waits for the last edits.
        await this.edits;
        if (this.document.isDirty) await this.document.save();
        break;
      case 'failed':
        console.error(`[MDZip] Comparison failed: ${String(message.message)}`);
        break;
    }
  }

  private queueEdit(text: string): void {
    this.applying += 1;
    this.edits = this.edits
      .then(() => applyText(this.document, text))
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`MDZip: could not apply the edit: ${detail}`);
      })
      .finally(() => {
        this.applying -= 1;
        // Anything that changed the document meanwhile (or a failed edit) now goes to the webview.
        if (this.applying === 0) this.documentChanged();
      });
  }

  /** The document changed: a text editor, undo, revert, a formatter. Show it in place. */
  private documentChanged(): void {
    if (this.applying > 0 || !this.ready || !this.loaded) return;
    const text = normalizeLineEndings(this.document.getText());
    if (text === this.webviewText) return;
    this.webviewText = text;
    void this.panel.webview.postMessage({ type: 'updateMarkdown', side: 'after', text });
  }

  private async post(keepMode: boolean): Promise<void> {
    if (!this.ready) return;
    const filePath = this.document.uri.fsPath;
    const source = await markdownVersionSource(this.document.uri);
    const kind = this.target.kind ?? (source.git ? 'git' : 'saved');
    this.resolved = { ...this.target, kind };
    let before: MdzDiffSideInput;
    if (kind === 'saved') {
      before = {
        label: 'Saved',
        uri: this.document.uri,
        markdown: await readSavedText(filePath),
        readResource: source.imageReader(undefined, filePath),
        missingMessage: 'This file has not been saved yet.',
      };
    } else if (kind === 'file') {
      const otherPath = this.target.beforeFilePath ?? filePath;
      before = {
        label: path.basename(otherPath),
        uri: vscode.Uri.file(otherPath),
        markdown: await source.loadText(undefined, otherPath),
        readResource: source.imageReader(undefined, otherPath),
        missingMessage: `${path.basename(otherPath)} could not be read.`,
      };
    } else {
      const ref = this.target.beforeRef ?? 'HEAD';
      const beforePath = this.target.beforeFilePath ?? filePath;
      const beforeLabel = refLabel(ref);
      before = {
        label: beforeLabel,
        uri: vscode.Uri.file(beforePath),
        markdown: await source.loadText(ref, beforePath),
        readResource: source.imageReader(ref, beforePath),
        missingMessage: source.git
          ? `This file has no ${beforeLabel} version. It may be new, untracked, or renamed.`
          : 'This file is not in a git repository, so there is no committed version to compare with.',
      };
    }
    const afterText = normalizeLineEndings(this.document.getText());
    this.webviewText = afterText;
    this.sides = {
      before,
      after: {
        label: kind === 'git' ? 'Working Tree' : 'Current',
        uri: this.document.uri,
        markdown: afterText,
        readResource: source.imageReader(undefined, filePath),
        editable: true,
      },
    };
    // Name the comparison in the tab, as VS Code's diff tabs do ("(Working Tree)").
    this.panel.title = `${path.basename(filePath)} (${before.label} ↔ ${this.sides.after!.label})`;
    const message: DiffWebviewLoadMessage = {
      type: 'loadDiff',
      before: toWebviewSide(this.sides.before!),
      after: toWebviewSide(this.sides.after!),
      rendered: this.target.rendered ?? MdzDiffPanel.rememberedRendered(),
      keepMode,
    };
    this.loaded = true;
    await this.panel.webview.postMessage(message);
  }

  private async answerResource(message: { id?: unknown; side?: unknown; path?: unknown }): Promise<void> {
    if (typeof message.id !== 'number' || typeof message.path !== 'string') return;
    const side = message.side === 'before' ? this.sides.before : message.side === 'after' ? this.sides.after : undefined;
    let bytes: Uint8Array | undefined;
    try {
      bytes = await side?.readResource?.(message.path);
    } catch {
      bytes = undefined;
    }
    await this.panel.webview.postMessage({
      type: 'resource',
      id: message.id,
      bytesBase64: bytes ? Buffer.from(bytes).toString('base64') : undefined,
    });
  }
}

/**
 * Applies the webview's full text to the document, replacing only the changed
 * middle (so VS Code's undo steps stay small) and keeping its line endings.
 */
async function applyText(document: vscode.TextDocument, text: string): Promise<void> {
  const next = document.eol === vscode.EndOfLine.CRLF ? text.replace(/\n/g, '\r\n') : text;
  const current = document.getText();
  if (current === next) return;
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start++;
  let endCurrent = current.length;
  let endNext = next.length;
  while (endCurrent > start && endNext > start && current[endCurrent - 1] === next[endNext - 1]) {
    endCurrent--;
    endNext--;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(document.positionAt(start), document.positionAt(endCurrent)),
    next.slice(start, endNext)
  );
  if (!await vscode.workspace.applyEdit(edit)) {
    throw new Error(`${path.basename(document.uri.fsPath)} could not be changed`);
  }
}
