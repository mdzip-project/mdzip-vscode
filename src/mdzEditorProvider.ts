import * as vscode from 'vscode';
import * as path from 'path';
import { MdzDocument } from './mdzDocument';
import { MdzDiffPanel } from './mdzDiffPanel';
import {
  buildNewArchiveBytesWithTitle,
  displayTitleFromManifest,
  fileBaseNameFromPath,
  firstMarkdownHeading,
  suggestedTitleFromMarkdown,
  MdzipWorkspaceService,
  inferMdzipSourceFormat,
} from '@mdzip/editor';

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
  private static readonly _nextOpenLayouts = new Map<string, LayoutMode[]>();
  private static _instance: MdzEditorProvider | undefined;
  private readonly _panelsByDocument = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly _documentsByUri = new Map<string, MdzDocument>();
  private readonly _modeByWebview = new WeakMap<vscode.Webview, EditorMode>();
  private readonly _isMarkdownEditorByWebview = new WeakMap<vscode.Webview, boolean>();
  private readonly _splitLayoutUris = new Set<string>();
  private readonly _pendingMarkdownGitDiffs = new Map<string, PendingMarkdownGitDiff>();
  private readonly _pendingMdzGitDiffs = new Map<string, PendingMdzGitDiff>();

  /** Hint that the next open for this URI should start in source edit mode. */
  public static markNextOpenInEdit(uri: vscode.Uri): void {
    MdzEditorProvider.enqueueInitialModes(uri, ['edit']);
  }

  /** Hint that the next open for this URI should start in preview mode. */
  public static markNextOpenInPreview(uri: vscode.Uri): void {
    MdzEditorProvider.enqueueInitialModes(uri, ['preview']);
  }

  /** Hint that the next open for this URI should start in split mode. */
  public static markNextOpenInSplit(uri: vscode.Uri): void {
    MdzEditorProvider.enqueueInitialLayouts(uri, ['split']);
  }

  /** Queue one or more initial modes for upcoming editor resolves on a URI. */
  public static enqueueInitialModes(uri: vscode.Uri, modes: EditorMode[]): void {
    const key = uri.toString();
    const existing = MdzEditorProvider._nextOpenModes.get(key) ?? [];
    MdzEditorProvider._nextOpenModes.set(key, [...existing, ...modes]);
  }

  /** Queue one or more initial layouts for upcoming editor resolves on a URI. */
  public static enqueueInitialLayouts(uri: vscode.Uri, layouts: LayoutMode[]): void {
    const key = uri.toString();
    const existing = MdzEditorProvider._nextOpenLayouts.get(key) ?? [];
    MdzEditorProvider._nextOpenLayouts.set(key, [...existing, ...layouts]);
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

  private static consumeInitialLayout(uri: vscode.Uri): LayoutMode | undefined {
    const key = uri.toString();
    const queue = MdzEditorProvider._nextOpenLayouts.get(key);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const nextLayout = queue.shift();
    if (!nextLayout || queue.length === 0) {
      MdzEditorProvider._nextOpenLayouts.delete(key);
    } else {
      MdzEditorProvider._nextOpenLayouts.set(key, queue);
    }
    return nextLayout;
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
    this._documentsByUri.set(uri.toString(), doc);
    return doc;
  }

  // ── Test API surface ──────────────────────────────────────────────────────

  /** Whether a document is currently open for this URI. Used by tests. */
  public static hasDocumentForUri(uri: vscode.Uri): boolean {
    return MdzEditorProvider._instance?._documentsByUri.has(uri.toString()) ?? false;
  }

  /**
   * Simulate what the workspaceChanged message handler does: store webview bytes,
   * mark dirty, and fire the custom document change event. Used by integration tests
   * to bypass the async webview message pipeline.
   */
  public static simulateWebviewChange(uri: vscode.Uri, bytes: Uint8Array): void {
    const instance = MdzEditorProvider._instance;
    if (!instance) {
      return;
    }
    const doc = instance._documentsByUri.get(uri.toString());
    if (!doc) {
      return;
    }
    doc.updateFromWebview(bytes);
    doc.markDirty();
    instance._onDidChangeCustomDocument.fire({
      document: doc,
      undo: () => { /* no-op */ },
      redo: () => { /* no-op */ },
    });
  }

  public async resolveCustomEditor(
    document: MdzDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    if (
      webviewPanel.viewType === MdzEditorProvider.VIEW_TYPE
      && document.uri.scheme === 'git'
      && this._redirectMdzGitDiff(document, webviewPanel)
    ) {
      return;
    }

    if (
      webviewPanel.viewType === MdzEditorProvider.MARKDOWN_VIEW_TYPE
      && document.uri.scheme === 'git'
      && this._redirectMarkdownGitDiff(document.uri, webviewPanel)
    ) {
      return;
    }

    if (!this._trackPanel(document.uri, webviewPanel)) {
      webviewPanel.dispose();
      vscode.window.showInformationMessage(
        'MDZip keeps at most two panes per document (one Edit, one Preview).'
      );
      return;
    }

    const initialMode: EditorMode =
      MdzEditorProvider.consumeInitialMode(document.uri) ??
      (document.isNewDocument ? 'edit' : this._suggestInitialMode(document.uri));
    const initialLayout = MdzEditorProvider.consumeInitialLayout(document.uri);
    if (initialLayout === 'split') {
      this._splitLayoutUris.add(document.uri.toString());
    }
    this._modeByWebview.set(webviewPanel.webview, initialMode);
    this._isMarkdownEditorByWebview.set(
      webviewPanel.webview,
      webviewPanel.viewType === MdzEditorProvider.MARKDOWN_VIEW_TYPE
    );

    webviewPanel.webview.options = {
      enableScripts: true,
    };

    // Handle messages from the webview
    let convertSaveTimer: ReturnType<typeof setTimeout> | null = null;
    let initialContentSend: Promise<void> | null = null;
    const sendInitialContent = (): Promise<void> => {
      if (!initialContentSend) {
        initialContentSend = this._sendWorkspaceEditorContent(webviewPanel.webview, document);
      }
      return initialContentSend;
    };
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

        case 'workspaceChanged':
          if (!isWorkspaceSnapshotMessage(message)) {
            return;
          }
          document.updateFromWebview(base64ToBytes(message.archiveBase64));
          if (message.dirty) {
            document.markDirty();
            this._onDidChangeCustomDocument.fire({
              document,
              undo: () => {
                /* no-op for now */
              },
              redo: () => {
                /* no-op for now */
              },
            });
          }
          // The library converted the workspace to .mdz. Auto-save after a short
          // debounce so both onChanged events (convertToMdz + insertImageFile)
          // settle before writeFile runs. By save time _latestWebviewBytes has
          // the final bytes including the pasted image.
          if (message.sourceFormat === 'mdz' && document.sourceFormat === 'markdown') {
            document.markConvertedToMdz();
            if (convertSaveTimer) { clearTimeout(convertSaveTimer); }
            convertSaveTimer = setTimeout(() => {
              convertSaveTimer = null;
              void vscode.commands.executeCommand('workbench.action.files.save');
            }, 300);
          }
          break;

        case 'workspaceSaved':
          await vscode.commands.executeCommand('workbench.action.files.save');
          break;

        case 'workspaceFailed':
          if (typeof message.message === 'string') {
            vscode.window.showErrorMessage(message.message);
          }
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
            await this._sendWorkspaceEditorContent(webviewPanel.webview, document);
            return;
          }
          await this._sendWorkspaceEditorContent(webviewPanel.webview, document);
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

        case 'manifestChanged':
          // Manifest-only edit from the webview (onManifestChanged path): no
          // bytes were built there. Patch manifest.json into the real archive
          // bytes here — incremental, no document reads.
          try {
            await document.applyManifest(message.manifest ?? null);
          } catch (error) {
            console.error('[MDZip] Failed to apply manifest change:', error);
            vscode.window.showErrorMessage(
              `MDZip: failed to apply manifest change: ${error instanceof Error ? error.message : String(error)}`
            );
            return;
          }
          document.markDirty();
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

        case 'readDocumentText': {
          // On-demand text for a lazy document (large archives keep document
          // text on the host side; see getSerializedWorkspace).
          if (typeof message.requestId !== 'number' || typeof message.path !== 'string') {
            return;
          }
          console.log(`[MDZip] readDocumentText request ${message.requestId}: ${message.path}`);
          let text = '';
          try {
            const bytes = await document.readPathBytes(message.path);
            text = bytes ? new TextDecoder('utf-8').decode(bytes) : '';
          } catch (error) {
            console.error(`[MDZip] Failed to read document text for ${message.path}:`, error);
          }
          void webviewPanel.webview.postMessage({
            type: 'documentText',
            requestId: message.requestId,
            text,
          } satisfies DocumentTextMessage);
          break;
        }

        case 'ready':
          // Webview is ready — send initial content
          await sendInitialContent();
          break;
      }
    });

    // When the document changes externally (revert), refresh the webview
    const changeSubscription = document.onDidChange(async (event) => {
      if (event.reason !== 'reload') {
        return;
      }
      await this._sendWorkspaceEditorContent(webviewPanel.webview, document);
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

    webviewPanel.webview.html = this._buildWebviewHtml(webviewPanel.webview, document);
    // Send content asynchronously so webview renders immediately
    sendInitialContent().catch(error => {
      console.error('[MDZip] Error sending workspace content:', error);
    });
  }

  public async saveCustomDocument(
    document: MdzDocument,
    _cancellation: vscode.CancellationToken
  ): Promise<void> {
    if (document.sourceFormat === 'markdown' && document.isConvertedToMdz) {
      await this._handleMarkdownConvertedToMdz(document);
      return;
    }
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

  /** Send document content to the shared browser editor runtime. */
  private async _sendWorkspaceEditorContent(
    webview: vscode.Webview,
    document: MdzDocument
  ): Promise<void> {
    try {
      const fileName = path.posix.basename(document.uri.path);
      const layout = this._layoutModeForUri(document.uri, webview);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout serializing workspace')), 10000)
      );
      const workspace = await Promise.race([
        document.getSerializedWorkspace(),
        timeoutPromise,
      ]);

      // Always ship the backing archive bytes. Without them, image paste and
      // other asset mutations rebuild the full workspace in the webview. On
      // large archives that can complete with a stale text snapshot after the
      // user has continued editing.
      const archiveBytes = document.sourceFormat === 'mdz' ? document.currentArchiveBytes() : undefined;
      const bytesBase64 =
        archiveBytes && archiveBytes.length > 0
          ? Buffer.from(archiveBytes).toString('base64')
          : undefined;

      await webview.postMessage({
        type: 'openWorkspaceDirect',
        workspace: JSON.stringify(workspace),
        bytesBase64,
        sourceFormat: document.sourceFormat,
        fileName,
        layout,
      } satisfies OpenWorkspaceDirectMessage);
    } catch (error) {
      console.error('[MDZip] Failed to send workspace content:', error);
    }
  }

  /** Build the HTML for the webview panel. */
  private _buildWebviewHtml(webview: vscode.Webview, _document: MdzDocument): string {
    const mediaDir = path.join(this.context.extensionPath, 'media');
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaDir, 'editor.bundle.js')));
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src data: ${webview.cspSource};
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MDZip Editor</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body { position: relative; }
    #mdzip-loading {
      position: absolute;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-descriptionForeground, rgba(204, 204, 204, 0.6));
      font-size: 13px;
      font-family: var(--vscode-font-family, sans-serif);
      pointer-events: none;
    }
    #mdzip-editor-root { height: 100%; }
  </style>
</head>
<body>
  <div id="mdzip-loading">Loading…</div>
  <main id="mdzip-editor-root"></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
      this._documentsByUri.delete(key);
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

  private async _handleMarkdownConvertedToMdz(document: MdzDocument): Promise<void> {
    const mdzBytes = document.latestWebviewBytes;
    if (!mdzBytes) {
      await document.save();
      return;
    }

    const targetUri = this._markdownConversionTargetUri(document.uri);

    if (await this._uriExists(targetUri)) {
      const overwriteLabel = 'Overwrite .mdz';
      const selection = await vscode.window.showWarningMessage(
        `${path.posix.basename(targetUri.path)} already exists. Overwrite it with the converted archive?`,
        { modal: true },
        overwriteLabel
      );
      if (selection !== overwriteLabel) {
        // User declined — revert the .md to its clean original state.
        await document.revert();
        return;
      }
    }

    // Write the original markdown text back to the .md file.
    // saveCustomDocument returning successfully clears VS Code's dirty indicator;
    // writing the original content ensures the on-disk file is consistent.
    const mdBytes = new TextEncoder().encode(document.currentMarkdown);
    await vscode.workspace.fs.writeFile(document.uri, mdBytes);

    // Write the converted .mdz archive to its target path.
    await vscode.workspace.fs.writeFile(targetUri, mdzBytes);

    // Reset the in-memory document state back to clean markdown.
    // resetAfterMdzConversion suppresses the file-watcher reload and calls revert(),
    // which fires onDidChange(reload) so the .md webview reloads to original markdown.
    await document.resetAfterMdzConversion();

    MdzEditorProvider.markNextOpenInSplit(targetUri);
    await vscode.commands.executeCommand('vscode.openWith', targetUri, MdzEditorProvider.VIEW_TYPE);
  }

  private _redirectMarkdownGitDiff(
    uri: vscode.Uri,
    webviewPanel: vscode.WebviewPanel
  ): boolean {
    const gitInput = parseGitInput(uri);
    if (!gitInput || !/\.md$/i.test(gitInput.path)) {
      return false;
    }

    const key = normalizeFileSystemPath(gitInput.path);
    let pending = this._pendingMarkdownGitDiffs.get(key);
    if (!pending) {
      pending = {
        filePath: gitInput.path,
        inputs: new Map(),
        panels: new Set(),
      };
      this._pendingMarkdownGitDiffs.set(key, pending);
    }

    pending.inputs.set(uri.toString(), { uri, ref: gitInput.ref });
    pending.panels.add(webviewPanel);
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pending.timer = setTimeout(() => {
      void this._openBuiltInMarkdownGitDiff(key);
    }, 200);
    return true;
  }

  private async _openBuiltInMarkdownGitDiff(key: string): Promise<void> {
    const pending = this._pendingMarkdownGitDiffs.get(key);
    if (!pending) {
      return;
    }
    this._pendingMarkdownGitDiffs.delete(key);

    for (const panel of pending.panels) {
      panel.dispose();
    }
    for (const input of pending.inputs.values()) {
      this._documentsByUri.delete(input.uri.toString());
    }

    const inputs = [...pending.inputs.values()];
    const rightInput = inputs.find(input => input.ref === '');
    const leftInput = inputs.find(input => input !== rightInput);
    const onlyInput = inputs.length === 1 ? inputs[0] : undefined;
    const leftUri = onlyInput?.ref === ''
      ? gitUriWithRef(onlyInput.uri, 'HEAD')
      : leftInput?.uri ?? onlyInput?.uri;
    const rightUri = rightInput?.uri ?? vscode.Uri.file(pending.filePath);
    if (!leftUri) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 0));
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (
      activeTab
      && activeTab.input === undefined
      && activeTab.label.toLowerCase().includes(path.basename(pending.filePath).toLowerCase())
    ) {
      await vscode.window.tabGroups.close(activeTab);
    }

    try {
      // Stable VS Code does not expose the customEditorPriority proposal. The
      // workbench command's default override keeps Git diffs in the text editor.
      await vscode.commands.executeCommand(
        '_workbench.diff',
        leftUri,
        rightUri,
        `${path.basename(pending.filePath)} (Changes)`,
        [vscode.ViewColumn.Active, { preview: true, override: 'default' }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Unable to open the Markdown text diff: ${message}`);
    }
  }

  private _redirectMdzGitDiff(
    document: MdzDocument,
    webviewPanel: vscode.WebviewPanel
  ): boolean {
    const gitInput = parseGitInput(document.uri);
    if (!gitInput || !/\.mdz$/i.test(gitInput.path)) {
      return false;
    }

    const key = normalizeFileSystemPath(gitInput.path);
    if (MdzDiffPanel.hasForFilePath(gitInput.path)) {
      webviewPanel.dispose();
      this._documentsByUri.delete(document.uri.toString());
      MdzDiffPanel.revealForFilePath(gitInput.path);
      return true;
    }

    let pending = this._pendingMdzGitDiffs.get(key);
    if (!pending) {
      pending = {
        filePath: gitInput.path,
        inputs: new Map(),
      };
      this._pendingMdzGitDiffs.set(key, pending);
    }

    pending.inputs.set(document.uri.toString(), {
      uri: document.uri,
      ref: gitInput.ref,
      bytes: document.currentArchiveBytes(),
    });
    webviewPanel.dispose();
    this._documentsByUri.delete(document.uri.toString());
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pending.timer = setTimeout(() => {
      void this._openMdzGitDiff(key);
    }, 25);
    return true;
  }

  private async _openMdzGitDiff(key: string): Promise<void> {
    const pending = this._pendingMdzGitDiffs.get(key);
    if (!pending) {
      return;
    }
    this._pendingMdzGitDiffs.delete(key);

    for (const input of pending.inputs.values()) {
      this._documentsByUri.delete(input.uri.toString());
    }

    const inputs = [...pending.inputs.values()];
    const workingInput = inputs.find(input => input.ref === '');
    const baseInput = inputs.find(input => input !== workingInput);
    const onlyInput = inputs.length === 1 ? inputs[0] : undefined;

    const beforeUri = onlyInput?.ref === ''
      ? gitUriWithRef(onlyInput.uri, 'HEAD')
      : baseInput?.uri ?? onlyInput?.uri;
    const afterUri = workingInput?.uri ?? vscode.Uri.file(pending.filePath);
    if (!beforeUri) {
      return;
    }

    const [beforeBytes, afterBytes] = await Promise.all([
      baseInput?.bytes ?? (onlyInput?.ref !== '' ? onlyInput?.bytes : readUriBytes(beforeUri)),
      workingInput?.bytes ?? (onlyInput?.ref === '' ? onlyInput.bytes : readUriBytes(afterUri)),
    ]);
    const beforeRef = baseInput?.ref || (onlyInput?.ref !== '' ? onlyInput?.ref : 'HEAD') || 'HEAD';

    try {
      await MdzDiffPanel.open({
        title: `${path.basename(pending.filePath)}: Archive Contents`,
        resourceUri: vscode.Uri.file(pending.filePath),
        before: {
          label: beforeRef,
          uri: beforeUri,
          bytes: beforeBytes,
          missingMessage: `The ${beforeRef} archive revision is not readable.`,
        },
        after: {
          label: 'Working Tree',
          uri: afterUri,
          bytes: afterBytes,
          missingMessage: 'The working-copy archive is not readable.',
        },
      }, this.context.extensionUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Unable to open the MDZip archive diff: ${message}`);
    }
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
    MdzEditorProvider.markNextOpenInSplit(targetUri);
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
    | 'setLayout'
    | 'workspaceChanged'
    | 'workspaceSaved'
    | 'workspaceFailed'
    | 'readDocumentText'
    | 'manifestChanged';
  markdown?: string;
  requestId?: number;
  manifest?: unknown;
  archivePath?: string;
  archiveBase64?: string;
  base64Data?: string;
  currentText?: string;
  currentPath?: string;
  currentPathType?: 'markdown' | 'text' | 'image' | 'binary';
  sourceFormat?: 'mdz' | 'markdown';
  dirty?: boolean;
  message?: string;
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

interface OpenWorkspaceMessage {
  type: 'openWorkspace';
  bytesBase64: string;
  sourceFormat: 'mdz' | 'markdown';
  fileName: string;
  layout: LayoutMode;
}

interface OpenWorkspaceDirectMessage {
  type: 'openWorkspaceDirect';
  workspace: string; // JSON-serialized workspace with pre-resolved asset dataUri fields
  bytesBase64?: string; // raw archive bytes for incremental patching (small archives only)
  sourceFormat: 'mdz' | 'markdown';
  fileName: string;
  layout: LayoutMode;
}

interface DocumentTextMessage {
  type: 'documentText';
  requestId: number;
  text: string;
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

interface PendingMarkdownGitDiff {
  filePath: string;
  inputs: Map<string, { uri: vscode.Uri; ref: string }>;
  panels: Set<vscode.WebviewPanel>;
  timer?: ReturnType<typeof setTimeout>;
}

interface PendingMdzGitDiff {
  filePath: string;
  inputs: Map<string, { uri: vscode.Uri; ref: string; bytes: Uint8Array }>;
  timer?: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function parseGitInput(uri: vscode.Uri): { path: string; ref: string } | undefined {
  try {
    const query = JSON.parse(uri.query) as { path?: unknown; ref?: unknown };
    if (typeof query.path !== 'string' || typeof query.ref !== 'string') {
      return undefined;
    }
    return { path: query.path, ref: query.ref };
  } catch {
    return undefined;
  }
}

function normalizeFileSystemPath(filePath: string): string {
  const normalized = path.normalize(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function gitUriWithRef(uri: vscode.Uri, ref: string): vscode.Uri {
  const query = JSON.parse(uri.query) as Record<string, unknown>;
  return uri.with({ query: JSON.stringify({ ...query, ref }) });
}

async function readUriBytes(uri: vscode.Uri): Promise<Uint8Array | undefined> {
  try {
    return new Uint8Array(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

function getNonce(): string {
  return require('crypto').randomBytes(16).toString('hex');
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

function isWorkspaceSnapshotMessage(message: WebviewMessage): message is WebviewMessage & {
  archiveBase64: string;
  currentText: string;
  currentPath: string;
  currentPathType: 'markdown' | 'text' | 'image' | 'binary';
  sourceFormat: 'mdz' | 'markdown';
  dirty: boolean;
} {
  return typeof message.archiveBase64 === 'string'
    && typeof message.currentText === 'string'
    && typeof message.currentPath === 'string'
    && (message.currentPathType === 'markdown'
      || message.currentPathType === 'text'
      || message.currentPathType === 'image'
      || message.currentPathType === 'binary')
    && (message.sourceFormat === 'mdz' || message.sourceFormat === 'markdown')
    && typeof message.dirty === 'boolean';
}
