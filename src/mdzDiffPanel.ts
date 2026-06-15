import * as path from 'path';
import * as vscode from 'vscode';

export interface MdzDiffSideInput {
  readonly label: string;
  readonly uri: vscode.Uri;
  readonly bytes?: Uint8Array;
  readonly loadBytes?: () => Promise<Uint8Array | undefined>;
  readonly missingMessage?: string;
}

export interface MdzDiffInput {
  readonly title: string;
  readonly resourceUri?: vscode.Uri;
  readonly before: MdzDiffSideInput;
  readonly after: MdzDiffSideInput;
}

interface DiffWebviewSide {
  readonly label: string;
  readonly fileName: string;
  readonly bytesBase64?: string;
  readonly missingMessage?: string;
}

interface DiffWebviewLoadMessage {
  readonly type: 'loadDiff';
  readonly before: DiffWebviewSide;
  readonly after: DiffWebviewSide;
}

/**
 * Read-only semantic diff panel for comparing two MDZip archives.
 */
export class MdzDiffPanel {
  private static readonly panels = new Map<string, MdzDiffPanel>();

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
      existing.panel.title = input.title;
      existing.panel.reveal(vscode.ViewColumn.Active);
      await existing.postInput();
      return;
    }

    const instance = new MdzDiffPanel(key, input, extensionUri);
    MdzDiffPanel.panels.set(key, instance);
  }

  private readonly panel: vscode.WebviewPanel;
  private ready = false;

  private constructor(
    private readonly key: string,
    private input: MdzDiffInput,
    extensionUri: vscode.Uri
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'mdzip.diff',
      input.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
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
        await this.postInput();
      } else if (typedEvent.type === 'refresh') {
        await this.refresh();
      } else if (typedEvent.type === 'failed') {
        const detail = typeof typedEvent.message === 'string'
          ? typedEvent.message
          : 'Unknown diff view error';
        console.error(`[MDZip] Diff view failed: ${detail}`);
      }
    });
    this.panel.onDidDispose(() => {
      subscription.dispose();
      if (MdzDiffPanel.panels.get(this.key) === this) {
        MdzDiffPanel.panels.delete(this.key);
      }
    });
  }

  private async refresh(): Promise<void> {
    const [beforeBytes, afterBytes] = await Promise.all([
      loadSideBytes(this.input.before),
      loadSideBytes(this.input.after),
    ]);
    this.input = {
      ...this.input,
      before: { ...this.input.before, bytes: beforeBytes },
      after: { ...this.input.after, bytes: afterBytes },
    };
    await this.postInput();
  }

  private async postInput(): Promise<void> {
    if (!this.ready) {
      return;
    }
    const message: DiffWebviewLoadMessage = {
      type: 'loadDiff',
      before: toWebviewSide(this.input.before),
      after: toWebviewSide(this.input.after),
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

async function loadSideBytes(input: MdzDiffSideInput): Promise<Uint8Array | undefined> {
  if (input.loadBytes) {
    return input.loadBytes();
  }
  try {
    return await vscode.workspace.fs.readFile(input.uri);
  } catch {
    return undefined;
  }
}

function toWebviewSide(input: MdzDiffSideInput): DiffWebviewSide {
  return {
    label: input.label,
    fileName: path.posix.basename(input.uri.path)
      || path.basename(input.uri.fsPath || input.label),
    bytesBase64: input.bytes
      ? Buffer.from(input.bytes).toString('base64')
      : undefined,
    missingMessage: input.missingMessage,
  };
}

function buildDiffHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  title: string
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'diff.bundle.js')
  );
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src blob: data:;
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
  <div id="mdzip-diff-loading">Loading archive comparison...</div>
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
