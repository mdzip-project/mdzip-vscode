import * as path from 'path';
import * as vscode from 'vscode';
import { readArchiveBytes } from './mdzBytes';

export interface MdzDiffSideInput {
  readonly label: string;
  readonly uri: vscode.Uri;
  readonly bytes?: Uint8Array;
  readonly loadBytes?: () => Promise<Uint8Array | undefined>;
  /** Plain Markdown text for this side (an `.md` file) instead of archive bytes. */
  readonly markdown?: string;
  /** Reloads `markdown` on refresh. */
  readonly loadMarkdown?: () => Promise<string | undefined>;
  /**
   * For a Markdown side: reads a file the document links to (its images),
   * given the path relative to the document's folder.
   */
  readonly readResource?: (path: string) => Promise<Uint8Array | undefined>;
  /** A Markdown side the source view lets the user edit (the Compare with Git editor's working side). */
  readonly editable?: boolean;
  readonly missingMessage?: string;
}

export interface MdzDiffInput {
  /** The tab title; a Markdown comparison adds (Rendered) or (Source). */
  readonly title: string;
  readonly resourceUri?: vscode.Uri;
  readonly before: MdzDiffSideInput;
  readonly after: MdzDiffSideInput;
  /** Open rendered (or as source) regardless of the remembered choice. */
  readonly rendered?: boolean;
}

type DiffSideName = 'before' | 'after';

export interface DiffWebviewSide {
  readonly label: string;
  readonly fileName: string;
  readonly bytesBase64?: string;
  readonly markdown?: string;
  /** The extension can read this side's linked images (`readResource` messages). */
  readonly hasResources?: boolean;
  /** The source view lets the user edit this side (`markdownEdited` messages). */
  readonly editable?: boolean;
  readonly missingMessage?: string;
}

export interface DiffWebviewLoadMessage {
  readonly type: 'loadDiff';
  readonly before: DiffWebviewSide;
  readonly after: DiffWebviewSide;
  /** Show Markdown rendered instead of as source; the last choice, remembered. */
  readonly rendered: boolean;
  /** A refresh: keep the view mode the webview has now. */
  readonly keepMode: boolean;
}

const RENDERED_PREFERENCE_KEY = 'mdzip.diff.rendered';

/**
 * Read-only comparison panel: two `.mdz` archives, or two git versions of an
 * `.md` (staged changes). An `.md` against its working tree opens in the
 * Compare with Git editor instead (mdCompareEditor.ts).
 */
export class MdzDiffPanel {
  private static readonly panels = new Map<string, MdzDiffPanel>();
  private static preferences: vscode.Memento | undefined;

  /** Where the rendered/source choice is remembered (the extension's global state). */
  public static usePreferences(memento: vscode.Memento): void {
    MdzDiffPanel.preferences = memento;
  }

  /** The remembered rendered/source choice, shared by every comparison. */
  public static rememberedRendered(): boolean {
    return MdzDiffPanel.preferences?.get<boolean>(RENDERED_PREFERENCE_KEY, false) ?? false;
  }

  public static async rememberRendered(rendered: boolean): Promise<void> {
    await MdzDiffPanel.preferences?.update(RENDERED_PREFERENCE_KEY, rendered);
  }

  public static hasForFilePath(filePath: string): boolean {
    return MdzDiffPanel.panels.has(diffPanelKeyForUri(vscode.Uri.file(filePath)));
  }

  public static revealForFilePath(filePath: string): boolean {
    const existing = MdzDiffPanel.panels.get(diffPanelKeyForUri(vscode.Uri.file(filePath)));
    if (!existing) {
      return false;
    }
    existing.panel.reveal(vscode.ViewColumn.Active);
    return true;
  }

  public static async open(
    input: MdzDiffInput,
    extensionUri: vscode.Uri
  ): Promise<void> {
    const key = diffPanelKey(input);
    const existing = MdzDiffPanel.panels.get(key);
    if (existing) {
      existing.input = input;
      existing.rendered = existing.initialRendered();
      existing.updateTitle();
      existing.panel.reveal(vscode.ViewColumn.Active);
      await existing.postInput(false);
      return;
    }

    const instance = new MdzDiffPanel(key, input, extensionUri);
    MdzDiffPanel.panels.set(key, instance);
  }

  private readonly panel: vscode.WebviewPanel;
  private ready = false;
  private disposed = false;
  /** What the webview shows now, for the title. */
  private rendered: boolean;

  private constructor(
    private readonly key: string,
    private input: MdzDiffInput,
    extensionUri: vscode.Uri
  ) {
    this.rendered = this.initialRendered();
    this.panel = vscode.window.createWebviewPanel(
      'mdzip.diff',
      this.titleText(),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true,
      }
    );

    this.panel.webview.html = buildDiffHtml(this.panel.webview, extensionUri, input.title);
    const subscription = this.panel.webview.onDidReceiveMessage(async (event: unknown) => {
      if (!event || typeof event !== 'object' || !('type' in event)) {
        return;
      }

      const typedEvent = event as { type: unknown; message?: unknown };
      if (typedEvent.type === 'ready') {
        this.ready = true;
        await this.postInput(false);
      } else if (typedEvent.type === 'refresh') {
        await this.refresh();
      } else if (typedEvent.type === 'readResource') {
        await this.answerResource(event as { id?: unknown; side?: unknown; path?: unknown });
      } else if (typedEvent.type === 'renderedChanged') {
        const rendered = (event as { rendered?: unknown }).rendered === true;
        this.rendered = rendered;
        this.updateTitle();
        await MdzDiffPanel.rememberRendered(rendered);
      } else if (typedEvent.type === 'renderedState') {
        this.rendered = (event as { rendered?: unknown }).rendered === true;
        this.updateTitle();
      } else if (typedEvent.type === 'failed') {
        const detail = typeof typedEvent.message === 'string'
          ? typedEvent.message
          : 'Unknown diff view error';
        console.error(`[MDZip] Diff view failed: ${detail}`);
      }
    });
    this.panel.onDidDispose(() => {
      this.disposed = true;
      subscription.dispose();
      if (MdzDiffPanel.panels.get(this.key) === this) {
        MdzDiffPanel.panels.delete(this.key);
      }
    });
  }

  private initialRendered(): boolean {
    return this.input.rendered ?? MdzDiffPanel.rememberedRendered();
  }

  private isMarkdownComparison(): boolean {
    return [this.input.before, this.input.after]
      .some(side => side.markdown !== undefined || side.loadMarkdown !== undefined);
  }

  private titleText(): string {
    const mode = this.isMarkdownComparison() ? (this.rendered ? ' (Rendered)' : ' (Source)') : '';
    return `${this.input.title}${mode}`;
  }

  private updateTitle(): void {
    if (this.disposed) return;
    this.panel.title = this.titleText();
  }

  private async refresh(): Promise<void> {
    const [before, after] = await Promise.all([
      reloadSide(this.input.before),
      reloadSide(this.input.after),
    ]);
    this.input = { ...this.input, before, after };
    await this.postInput(true);
  }

  /** Answers the webview's request for an image linked from a Markdown side. */
  private async answerResource(event: { id?: unknown; side?: unknown; path?: unknown }): Promise<void> {
    if (typeof event.id !== 'number' || typeof event.path !== 'string') return;
    const side = event.side === 'before' || event.side === 'after'
      ? this.input[event.side as DiffSideName]
      : undefined;
    let bytes: Uint8Array | undefined;
    try {
      bytes = await side?.readResource?.(event.path);
    } catch {
      bytes = undefined;
    }
    await this.panel.webview.postMessage({
      type: 'resource',
      id: event.id,
      bytesBase64: bytes ? Buffer.from(bytes).toString('base64') : undefined,
    });
  }

  private async postInput(keepMode: boolean): Promise<void> {
    if (!this.ready) {
      return;
    }
    const message: DiffWebviewLoadMessage = {
      type: 'loadDiff',
      before: toWebviewSide(this.input.before),
      after: toWebviewSide(this.input.after),
      rendered: keepMode ? this.rendered : this.initialRendered(),
      keepMode,
    };
    await this.panel.webview.postMessage(message);
  }
}

function diffPanelKey(input: MdzDiffInput): string {
  const uri = input.resourceUri
    ?? (input.after.uri.path ? input.after.uri : input.before.uri);
  return diffPanelKeyForUri(uri);
}

function diffPanelKeyForUri(uri: vscode.Uri): string {
  const value = `${uri.scheme}:${uri.authority}:${uri.path}`;
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

async function reloadSide(input: MdzDiffSideInput): Promise<MdzDiffSideInput> {
  if (input.markdown !== undefined || input.loadMarkdown) {
    const markdown = input.loadMarkdown ? await input.loadMarkdown() : input.markdown;
    return { ...input, markdown };
  }
  return { ...input, bytes: await loadSideBytes(input) };
}

async function loadSideBytes(input: MdzDiffSideInput): Promise<Uint8Array | undefined> {
  if (input.loadBytes) {
    return input.loadBytes();
  }
  try {
    return await readArchiveBytes(input.uri);
  } catch {
    return undefined;
  }
}

export function toWebviewSide(input: MdzDiffSideInput): DiffWebviewSide {
  return {
    label: input.label,
    fileName: path.posix.basename(input.uri.path)
      || path.basename(input.uri.fsPath || input.label),
    bytesBase64: input.bytes && input.markdown === undefined
      ? Buffer.from(input.bytes).toString('base64')
      : undefined,
    markdown: input.markdown,
    hasResources: input.markdown !== undefined && Boolean(input.readResource),
    editable: input.markdown !== undefined && input.editable === true,
    missingMessage: input.missingMessage,
  };
}

export function buildDiffHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  title: string,
  /** The merge-conflict panel uses the same page with its own script. */
  page: { script: string; loadingText: string } = { script: 'diff.bundle.js', loadingText: 'Loading comparison...' }
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', page.script)
  );
  const nonce = getNonce();
  // Same remote-image rule as the editor (mdzip.remoteImages).
  const remoteImages = vscode.workspace.getConfiguration('mdzip').get<boolean>('remoteImages', false) ? ' https:' : '';

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src blob: data:${remoteImages};
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body {
      --mdzip-foreground-color: var(--vscode-foreground);
      --mdzip-background-color: var(--vscode-editor-background);
      --mdzip-muted-foreground-color: var(--vscode-descriptionForeground);
      --mdzip-border-color: var(--vscode-panel-border);
      --mdzip-hover-background-color: var(--vscode-list-hoverBackground);
      --mdzip-accent-color: var(--vscode-focusBorder);
      overflow: hidden;
    }
    #mdzip-diff-loading {
      align-items: center;
      color: var(--vscode-descriptionForeground);
      display: flex;
      height: 100%;
      justify-content: center;
    }
    #mdzip-diff-loading[hidden],
    #mdzip-diff-root[hidden] {
      display: none;
    }
    #mdzip-diff-root {
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="mdzip-diff-loading">${escapeHtml(page.loadingText)}</div>
  <main id="mdzip-diff-root" hidden></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index++) {
    value += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
