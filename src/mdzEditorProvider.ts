import * as vscode from 'vscode';
import * as path from 'path';
import { MdzDocument } from './mdzDocument';
import {
  buildNewArchiveBytesWithTitle,
  displayTitleFromManifest,
  fileBaseNameFromPath,
  firstMarkdownHeading,
  suggestedTitleFromMarkdown,
} from 'mdzip-editor';

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
          await document.applyWorkspaceSnapshot({
            archiveBytes: base64ToBytes(message.archiveBase64),
            currentText: message.currentText,
            currentPath: message.currentPath,
            currentPathType: message.currentPathType,
            dirty: message.dirty,
          });
          if (message.dirty) {
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
          break;

        case 'workspaceSaved':
          if (!isWorkspaceSnapshotMessage(message)) {
            return;
          }
          await document.applyWorkspaceSnapshot({
            archiveBytes: base64ToBytes(message.archiveBase64),
            currentText: message.currentText,
            currentPath: message.currentPath,
            currentPathType: message.currentPathType,
            dirty: true,
          });
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

        case 'ready':
          // Webview is ready — send initial content
          await this._sendWorkspaceEditorContent(webviewPanel.webview, document);
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

  /** Send document bytes to the shared browser editor runtime. */
  private async _sendWorkspaceEditorContent(
    webview: vscode.Webview,
    document: MdzDocument
  ): Promise<void> {
    const bytes = await document.exportForWorkspaceEditor();
    await webview.postMessage({
      type: 'openWorkspace',
      bytesBase64: bytesToBase64(bytes),
      sourceFormat: document.sourceFormat,
      fileName: path.posix.basename(document.uri.path),
      layout: this._layoutModeForUri(document.uri, webview),
    } satisfies OpenWorkspaceMessage);
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
</head>
<body>
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
    | 'workspaceFailed';
  markdown?: string;
  archivePath?: string;
  archiveBase64?: string;
  base64Data?: string;
  currentText?: string;
  currentPath?: string;
  currentPathType?: 'markdown' | 'text' | 'image' | 'binary';
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
  dirty: boolean;
} {
  return typeof message.archiveBase64 === 'string'
    && typeof message.currentText === 'string'
    && typeof message.currentPath === 'string'
    && (message.currentPathType === 'markdown'
      || message.currentPathType === 'text'
      || message.currentPathType === 'image'
      || message.currentPathType === 'binary')
    && typeof message.dirty === 'boolean';
}
