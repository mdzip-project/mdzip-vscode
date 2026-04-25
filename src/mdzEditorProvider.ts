import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MdzDocument } from './mdzDocument';

/**
 * Custom editor provider for `.mdz` files.
 *
 * Implements VS Code's `CustomEditorProvider` to handle the full lifecycle:
 * open → display → edit → save → revert → close.
 */
export class MdzEditorProvider implements vscode.CustomEditorProvider<MdzDocument> {
  public static readonly VIEW_TYPE = 'mdzip.mdzEditor';

  /** Register the provider and return a disposable. */
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      MdzEditorProvider.VIEW_TYPE,
      new MdzEditorProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  private constructor(private readonly context: vscode.ExtensionContext) {}

  // -------------------------------------------------------------------------
  // CustomEditorProvider interface
  // -------------------------------------------------------------------------

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
    vscode.CustomDocumentEditEvent<MdzDocument>
  >();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  public async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<MdzDocument> {
    const doc = await MdzDocument.create(uri);
    return doc;
  }

  public async resolveCustomEditor(
    document: MdzDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this._buildWebviewHtml(webviewPanel.webview, document);

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.type) {
        case 'edit':
          document.edit(message.markdown);
          this._onDidChangeCustomDocument.fire({
            document,
            undo: () => {
              /* no-op for now */
            },
            redo: () => {
              /* no-op for now */
            },
          });
          break;

        case 'ready':
          // Webview is ready — send initial content
          await this._sendDocumentContent(webviewPanel.webview, document);
          break;
      }
    });

    // When the document changes externally (revert), refresh the webview
    const changeSubscription = document.onDidChange(async () => {
      await this._sendDocumentContent(webviewPanel.webview, document);
    });
    webviewPanel.onDidDispose(() => changeSubscription.dispose());
  }

  public async saveCustomDocument(
    document: MdzDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.save();
  }

  public async saveCustomDocumentAs(
    document: MdzDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.saveAs(destination);
  }

  public async revertCustomDocument(
    document: MdzDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    await document.revert();
  }

  public async backupCustomDocument(
    document: MdzDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    return document.backup(context.destination);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Send the current document content to the webview. */
  private async _sendDocumentContent(
    webview: vscode.Webview,
    document: MdzDocument
  ): Promise<void> {
    const content = document.content;
    // Convert image Map to a plain object for JSON serialisation
    const images: Record<string, string> = {};
    for (const [k, v] of content.images) {
      images[k] = v;
    }
    await webview.postMessage({
      type: 'load',
      markdown: document.currentMarkdown,
      entryPoint: content.entryPoint,
      manifest: content.manifest,
      images,
      paths: content.paths,
    } satisfies LoadMessage);
  }

  /** Build the HTML for the webview panel. */
  private _buildWebviewHtml(webview: vscode.Webview, _document: MdzDocument): string {
    const mediaDir = path.join(this.context.extensionPath, 'media');

    // Read bundled CSS and JS from the media directory
    const cssPath = path.join(mediaDir, 'editor.css');
    const jsPath = path.join(mediaDir, 'editor.js');
    const markedPath = path.join(this.context.extensionPath, 'node_modules', 'marked', 'marked.min.js');

    const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
    const editorJs = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
    const markedJs = fs.existsSync(markedPath) ? fs.readFileSync(markedPath, 'utf8') : '';

    // Build nonce for CSP
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src data: ${webview.cspSource};
                 style-src 'nonce-${nonce}';
                 script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MDZip Editor</title>
  <style nonce="${nonce}">${css}</style>
</head>
<body>
  <div id="toolbar">
    <span id="file-label"></span>
    <div id="toolbar-buttons">
      <button id="btn-preview" class="active" title="Preview (rendered)">Preview</button>
      <button id="btn-edit" title="Edit source Markdown">Edit</button>
    </div>
  </div>

  <div id="preview-pane" class="pane active">
    <div id="preview-content"></div>
  </div>

  <div id="edit-pane" class="pane">
    <textarea id="editor" spellcheck="false"></textarea>
  </div>

  <script nonce="${nonce}">${markedJs}</script>
  <script nonce="${nonce}">${editorJs}</script>
</body>
</html>`;
  }
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface WebviewMessage {
  type: 'ready' | 'edit';
  markdown: string;
}

interface LoadMessage {
  type: 'load';
  markdown: string;
  entryPoint: string;
  manifest: unknown;
  images: Record<string, string>;
  paths: Array<{ path: string; isMarkdown: boolean; isImage: boolean }>;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
