import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MdzDocument } from './mdzDocument';
import { buildNewArchiveBytesWithTitle } from './mdzArchiveUtils';
import {
  displayTitleFromManifest,
  fileBaseNameFromPath,
  firstMarkdownHeading,
  suggestedTitleFromMarkdown,
} from './shared/editorMetadata';

/**
 * Custom editor provider for `.mdz` files.
 *
 * Implements VS Code's `CustomEditorProvider` to handle the full lifecycle:
 * open → display → edit → save → revert → close.
 */
export class MdzEditorProvider implements vscode.CustomEditorProvider<MdzDocument> {
  public static readonly VIEW_TYPE = 'mdzip.mdzEditor';
  public static readonly MARKDOWN_VIEW_TYPE = 'mdzip.mdEditor';
  private static readonly _nextOpenModes = new Map<string, EditorMode[]>();
  private static _instance: MdzEditorProvider | undefined;
  private readonly _panelsByDocument = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly _modeByWebview = new WeakMap<vscode.Webview, EditorMode>();
  private readonly _isMarkdownEditorByWebview = new WeakMap<vscode.Webview, boolean>();
  private readonly _splitLayoutUris = new Set<string>();

  /** Hint that the next open for this URI should start in source edit mode. */
  public static markNextOpenInEdit(uri: vscode.Uri): void {
    MdzEditorProvider.enqueueInitialModes(uri, ['edit']);
  }

  /** Hint that the next open for this URI should start in preview mode. */
  public static markNextOpenInPreview(uri: vscode.Uri): void {
    MdzEditorProvider.enqueueInitialModes(uri, ['preview']);
  }

  /** Queue one or more initial modes for upcoming editor resolves on a URI. */
  public static enqueueInitialModes(uri: vscode.Uri, modes: EditorMode[]): void {
    const key = uri.toString();
    const existing = MdzEditorProvider._nextOpenModes.get(key) ?? [];
    MdzEditorProvider._nextOpenModes.set(key, [...existing, ...modes]);
  }

  /** Close all open MDZip custom-editor panes for a given URI. */
  public static async closeAllEditorsForUri(uri: vscode.Uri): Promise<void> {
    await MdzEditorProvider._instance?._closeAllEditorsForUri(uri);
  }

  /** Open two panes for a URI, one Edit and one Preview. */
  public static async openSideBySideForUri(uri: vscode.Uri): Promise<void> {
    await MdzEditorProvider._instance?._openSideBySideForUri(uri);
  }

  private static consumeInitialMode(uri: vscode.Uri): EditorMode | undefined {
    const key = uri.toString();
    const queue = MdzEditorProvider._nextOpenModes.get(key);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const nextMode = queue.shift();
    if (!nextMode || queue.length === 0) {
      MdzEditorProvider._nextOpenModes.delete(key);
    } else {
      MdzEditorProvider._nextOpenModes.set(key, queue);
    }
    return nextMode;
  }

  /** Register the provider and return a disposable. */
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MdzEditorProvider(context);
    MdzEditorProvider._instance = provider;
    const registrationOptions = {
      webviewOptions: {
        enableFindWidget: true,
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: true,
    };

    const registrations = [
      vscode.window.registerCustomEditorProvider(
        MdzEditorProvider.VIEW_TYPE,
        provider,
        registrationOptions
      ),
      vscode.window.registerCustomEditorProvider(
        MdzEditorProvider.MARKDOWN_VIEW_TYPE,
        provider,
        registrationOptions
      ),
    ];

    return vscode.Disposable.from(
      ...registrations,
      new vscode.Disposable(() => {
        if (MdzEditorProvider._instance === provider) {
          MdzEditorProvider._instance = undefined;
        }
      })
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
    if (!this._trackPanel(document.uri, webviewPanel)) {
      webviewPanel.dispose();
      vscode.window.showInformationMessage(
        'MDZip keeps at most two panes per document (one Edit, one Preview).'
      );
      return;
    }

    const initialMode: EditorMode =
      MdzEditorProvider.consumeInitialMode(document.uri) ?? this._suggestInitialMode(document.uri);
    this._modeByWebview.set(webviewPanel.webview, initialMode);
    this._isMarkdownEditorByWebview.set(
      webviewPanel.webview,
      webviewPanel.viewType === MdzEditorProvider.MARKDOWN_VIEW_TYPE
    );

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    webviewPanel.webview.html = this._buildWebviewHtml(webviewPanel.webview, document);

    // Handle messages from the webview
    webviewPanel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      switch (message.type) {
        case 'edit':
          if (typeof message.markdown !== 'string') {
            return;
          }
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

        case 'pasteImage':
          if (typeof message.archivePath !== 'string' || typeof message.base64Data !== 'string') {
            return;
          }
          if (document.sourceFormat === 'markdown') {
            await this._promptToConvertMarkdownForEmbeddedImage(document, {
              archivePath: message.archivePath,
              base64Data: message.base64Data,
            });
            return;
          }
          await document.addImageAsset(message.archivePath, message.base64Data);
          await this._broadcastDocumentContent(document);
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

        case 'setTitle':
          if (typeof message.title !== 'string') {
            return;
          }
          if (document.sourceFormat === 'markdown') {
            vscode.window.showInformationMessage(
              'Package titles are stored in .mdz manifests. Use "MDZip: Convert .md To .mdz" to set a package title.'
            );
            return;
          }
          try {
            await document.setTitle(message.title);
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Unable to update manifest title: ${detail}`);
            await this._sendDocumentContent(webviewPanel.webview, document);
            return;
          }
          await this._sendDocumentContent(webviewPanel.webview, document);
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

        case 'removeOrphanedAsset':
          if (typeof message.path !== 'string') {
            return;
          }
          if (document.sourceFormat === 'markdown') {
            return;
          }
          try {
            const removeLabel = 'Remove Asset';
            const selection = await vscode.window.showWarningMessage(
              `Remove orphaned asset "${message.path}" from this archive?`,
              { modal: true },
              removeLabel
            );
            if (selection !== removeLabel) {
              return;
            }
            const removed = await document.removeOrphanedAsset(message.path);
            if (!removed) {
              vscode.window.showInformationMessage(
                'That asset is no longer orphaned or could not be removed.'
              );
              await this._broadcastDocumentContent(document);
              return;
            }
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Unable to remove orphaned asset: ${detail}`);
            await this._broadcastDocumentContent(document);
            return;
          }
          await this._broadcastDocumentContent(document);
          vscode.window.showInformationMessage(
            'Removed orphaned asset. Save the archive to keep the change.'
          );
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

        case 'openPath':
          if (typeof message.path !== 'string') {
            return;
          }
          if (document.isDirty) {
            vscode.window.showWarningMessage(
              'Save or revert current edits before opening another file from the contents tree.'
            );
            return;
          }
          if (!(await document.openPath(message.path))) {
            vscode.window.showInformationMessage('That archive entry could not be opened.');
            return;
          }

          if (document.currentPathType === 'binary') {
            await this._openArchivePathWithDefaultViewer(document, message.path);
          }
          break;

        case 'modeChanged':
          if (message.mode !== 'edit' && message.mode !== 'preview') {
            return;
          }
          this._modeByWebview.set(webviewPanel.webview, message.mode);
          await this._ensureUniqueModes(document.uri, webviewPanel.webview, message.mode);
          break;

        case 'setLayout':
          if (message.layout !== 'preview' && message.layout !== 'edit' && message.layout !== 'split') {
            return;
          }
          await this._setLayoutForUri(document.uri, webviewPanel, message.layout);
          break;

        case 'scrollSync':
          if (typeof message.ratio !== 'number') {
            return;
          }
          await this._broadcastScrollSync(document.uri, webviewPanel.webview, message.ratio);
          break;

        case 'openSideBySide':
          await this._openSideBySideForUri(document.uri);
          break;

        case 'ready':
          // Webview is ready — send initial content
          await this._sendDocumentContent(webviewPanel.webview, document, initialMode);
          break;
      }
    });

    // When the document changes externally (revert), refresh the webview
    const changeSubscription = document.onDidChange(async (event) => {
      if (event.reason !== 'reload') {
        return;
      }
      await this._sendDocumentContent(webviewPanel.webview, document);
    });
    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      this._untrackPanel(document.uri, webviewPanel);
      const key = document.uri.toString();
      const remaining = this._panelsByDocument.get(key);
      if (!remaining || remaining.size === 0) {
        this._splitLayoutUris.delete(key);
      }
      void this._broadcastLayoutState(document.uri);
    });
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
    document: MdzDocument,
    initialMode?: EditorMode
  ): Promise<void> {
    const content = document.content;
    // Convert image Map to a plain object for JSON serialisation
    const images: Record<string, string> = {};
    for (const [k, v] of content.images) {
      images[k] = v;
    }
    const fileBaseName = fileBaseNameFromPath(document.uri.path);
    const headingFallback = firstMarkdownHeading(document.currentMarkdown);
    const suggestedTitle = suggestedTitleFromMarkdown(document.currentMarkdown, fileBaseName);
    const manifestTitle = await document.resolveManifestTitle();
    const displayTitle = displayTitleFromManifest(manifestTitle, fileBaseName);
    const orphanedAssetPaths = await document.findCurrentOrphanedAssetPaths();

    await webview.postMessage({
      type: 'load',
      markdown: document.currentMarkdown,
      sourceFormat: document.sourceFormat,
      isMdzFile: document.uri.path.toLowerCase().endsWith('.mdz'),
      isMarkdownEditor: this._isMarkdownEditorByWebview.get(webview) === true,
      entryPoint: content.entryPoint,
      currentPath: document.currentMarkdownPath,
      currentPathType: document.currentPathType,
      manifest: content.manifest,
      displayTitle,
      fileBaseName,
      headingFallback,
      suggestedTitle,
      images,
      paths: content.paths,
      orphanedAssetPaths,
      initialMode,
      layout: this._layoutModeForUri(document.uri, webview),
    } satisfies LoadMessage);
  }

  /** Build the HTML for the webview panel. */
  private _buildWebviewHtml(webview: vscode.Webview, document: MdzDocument): string {
    const mediaDir = path.join(this.context.extensionPath, 'media');
    const iconsDir = path.join(mediaDir, 'icons');
    const isMdzFile = document.sourceFormat === 'mdz' && document.uri.path.toLowerCase().endsWith('.mdz');

    // Read bundled CSS and JS from the media directory
    const cssPath = path.join(mediaDir, 'editor.css');
    const jsPath = path.join(mediaDir, 'editor.js');
    const markedPath = path.join(mediaDir, 'marked.min.js');
    const navIconUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(iconsDir, 'mdzip-nav-icon.svg'))
    );
    const markdownIconUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(iconsDir, 'markdown-mark.svg'))
    );

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
<body${isMdzFile ? '' : ' class="markdown-source"'} data-markdown-icon-uri="${markdownIconUri}">
  <div id="toolbar">
    <div id="toolbar-left">
      <button id="btn-nav" class="icon-toggle" title="Toggle contents" aria-label="Toggle contents" type="button"${isMdzFile ? '' : ' hidden'}>
        <img class="toggle-icon toggle-icon-image" src="${navIconUri}" alt="" aria-hidden="true" />
        <span class="visually-hidden">Toggle contents</span>
      </button>
      <button id="btn-title" title="Edit document title"${isMdzFile ? '' : ' hidden'}></button>
    </div>
    <div id="toolbar-buttons" role="group" aria-label="Editor layout">
      <button id="btn-preview" class="icon-toggle active" title="Preview" aria-label="Preview" type="button">
        <svg class="toggle-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 3C4 3 1.7 6.2 1.2 7c.5.8 2.8 4 6.8 4s6.3-3.2 6.8-4c-.5-.8-2.8-4-6.8-4zm0 1.5c2.8 0 4.7 2 5.4 2.9-.7.9-2.6 2.9-5.4 2.9S3.3 8.3 2.6 7.4C3.3 6.5 5.2 4.5 8 4.5zm0 1.1A1.9 1.9 0 1 0 8 9.4a1.9 1.9 0 0 0 0-3.8z"/>
        </svg>
        <span class="visually-hidden">Preview</span>
      </button>
      <button id="btn-side-by-side" class="icon-toggle" title="Split" aria-label="Split" type="button">
        <svg class="toggle-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M2 2.5h12v11H2v-11zm1.2 1.2v8.6h4V3.7h-4zm5.6 0v8.6h4V3.7h-4z"/>
        </svg>
        <span class="visually-hidden">Split</span>
      </button>
      <button id="btn-edit" class="icon-toggle" title="Edit" aria-label="Edit" type="button">
        <svg class="toggle-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M11.5 1.6a1.6 1.6 0 0 1 2.3 2.3L7 10.7l-2.8.8.8-2.8 6.5-6.5zm-6 7.4-.4 1.2 1.2-.4 5.7-5.7-.8-.8L5.5 9zM2.2 13h11.6v1H2.2z"/>
        </svg>
        <span class="visually-hidden">Edit</span>
      </button>
    </div>
    <div id="toolbar-controls">
      <div id="zoom-controls">
        <button id="btn-zoom-toggle" class="icon-toggle" title="Zoom controls" aria-label="Zoom controls" aria-expanded="false" aria-controls="zoom-popover" type="button">
          <svg class="toggle-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M6.7 2a4.7 4.7 0 0 1 3.7 7.6l3.1 3.1-1 1-3.1-3.1A4.7 4.7 0 1 1 6.7 2zm0 1.3a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/>
            <path class="zoom-toggle-plus" d="M6.1 4.6h1.2v1.7H9v1.2H7.3v1.7H6.1V7.5H4.4V6.3h1.7V4.6z"/>
            <path class="zoom-toggle-minus" d="M4.4 6.3H9v1.2H4.4V6.3z"/>
          </svg>
          <span class="visually-hidden">Zoom controls</span>
        </button>
        <div id="zoom-popover" class="hidden" role="group" aria-label="Zoom">
          <span id="zoom-level" aria-live="polite">100%</span>
          <div id="zoom-stepper" role="group" aria-label="Zoom steps">
            <button id="btn-zoom-out" title="Zoom out" aria-label="Zoom out" type="button">-</button>
            <button id="btn-zoom-in" title="Zoom in" aria-label="Zoom in" type="button">+</button>
          </div>
          <button id="btn-zoom-reset" title="Reset zoom" type="button">Reset</button>
        </div>
      </div>
    </div>
  </div>

  <div id="title-dialog-backdrop" class="hidden" role="dialog" aria-modal="true" aria-labelledby="title-dialog-heading">
    <div id="title-dialog">
      <h3 id="title-dialog-heading">Set Document Title</h3>
      <p id="title-dialog-help">This is the package-level title stored in manifest.json (not the file name).</p>
      <p id="title-dialog-help-usage">Shown by readers and inspectors as document metadata.</p>
      <input id="title-input" type="text" maxlength="120" />
      <p id="title-dialog-validation" class="hidden">Title cannot be empty.</p>
      <p id="title-dialog-fallback">If unset, consumers may fall back to entry point, filename, or first heading.</p>
      <div id="title-dialog-actions">
        <button id="btn-title-reset" type="button">Reset</button>
        <button id="btn-title-cancel" type="button">Cancel</button>
        <button id="btn-title-save" type="button">Save</button>
      </div>
    </div>
  </div>

  <div id="workspace-shell">
    <aside id="nav-pane" aria-label="Package contents">
      <div id="nav-tree" role="tree"></div>
    </aside>

    <div id="nav-resizer" role="separator" aria-orientation="vertical" aria-label="Resize contents pane"></div>

    <div id="pane-stack">
      <div id="edit-pane" class="pane">
        <div id="editor-wrap">
          <div id="editor-line-numbers" aria-hidden="true"><pre id="editor-line-numbers-content"></pre></div>
          <pre id="editor-highlight" aria-hidden="true"><code></code></pre>
          <textarea id="editor" spellcheck="false"></textarea>
        </div>
      </div>

      <div id="split-resizer" role="separator" aria-orientation="vertical" aria-label="Resize split panes"></div>

      <div id="preview-pane" class="pane active">
        <div id="preview-content"></div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">${markedJs}</script>
  <script nonce="${nonce}">${editorJs}</script>
</body>
</html>`;
  }

  private async _broadcastScrollSync(
    uri: vscode.Uri,
    origin: vscode.Webview,
    ratio: number
  ): Promise<void> {
    const key = uri.toString();
    const set = this._panelsByDocument.get(key);
    if (!set || set.size <= 1) {
      return;
    }

    const bounded = Math.max(0, Math.min(1, ratio));
    const payload = {
      type: 'scrollSync',
      ratio: bounded,
    } satisfies ScrollSyncMessage;

    const tasks: Promise<boolean>[] = [];
    for (const panel of set) {
      if (panel.webview === origin) {
        continue;
      }
      tasks.push(Promise.resolve(panel.webview.postMessage(payload)));
    }

    await Promise.all(tasks);
  }

  private async _broadcastDocumentContent(document: MdzDocument): Promise<void> {
    const key = document.uri.toString();
    const set = this._panelsByDocument.get(key);
    if (!set || set.size === 0) {
      return;
    }

    const tasks: Promise<void>[] = [];
    for (const panel of set) {
      tasks.push(this._sendDocumentContent(panel.webview, document));
    }

    await Promise.all(tasks);
  }

  private _trackPanel(uri: vscode.Uri, panel: vscode.WebviewPanel): boolean {
    const key = uri.toString();
    const set = this._panelsByDocument.get(key) ?? new Set<vscode.WebviewPanel>();

    if (!set.has(panel) && set.size >= 2) {
      return false;
    }

    set.add(panel);
    this._panelsByDocument.set(key, set);
    return true;
  }

  private _untrackPanel(uri: vscode.Uri, panel: vscode.WebviewPanel): void {
    const key = uri.toString();
    const set = this._panelsByDocument.get(key);
    if (!set) {
      return;
    }
    set.delete(panel);
    if (set.size === 0) {
      this._panelsByDocument.delete(key);
    }
  }

  private _suggestInitialMode(uri: vscode.Uri): EditorMode {
    const key = uri.toString();
    const set = this._panelsByDocument.get(key);
    if (!set || set.size === 0) {
      return 'preview';
    }

    let hasEdit = false;
    let hasPreview = false;
    for (const panel of set) {
      const mode = this._modeByWebview.get(panel.webview);
      if (mode === 'edit') {
        hasEdit = true;
      } else if (mode === 'preview') {
        hasPreview = true;
      }
    }

    // First resolve for a newly tracked panel has no mode yet.
    if (!hasEdit && !hasPreview) {
      return 'preview';
    }

    if (!hasEdit) {
      return 'edit';
    }
    if (!hasPreview) {
      return 'preview';
    }
    return 'preview';
  }

  private async _ensureUniqueModes(
    uri: vscode.Uri,
    origin: vscode.Webview,
    mode: EditorMode
  ): Promise<void> {
    const key = uri.toString();
    const set = this._panelsByDocument.get(key);
    if (!set || set.size <= 1) {
      return;
    }

    for (const panel of set) {
      if (panel.webview === origin) {
        continue;
      }
      const otherMode = this._modeByWebview.get(panel.webview);
      if (otherMode !== mode) {
        continue;
      }

      const forcedMode: EditorMode = mode === 'edit' ? 'preview' : 'edit';
      this._modeByWebview.set(panel.webview, forcedMode);
      await panel.webview.postMessage({
        type: 'setMode',
        mode: forcedMode,
      } satisfies SetModeMessage);
    }
  }

  private async _closeAllEditorsForUri(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    const set = this._panelsByDocument.get(key);
    if (!set || set.size === 0) {
      return;
    }

    for (const panel of [...set]) {
      panel.dispose();
    }
  }

  private _layoutModeForUri(uri: vscode.Uri, webview?: vscode.Webview): LayoutMode {
    const key = uri.toString();
    if (this._splitLayoutUris.has(key)) {
      return 'split';
    }
    const set = this._panelsByDocument.get(key);
    if (!set || set.size === 0) {
      return 'preview';
    }

    const panel = [...set][0];
    if (webview && panel.webview !== webview) {
      return this._modeByWebview.get(webview) ?? 'preview';
    }
    return this._modeByWebview.get(panel.webview) ?? 'preview';
  }

  private async _broadcastLayoutState(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    const set = this._panelsByDocument.get(key);
    if (!set || set.size === 0) {
      return;
    }

    const layout = this._layoutModeForUri(uri);
    const payload = {
      type: 'layoutState',
      layout,
    } satisfies LayoutStateMessage;

    const tasks: Promise<boolean>[] = [];
    for (const panel of set) {
      tasks.push(Promise.resolve(panel.webview.postMessage(payload)));
    }
    await Promise.all(tasks);
  }

  private async _setLayoutForUri(
    uri: vscode.Uri,
    originPanel: vscode.WebviewPanel,
    layout: LayoutMode
  ): Promise<void> {
    const key = uri.toString();

    if (layout === 'split') {
      // Close any extra panels; the single webview renders split internally.
      const set = this._panelsByDocument.get(key);
      if (set) {
        for (const panel of [...set]) {
          if (panel !== originPanel) {
            panel.dispose();
          }
        }
      }
      this._splitLayoutUris.add(key);
      await originPanel.webview.postMessage({
        type: 'layoutState',
        layout: 'split',
      } satisfies LayoutStateMessage);
      return;
    }

    // Leaving split mode.
    this._splitLayoutUris.delete(key);

    const set = this._panelsByDocument.get(key);
    if (!set || set.size === 0) {
      MdzEditorProvider.enqueueInitialModes(uri, [layout]);
      await vscode.commands.executeCommand('vscode.openWith', uri, MdzEditorProvider.VIEW_TYPE, {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: false,
      });
      return;
    }

    for (const panel of [...set]) {
      if (panel === originPanel) {
        continue;
      }
      panel.dispose();
    }

    this._modeByWebview.set(originPanel.webview, layout);
    await originPanel.webview.postMessage({
      type: 'setMode',
      mode: layout,
    } satisfies SetModeMessage);
    await this._broadcastLayoutState(uri);
  }

  private async _openSideBySideForUri(uri: vscode.Uri): Promise<void> {
    const key = uri.toString();
    const set = this._panelsByDocument.get(key);

    // If one pane is already open, keep it and only open the opposite mode beside it.
    if (set && set.size === 1) {
      const [existingPanel] = [...set];
      const existingMode = this._modeByWebview.get(existingPanel.webview) ?? 'preview';
      const oppositeMode: EditorMode = existingMode === 'edit' ? 'preview' : 'edit';

      await existingPanel.webview.postMessage({
        type: 'layoutState',
        layout: 'split',
      } satisfies LayoutStateMessage);
      MdzEditorProvider.enqueueInitialModes(uri, [oppositeMode]);
      await vscode.commands.executeCommand('vscode.openWith', uri, MdzEditorProvider.VIEW_TYPE, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
      });
      return;
    }

    // If two panes already exist, just enforce one-edit/one-preview and avoid opening tabs.
    if (set && set.size >= 2) {
      const panels = [...set];
      const first = panels[0];
      const firstMode = this._modeByWebview.get(first.webview) ?? 'preview';
      const desiredOtherMode: EditorMode = firstMode === 'edit' ? 'preview' : 'edit';

      for (let i = 1; i < panels.length; i++) {
        const panel = panels[i];
        const mode = this._modeByWebview.get(panel.webview);
        if (mode === desiredOtherMode) {
          continue;
        }
        this._modeByWebview.set(panel.webview, desiredOtherMode);
        await panel.webview.postMessage({
          type: 'setMode',
          mode: desiredOtherMode,
        } satisfies SetModeMessage);
      }
      await this._broadcastLayoutState(uri);
      return;
    }

    // No open pane for this URI yet: open a standard pair.
    MdzEditorProvider.enqueueInitialModes(uri, ['edit', 'preview']);
    await vscode.commands.executeCommand('vscode.openWith', uri, MdzEditorProvider.VIEW_TYPE, {
      viewColumn: vscode.ViewColumn.Active,
      preserveFocus: false,
    });
    await vscode.commands.executeCommand('vscode.openWith', uri, MdzEditorProvider.VIEW_TYPE, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    });
    await this._broadcastLayoutState(uri);
  }

  private async _promptToConvertMarkdownForEmbeddedImage(
    document: MdzDocument,
    message: { archivePath: string; base64Data: string }
  ): Promise<void> {
    const convertLabel = 'Convert to .mdz';
    const overwriteLabel = 'Overwrite .mdz';
    const targetUri = this._markdownConversionTargetUri(document.uri);

    const selection = await vscode.window.showInformationMessage(
      'Embed pasted images by converting this markdown file to .mdz. The new .mdz will open with the image packaged inside.',
      { modal: true },
      convertLabel
    );
    if (selection !== convertLabel) {
      return;
    }

    if (await this._uriExists(targetUri)) {
      const overwriteSelection = await vscode.window.showWarningMessage(
        `${path.posix.basename(targetUri.path)} already exists. Overwrite it with a new converted archive?`,
        { modal: true },
        overwriteLabel
      );
      if (overwriteSelection !== overwriteLabel) {
        return;
      }
    }

    const imageBytes = Uint8Array.from(Buffer.from(message.base64Data, 'base64'));
    const title = suggestedTitleFromMarkdown(
      document.currentMarkdown,
      fileBaseNameFromPath(targetUri.path)
    );
    const archiveBytes = await buildNewArchiveBytesWithTitle(document.currentMarkdown, title, [
      {
        archivePath: message.archivePath,
        fileBytes: imageBytes,
      },
    ]);

    await vscode.workspace.fs.writeFile(targetUri, archiveBytes);
    MdzEditorProvider.markNextOpenInEdit(targetUri);
    await vscode.commands.executeCommand('vscode.openWith', targetUri, MdzEditorProvider.VIEW_TYPE);
  }

  private _markdownConversionTargetUri(uri: vscode.Uri): vscode.Uri {
    return uri.with({ path: uri.path.replace(/\.md$/i, '.mdz') });
  }

  private async _uriExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private async _openArchivePathWithDefaultViewer(
    document: MdzDocument,
    archivePath: string
  ): Promise<boolean> {
    const normalizedPath = archivePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalizedPath) {
      return false;
    }

    const bytes = await document.readPathBytes(normalizedPath);
    if (!bytes) {
      return false;
    }

    const tempUri = await this._writeArchiveEntryToTemp(document.uri, normalizedPath, bytes);
    await vscode.commands.executeCommand('vscode.open', tempUri, {
      preview: true,
    });
    return true;
  }

  private async _writeArchiveEntryToTemp(
    documentUri: vscode.Uri,
    archivePath: string,
    fileBytes: Uint8Array
  ): Promise<vscode.Uri> {
    const docKey = Buffer.from(documentUri.toString()).toString('base64url');
    const rootDir = vscode.Uri.joinPath(this.context.globalStorageUri, 'archive-open', docKey);
    const segments = archivePath.split('/').filter(Boolean).map((segment) => sanitizePathSegment(segment));
    const fileName = segments.pop() ?? 'entry.bin';

    let fileDir = rootDir;
    for (const segment of segments) {
      fileDir = vscode.Uri.joinPath(fileDir, segment);
    }

    await vscode.workspace.fs.createDirectory(fileDir);
    const fileUri = vscode.Uri.joinPath(fileDir, fileName);
    await vscode.workspace.fs.writeFile(fileUri, fileBytes);
    return fileUri;
  }
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface WebviewMessage {
  type:
    | 'ready'
    | 'edit'
    | 'pasteImage'
    | 'setTitle'
    | 'removeOrphanedAsset'
    | 'openPath'
    | 'scrollSync'
    | 'modeChanged'
    | 'openSideBySide'
    | 'setLayout';
  markdown?: string;
  archivePath?: string;
  base64Data?: string;
  title?: string;
  path?: string;
  ratio?: number;
  mode?: EditorMode;
  layout?: LayoutMode;
}

interface LoadMessage {
  type: 'load';
  markdown: string;
  sourceFormat: 'mdz' | 'markdown';
  isMdzFile: boolean;
  isMarkdownEditor: boolean;
  entryPoint: string;
  currentPath: string;
  currentPathType: 'markdown' | 'text' | 'image' | 'binary';
  manifest: unknown;
  displayTitle: string;
  fileBaseName: string;
  headingFallback?: string;
  suggestedTitle: string;
  images: Record<string, string>;
  paths: Array<{ path: string; isMarkdown: boolean; isImage: boolean }>;
  orphanedAssetPaths: string[];
  initialMode?: EditorMode;
  layout: LayoutMode;
}

interface ScrollSyncMessage {
  type: 'scrollSync';
  ratio: number;
}

interface SetModeMessage {
  type: 'setMode';
  mode: EditorMode;
}

interface LayoutStateMessage {
  type: 'layoutState';
  layout: LayoutMode;
}

type EditorMode = 'preview' | 'edit';
type LayoutMode = EditorMode | 'split';

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

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}
