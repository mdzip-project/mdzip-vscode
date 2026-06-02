/**
 * MDZip Editor — webview script
 *
 * Runs inside the VS Code webview. Communicates with the extension host via
 * the acquireVsCodeApi() message bus.
 *
 * Expected inbound messages (from extension):
 *   { type: 'load', markdown, sourceFormat, isMdzFile, isMarkdownEditor, entryPoint, currentPath, manifest, images, paths }
 *
 * Outbound messages (to extension):
 *   { type: 'ready' }
 *   { type: 'edit', markdown }
 *   { type: 'openPath', path }
 *   { type: 'setLayout', layout: 'preview' | 'edit' | 'split' }
 */

(function () {
  'use strict';

  const host = createVscodeHost(acquireVsCodeApi());

  function createVscodeHost(vscodeApi) {
    return {
      postMessage(message) {
        vscodeApi.postMessage(message);
      },
      getState() {
        return vscodeApi.getState() || {};
      },
      setState(nextState) {
        vscodeApi.setState(nextState);
      },
      onMessage(handler) {
        window.addEventListener('message', (event) => handler(event.data));
      },
    };
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const previewPane = /** @type {HTMLElement} */ (document.getElementById('preview-pane'));
  const editPane    = /** @type {HTMLElement} */ (document.getElementById('edit-pane'));
  const paneStack   = /** @type {HTMLElement} */ (document.getElementById('pane-stack'));
  const workspaceShell = /** @type {HTMLElement} */ (document.getElementById('workspace-shell'));
  const navPane = /** @type {HTMLElement} */ (document.getElementById('nav-pane'));
  const navResizer = /** @type {HTMLElement} */ (document.getElementById('nav-resizer'));
  const splitResizer = /** @type {HTMLElement} */ (document.getElementById('split-resizer'));
  const previewContent = /** @type {HTMLElement} */ (document.getElementById('preview-content'));
  const editor      = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
  const editorLineNumbers = /** @type {HTMLElement} */ (document.getElementById('editor-line-numbers'));
  const editorLineNumbersContent = /** @type {HTMLElement} */ (document.getElementById('editor-line-numbers-content'));
  const editorHighlight = /** @type {HTMLElement} */ (document.getElementById('editor-highlight'));
  const btnTitle    = /** @type {HTMLButtonElement} */ (document.getElementById('btn-title'));
  const btnNav      = /** @type {HTMLButtonElement} */ (document.getElementById('btn-nav'));
  const btnPreview  = /** @type {HTMLButtonElement} */ (document.getElementById('btn-preview'));
  const btnEdit     = /** @type {HTMLButtonElement} */ (document.getElementById('btn-edit'));
  const btnSideBySide = /** @type {HTMLButtonElement} */ (document.getElementById('btn-side-by-side'));
  const zoomControls = /** @type {HTMLElement} */ (document.getElementById('zoom-controls'));
  const zoomPopover = /** @type {HTMLElement} */ (document.getElementById('zoom-popover'));
  const btnZoomToggle = /** @type {HTMLButtonElement} */ (document.getElementById('btn-zoom-toggle'));
  const zoomLevelLabel = /** @type {HTMLElement} */ (document.getElementById('zoom-level'));
  const btnZoomOut  = /** @type {HTMLButtonElement} */ (document.getElementById('btn-zoom-out'));
  const btnZoomIn   = /** @type {HTMLButtonElement} */ (document.getElementById('btn-zoom-in'));
  const btnZoomReset = /** @type {HTMLButtonElement} */ (document.getElementById('btn-zoom-reset'));
  const titleDialogBackdrop = /** @type {HTMLElement} */ (document.getElementById('title-dialog-backdrop'));
  const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('title-input'));
  const titleValidation = /** @type {HTMLElement} */ (document.getElementById('title-dialog-validation'));
  const btnTitleCancel = /** @type {HTMLButtonElement} */ (document.getElementById('btn-title-cancel'));
  const btnTitleReset = /** @type {HTMLButtonElement} */ (document.getElementById('btn-title-reset'));
  const btnTitleSave = /** @type {HTMLButtonElement} */ (document.getElementById('btn-title-save'));
  const navTree = /** @type {HTMLElement} */ (document.getElementById('nav-tree'));

  // ── State ─────────────────────────────────────────────────────────────────
  /** @type {Record<string, string>} archive-path → data-URI */
  let imageMap = {};
  let archivePaths = [];
  const orphanedAssetPaths = new Set();
  /** @type {string} */
  let entryPoint = '';
  /** @type {string} */
  let currentPath = '';
  let currentPathType = 'markdown';
  let isInitialLoad = true;
  let pasteInFlight = false;
  let currentDisplayTitle = '';
  let fallbackTitle = 'document';
  let activeMode = 'preview';
  let layoutMode = 'preview';
  let sourceFormat = 'mdz';
  let isMdzFile = false;
  let isMarkdownEditor = false;
  let zoomControlsOpen = false;
  let suppressScrollEvents = false;
  let scrollEmitTimer = null;
  const markdownIconUri = document.body ? document.body.dataset.markdownIconUri || '' : '';

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.1;
  const NAV_MIN_WIDTH = 180;
  const NAV_MAX_WIDTH_FACTOR = 0.6;
  const SPLIT_MIN_RATIO = 0.2;
  const SPLIT_MAX_RATIO = 0.8;
  const persistedState = host.getState();
  let navVisible = persistedState.navVisible === true;
  const expandedNavDirectories = new Set();
  let zoomLevel = typeof persistedState.zoomLevel === 'number' ? persistedState.zoomLevel : 1;
  let navPaneWidth = typeof persistedState.navPaneWidth === 'number' ? persistedState.navPaneWidth : 280;
  let splitRatio = typeof persistedState.splitRatio === 'number' ? persistedState.splitRatio : 0.5;

  function updatePersistedState(partialState) {
    const currentState = host.getState();
    host.setState({ ...currentState, ...partialState });
  }

  function clampZoom(value) {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  }

  function maxNavWidthPx() {
    const shellWidth = workspaceShell ? workspaceShell.clientWidth : window.innerWidth;
    return Math.max(NAV_MIN_WIDTH + 120, Math.floor(shellWidth * NAV_MAX_WIDTH_FACTOR));
  }

  function clampNavWidth(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 280;
    }
    return Math.max(NAV_MIN_WIDTH, Math.min(maxNavWidthPx(), Math.round(numeric)));
  }

  function clampSplitRatio(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return 0.5;
    }
    return Math.max(SPLIT_MIN_RATIO, Math.min(SPLIT_MAX_RATIO, numeric));
  }

  function applyZoom(nextZoom, persist = true) {
    zoomLevel = clampZoom(Number(nextZoom) || 1);
    const rounded = Math.round(zoomLevel * 100) / 100;
    document.documentElement.style.setProperty('--mdz-zoom', String(rounded));
    if (zoomLevelLabel) {
      zoomLevelLabel.textContent = `${Math.round(rounded * 100)}%`;
    }
    if (btnZoomToggle) {
      btnZoomToggle.title = `Zoom controls (${Math.round(rounded * 100)}%)`;
      btnZoomToggle.classList.toggle('zoomed-out', rounded < 1);
    }
    if (persist) {
      updatePersistedState({ zoomLevel: rounded });
    }
  }

  applyZoom(zoomLevel, false);

  function setZoomControlsOpen(nextOpen) {
    zoomControlsOpen = nextOpen;
    if (zoomPopover) {
      zoomPopover.classList.toggle('hidden', !zoomControlsOpen);
    }
    if (btnZoomToggle) {
      btnZoomToggle.classList.toggle('active', zoomControlsOpen);
      btnZoomToggle.setAttribute('aria-expanded', zoomControlsOpen ? 'true' : 'false');
    }
  }

  function applyNavPaneWidth(nextWidth, persist = true) {
    navPaneWidth = clampNavWidth(nextWidth);
    document.documentElement.style.setProperty('--nav-pane-width', `${navPaneWidth}px`);
    if (persist) {
      updatePersistedState({ navPaneWidth });
    }
  }

  function applySplitRatio(nextRatio, persist = true) {
    splitRatio = clampSplitRatio(nextRatio);
    const rounded = Math.round(splitRatio * 10000) / 10000;
    document.documentElement.style.setProperty('--split-edit-ratio', String(rounded));
    if (persist) {
      updatePersistedState({ splitRatio: rounded });
    }
  }

  function installHorizontalResizer(handle, onPointerMove) {
    if (!handle) {
      return;
    }

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      document.body.classList.add('is-resizing');

      const onMove = (moveEvent) => {
        onPointerMove(moveEvent.clientX);
      };
      const onUp = () => {
        document.body.classList.remove('is-resizing');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    });
  }

  function installResizers() {
    installHorizontalResizer(navResizer, (clientX) => {
      if (!workspaceShell || !navPane || !navVisible) {
        return;
      }
      const shellBounds = workspaceShell.getBoundingClientRect();
      applyNavPaneWidth(clientX - shellBounds.left);
    });

    installHorizontalResizer(splitResizer, (clientX) => {
      if (!paneStack || layoutMode !== 'split') {
        return;
      }
      const bounds = paneStack.getBoundingClientRect();
      const usableWidth = Math.max(1, bounds.width - 6);
      const ratio = (clientX - bounds.left) / usableWidth;
      applySplitRatio(ratio);
    });

    window.addEventListener('resize', () => {
      applyNavPaneWidth(navPaneWidth, false);
      applySplitRatio(splitRatio, false);
    });
  }

  applyNavPaneWidth(navPaneWidth, false);
  applySplitRatio(splitRatio, false);
  installResizers();

  function isDirectoryExpanded(path) {
    return expandedNavDirectories.has(path) || currentPath.startsWith(`${path}/`);
  }

  function setNavVisible(nextVisible, persist = true) {
    navVisible = Boolean(nextVisible);
    document.body.classList.toggle('nav-hidden', !navVisible);
    if (btnNav) {
      btnNav.classList.toggle('active', navVisible);
      btnNav.setAttribute('aria-pressed', navVisible ? 'true' : 'false');
    }
    if (persist) {
      updatePersistedState({ navVisible });
    }
  }

  function applySourceFormatUi() {
    const canShowPackageControls = sourceFormat === 'mdz' && isMdzFile && !isMarkdownEditor;

    if (btnNav) {
      btnNav.hidden = !canShowPackageControls;
      btnNav.disabled = !canShowPackageControls;
      btnNav.setAttribute('aria-disabled', btnNav.disabled ? 'true' : 'false');
    }

    if (btnTitle) {
      btnTitle.hidden = !canShowPackageControls;
      btnTitle.disabled = !canShowPackageControls;
      btnTitle.setAttribute('aria-disabled', btnTitle.disabled ? 'true' : 'false');
      btnTitle.title = canShowPackageControls
        ? 'Edit document title'
        : 'Package title editing is only available for .mdz files.';
    }

    if (!canShowPackageControls) {
      closeTitleDialog();
      setNavVisible(false, false);
    } else {
      setNavVisible(navVisible, false);
    }
  }

  function createArchiveTree(paths) {
    const root = { directories: new Map(), files: [] };

    for (const entry of paths) {
      const parts = String(entry.path || '').split('/').filter(Boolean);
      if (parts.length === 0) {
        continue;
      }

      let node = root;
      let currentPath = '';
      for (let index = 0; index < parts.length; index += 1) {
        const segment = parts[index];
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const isLeaf = index === parts.length - 1;

        if (isLeaf) {
          node.files.push({
            name: segment,
            path: currentPath,
            isMarkdown: Boolean(entry.isMarkdown),
            isImage: Boolean(entry.isImage),
            isOrphanedAsset: orphanedAssetPaths.has(currentPath.toLowerCase()),
          });
        } else {
          if (!node.directories.has(segment)) {
            node.directories.set(segment, {
              name: segment,
              path: currentPath,
              directories: new Map(),
              files: [],
            });
          }
          node = node.directories.get(segment);
        }
      }
    }

    return root;
  }

  function isManifestPath(archivePath) {
    const path = String(archivePath || '').toLowerCase();
    const filename = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
    return filename === 'manifest.json';
  }

  function canEditCurrentPath() {
    return (currentPathType === 'markdown' || currentPathType === 'text') && !isManifestPath(currentPath);
  }

  function extensionLabelForPath(archivePath) {
    const name = String(archivePath || '').split('/').pop() || '';
    const match = name.match(/\.([^.]+)$/);
    if (!match) {
      return 'FILE';
    }
    return match[1].slice(0, 4).toUpperCase();
  }

  function iconMetaForFile(fileNode) {
    if (isManifestPath(fileNode.path)) {
      return { className: 'manifest', label: '{}' };
    }
    if (fileNode.isMarkdown) {
      return { className: 'markdown markdown-mark', label: '', imageSrc: markdownIconUri };
    }
    if (fileNode.isImage) {
      return { className: 'image', label: extensionLabelForPath(fileNode.path) };
    }
    return { className: 'file', label: extensionLabelForPath(fileNode.path) };
  }

  function renderFileNode(fileNode) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'nav-file';
    if (fileNode.path === currentPath) {
      item.classList.add('current-entry');
      item.setAttribute('aria-current', 'true');
    }
    if (fileNode.isOrphanedAsset) {
      item.classList.add('orphaned-asset');
    }
    item.title = fileNode.isOrphanedAsset
      ? `${fileNode.path} - not referenced by the entry markdown`
      : fileNode.path;

    const iconMeta = iconMetaForFile(fileNode);
    const icon = document.createElement('span');
    icon.className = `nav-file-icon ${iconMeta.className}`;
    icon.setAttribute('aria-hidden', 'true');
    if (iconMeta.imageSrc) {
      const image = document.createElement('img');
      image.src = iconMeta.imageSrc;
      image.alt = '';
      image.draggable = false;
      icon.appendChild(image);
    } else {
      icon.textContent = iconMeta.label;
    }

    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = fileNode.name;

    item.append(icon);

    if (fileNode.isOrphanedAsset) {
      item.appendChild(createBrokenLinkIcon());
    }

    item.append(label);

    item.addEventListener('click', () => {
      host.postMessage({ type: 'openPath', path: fileNode.path });
    });

    if (fileNode.isOrphanedAsset) {
      item.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showOrphanContextMenu(fileNode.path, event.clientX, event.clientY);
      });
    }

    return item;
  }

  function createBrokenLinkIcon() {
    const icon = document.createElement('span');
    icon.className = 'nav-orphan-icon';
    icon.title = 'Orphaned asset';
    icon.setAttribute('aria-label', 'Orphaned asset');
    icon.innerHTML = [
      '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
      '<path d="M5.2 4.1 3.9 5.4a2.5 2.5 0 0 0 3.5 3.5l.8-.8-.9-.9-.8.8a1.2 1.2 0 0 1-1.7-1.7l1.3-1.3a1.2 1.2 0 0 1 1.7 0l.4.4.9-.9-.4-.4a2.5 2.5 0 0 0-3.5 0z"/>',
      '<path d="m8.2 10.6.4.4a2.5 2.5 0 0 0 3.5 0l1.3-1.3a2.5 2.5 0 0 0-3.5-3.5l-.8.8.9.9.8-.8a1.2 1.2 0 1 1 1.7 1.7l-1.3 1.3a1.2 1.2 0 0 1-1.7 0l-.4-.4-.9.9z"/>',
      '<path d="m5 12.8 7.8-7.8-.8-.8-7.8 7.8.8.8z"/>',
      '</svg>',
    ].join('');
    return icon;
  }

  let orphanContextMenu = null;

  function ensureOrphanContextMenu() {
    if (orphanContextMenu) {
      return orphanContextMenu;
    }

    const menu = document.createElement('div');
    menu.id = 'orphan-context-menu';
    menu.className = 'hidden';
    menu.setAttribute('role', 'menu');

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.setAttribute('role', 'menuitem');
    removeButton.textContent = 'Remove Orphaned Asset';
    removeButton.addEventListener('click', () => {
      const path = menu.dataset.path;
      hideOrphanContextMenu();
      if (path) {
        host.postMessage({ type: 'removeOrphanedAsset', path });
      }
    });

    menu.appendChild(removeButton);
    document.body.appendChild(menu);
    orphanContextMenu = menu;
    return menu;
  }

  function showOrphanContextMenu(path, clientX, clientY) {
    const menu = ensureOrphanContextMenu();
    menu.dataset.path = path;
    menu.classList.remove('hidden');

    const maxLeft = Math.max(0, window.innerWidth - menu.offsetWidth - 4);
    const maxTop = Math.max(0, window.innerHeight - menu.offsetHeight - 4);
    menu.style.left = `${Math.min(clientX, maxLeft)}px`;
    menu.style.top = `${Math.min(clientY, maxTop)}px`;

    const firstButton = menu.querySelector('button');
    if (firstButton) {
      firstButton.focus();
    }
  }

  function hideOrphanContextMenu() {
    if (!orphanContextMenu) {
      return;
    }
    orphanContextMenu.classList.add('hidden');
    orphanContextMenu.removeAttribute('data-path');
  }

  function renderDirectoryNode(directoryNode) {
    const details = document.createElement('details');
    details.className = 'nav-directory';
    details.open = isDirectoryExpanded(directoryNode.path);

    const summary = document.createElement('summary');

    const caret = document.createElement('span');
    caret.className = 'nav-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = details.open ? '-' : '+';

    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = directoryNode.name;

    summary.append(caret, label);
    details.appendChild(summary);

    const children = document.createElement('div');
    children.className = 'nav-directory-children';
    appendTreeNodes(children, directoryNode);
    details.appendChild(children);

    details.addEventListener('toggle', () => {
      caret.textContent = details.open ? '-' : '+';
      if (details.open) {
        expandedNavDirectories.add(directoryNode.path);
      } else {
        expandedNavDirectories.delete(directoryNode.path);
      }
    });

    return details;
  }

  function appendTreeNodes(parent, treeNode) {
    const directories = [...treeNode.directories.values()].sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    const files = [...treeNode.files].sort((left, right) => left.name.localeCompare(right.name));

    for (const directory of directories) {
      parent.appendChild(renderDirectoryNode(directory));
    }
    for (const file of files) {
      parent.appendChild(renderFileNode(file));
    }
  }

  function renderArchiveTree() {
    if (!navTree) {
      return;
    }

    navTree.replaceChildren();
    if (!archivePaths.length) {
      const empty = document.createElement('div');
      empty.className = 'nav-empty';
      empty.textContent = 'No archive entries.';
      navTree.appendChild(empty);
      return;
    }

    const tree = createArchiveTree(archivePaths);
    appendTreeNodes(navTree, tree);
  }

  // ── Toolbar toggle ────────────────────────────────────────────────────────
  function updateToolbarToggleState() {
    const isSplit = layoutMode === 'split';
    const editable = canEditCurrentPath();
    if (btnNav) {
      btnNav.classList.toggle('active', navVisible);
    }
    btnPreview.classList.toggle('active', !isSplit && layoutMode === 'preview');
    btnEdit.classList.toggle('active', !isSplit && layoutMode === 'edit');
    btnEdit.disabled = !editable;
    btnEdit.setAttribute('aria-disabled', btnEdit.disabled ? 'true' : 'false');
    if (btnSideBySide) {
      btnSideBySide.classList.toggle('active', isSplit);
      btnSideBySide.disabled = !editable;
      btnSideBySide.setAttribute('aria-disabled', btnSideBySide.disabled ? 'true' : 'false');
    }
  }

  function showPreview(notify = true) {
    layoutMode = layoutMode === 'split' ? 'preview' : layoutMode;
    activeMode = 'preview';
    if (paneStack) paneStack.classList.remove('split-mode');
    previewPane.classList.add('active');
    editPane.classList.remove('active');
    renderPreview();
    if (notify) {
      host.postMessage({ type: 'modeChanged', mode: 'preview' });
    }
    updateToolbarToggleState();
  }

  function showEdit(notify = true) {
    if (!canEditCurrentPath()) {
      setLayoutMode('preview');
      showPreview(notify);
      return;
    }
    layoutMode = layoutMode === 'split' ? 'edit' : layoutMode;
    activeMode = 'edit';
    if (paneStack) paneStack.classList.remove('split-mode');
    editPane.classList.add('active');
    previewPane.classList.remove('active');
    if (notify) {
      host.postMessage({ type: 'modeChanged', mode: 'edit' });
    }
    updateToolbarToggleState();
  }

  function setLayoutMode(nextLayout) {
    if (!canEditCurrentPath()) {
      layoutMode = 'preview';
    } else {
      layoutMode = nextLayout === 'split' ? 'split' : nextLayout === 'edit' ? 'edit' : 'preview';
    }
    if (layoutMode === 'split') {
      if (paneStack) paneStack.classList.add('split-mode');
      previewPane.classList.add('active');
      editPane.classList.add('active');
      renderPreview();
    } else {
      if (paneStack) paneStack.classList.remove('split-mode');
    }
    updateToolbarToggleState();
  }

  function setDisplayTitle(title) {
    currentDisplayTitle = String(title || '').trim() || 'document';
    if (btnTitle) {
      btnTitle.textContent = currentDisplayTitle;
    }
  }

  function openTitleDialog() {
    if (!titleDialogBackdrop || !titleInput || (btnTitle && btnTitle.disabled)) {
      return;
    }
    titleInput.value = currentDisplayTitle;
    if (titleValidation) {
      titleValidation.classList.add('hidden');
    }
    titleDialogBackdrop.classList.remove('hidden');
    titleInput.focus();
    titleInput.select();
  }

  function closeTitleDialog() {
    if (!titleDialogBackdrop) {
      return;
    }
    titleDialogBackdrop.classList.add('hidden');
  }

  function saveTitleFromDialog() {
    if (!titleInput) {
      return;
    }
    const nextTitle = titleInput.value.trim();
    if (!nextTitle) {
      if (titleValidation) {
        titleValidation.classList.remove('hidden');
      }
      titleInput.focus();
      return;
    }
    if (nextTitle === currentDisplayTitle) {
      closeTitleDialog();
      return;
    }
    closeTitleDialog();
    host.postMessage({ type: 'setTitle', title: nextTitle });
  }

  function resetTitleFromDialog() {
    if (!titleInput) {
      return;
    }
    titleInput.value = currentDisplayTitle;
    if (titleValidation) {
      titleValidation.classList.add('hidden');
    }
    titleInput.focus();
    titleInput.select();
  }

  btnPreview.addEventListener('click', () => {
    setLayoutMode('preview');
    showPreview(false);
    host.postMessage({ type: 'setLayout', layout: 'preview' });
  });
  btnEdit.addEventListener('click', () => {
    setLayoutMode('edit');
    showEdit(false);
    host.postMessage({ type: 'setLayout', layout: 'edit' });
  });
  if (btnSideBySide) {
    btnSideBySide.addEventListener('click', () => {
      setLayoutMode('split');
      host.postMessage({ type: 'setLayout', layout: 'split' });
    });
  }
  if (btnNav) {
    btnNav.addEventListener('click', () => {
      setNavVisible(!navVisible);
    });
  }
  if (btnTitle) {
    btnTitle.addEventListener('click', openTitleDialog);
  }
  if (btnTitleCancel) {
    btnTitleCancel.addEventListener('click', closeTitleDialog);
  }
  if (btnTitleReset) {
    btnTitleReset.addEventListener('click', resetTitleFromDialog);
  }
  if (btnTitleSave) {
    btnTitleSave.addEventListener('click', saveTitleFromDialog);
  }
  if (titleInput) {
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTitleFromDialog();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeTitleDialog();
      }
    });
  }
  if (titleDialogBackdrop) {
    titleDialogBackdrop.addEventListener('click', (e) => {
      if (e.target === titleDialogBackdrop) {
        closeTitleDialog();
      }
    });
  }
  if (btnZoomToggle) {
    btnZoomToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setZoomControlsOpen(!zoomControlsOpen);
    });
  }
  if (zoomPopover) {
    zoomPopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  document.addEventListener('click', (e) => {
    hideOrphanContextMenu();
    if (!zoomControlsOpen || !zoomControls || !e.target) {
      return;
    }
    if (!zoomControls.contains(/** @type {Node} */ (e.target))) {
      setZoomControlsOpen(false);
    }
  });
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => applyZoom(zoomLevel - ZOOM_STEP));
  }
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => applyZoom(zoomLevel + ZOOM_STEP));
  }
  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => applyZoom(1));
  }
  setNavVisible(navVisible, false);

  // ── Markdown rendering ────────────────────────────────────────────────────
  /**
   * Render the current editor content to the preview pane.
   * Images with archive-relative src values are replaced by data-URIs.
   */
  function renderPreview() {
    if (currentPathType === 'image') {
      const imageSource = imageMap[currentPath] || imageMap[currentPath.replace(/^\.\//, '')] || '';
      previewContent.innerHTML = imageSource
        ? `<div class="asset-preview-wrap"><img class="asset-preview-image" src="${imageSource}" alt="${escapeHtml(currentPath)}" /></div>`
        : `<div class="asset-preview-empty">Image preview unavailable for ${escapeHtml(currentPath)}.</div>`;
      return;
    }

    if (currentPathType === 'binary') {
      previewContent.innerHTML = `<div class="asset-preview-empty">Binary file preview unavailable for ${escapeHtml(currentPath)}.</div>`;
      return;
    }

    if (currentPathType === 'text') {
      previewContent.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'plain-text-preview';
      const code = document.createElement('code');
      const language = inferLanguageFromPath(currentPath);
      if (language) {
        code.classList.add('hljs');
        code.innerHTML = highlightCodeSource(editor.value, language);
      } else {
        code.textContent = editor.value;
      }
      pre.appendChild(code);
      previewContent.appendChild(pre);
      return;
    }

    const raw = editor.value;

    // Replace relative image paths with data-URIs before parsing
    const rewritten = rewriteImageSrc(raw);

    // marked is loaded inline from the extension; fall back to plain text
    if (typeof marked !== 'undefined') {
      previewContent.innerHTML = marked.parse(rewritten);
      highlightRenderedCodeBlocks();
    } else {
      previewContent.textContent = raw;
    }
  }

  function renderEditorHighlight() {
    if (!editorHighlight) {
      return;
    }

    const code = editorHighlight.querySelector('code') || editorHighlight;
    const source = editor.value || '';
    code.innerHTML = currentPathType === 'markdown'
      ? highlightMarkdownSource(source)
      : escapeHtml(source);
  }

  function syncEditorHighlightScroll() {
    if (!editorHighlight) {
      return;
    }
    editorHighlight.scrollTop = editor.scrollTop;
    editorHighlight.scrollLeft = editor.scrollLeft;

    if (editorLineNumbersContent) {
      editorLineNumbersContent.style.transform = `translateY(${-editor.scrollTop}px)`;
    }
  }

  function renderEditorLineNumbers() {
    if (!editorLineNumbersContent || !editorLineNumbers) {
      return;
    }

    const source = editor.value || '';
    const lineCount = Math.max(1, source.split('\n').length);
    const values = [];
    for (let line = 1; line <= lineCount; line++) {
      values.push(String(line));
    }
    editorLineNumbersContent.textContent = values.join('\n');

    const digits = String(lineCount).length;
    const minWidth = 40;
    const charWidth = 9;
    const gutterWidth = Math.max(minWidth, digits * charWidth + 16);
    editorLineNumbers.style.width = `${gutterWidth}px`;
  }

  function refreshEditorDecorations() {
    renderEditorLineNumbers();
    renderEditorHighlight();
    syncEditorHighlightScroll();
  }

  function highlightMarkdownSource(source) {
    const text = String(source || '');
    if (!text) {
      return '';
    }

    const lines = text.split('\n');
    let inFence = false;

    return lines.map((line) => {
      const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
      if (fenceMatch) {
        inFence = !inFence;
        return `${escapeHtml(fenceMatch[1])}<span class="md-syntax-marker">${escapeHtml(fenceMatch[2])}</span><span class="md-syntax-fence">${escapeHtml(fenceMatch[3])}</span>`;
      }

      if (inFence) {
        return `<span class="md-syntax-code">${escapeHtml(line)}</span>`;
      }

      const headingMatch = line.match(/^(\s{0,3})(#{1,6})(\s+.*)?$/);
      if (headingMatch) {
        return `${escapeHtml(headingMatch[1])}<span class="md-syntax-marker">${escapeHtml(headingMatch[2])}</span><span class="md-syntax-heading">${highlightMarkdownInline(headingMatch[3] || '')}</span>`;
      }

      const quoteMatch = line.match(/^(\s{0,3}>+)(\s?.*)$/);
      if (quoteMatch) {
        return `<span class="md-syntax-quote">${escapeHtml(quoteMatch[1])}</span>${highlightMarkdownInline(quoteMatch[2] || '')}`;
      }

      const ruleMatch = line.match(/^(\s{0,3})([-*_])(?:\s*\2){2,}\s*$/);
      if (ruleMatch) {
        return `${escapeHtml(ruleMatch[1])}<span class="md-syntax-rule">${escapeHtml(line.slice(ruleMatch[1].length))}</span>`;
      }

      const listMatch = line.match(/^(\s*)([-+*]|\d+[.)])(\s+)(.*)$/);
      if (listMatch) {
        return `${escapeHtml(listMatch[1])}<span class="md-syntax-marker">${escapeHtml(listMatch[2])}</span>${escapeHtml(listMatch[3])}${highlightMarkdownInline(listMatch[4])}`;
      }

      return highlightMarkdownInline(line);
    }).join('\n');
  }

  function highlightMarkdownInline(line) {
    const source = String(line || '');
    if (!source) {
      return '';
    }

    const pattern = /(!?\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
    let output = '';
    let index = 0;
    let match;

    while ((match = pattern.exec(source)) !== null) {
      output += escapeHtml(source.slice(index, match.index));
      const token = match[0];
      if (token.startsWith('![')) {
        output += tokenSpan('md-syntax-image', token);
      } else if (token.startsWith('[')) {
        output += tokenSpan('md-syntax-link', token);
      } else if (token.startsWith('`')) {
        output += tokenSpan('md-syntax-code', token);
      } else {
        output += tokenSpan('md-syntax-emphasis', token);
      }
      index = pattern.lastIndex;
    }

    output += escapeHtml(source.slice(index));
    return output;
  }

  function highlightRenderedCodeBlocks() {
    if (!previewContent) {
      return;
    }

    const codeBlocks = previewContent.querySelectorAll('pre > code');
    for (const codeBlock of codeBlocks) {
      const language = languageFromCodeBlock(codeBlock);
      if (!language) {
        continue;
      }

      const source = codeBlock.textContent || '';
      codeBlock.innerHTML = highlightCodeSource(source, language);
      codeBlock.classList.add('hljs');
    }
  }

  function languageFromCodeBlock(codeBlock) {
    const className = String(codeBlock.className || '');
    const match = className.match(/language-([a-z0-9+#-]+)/i);
    return match ? match[1].toLowerCase() : '';
  }

  function inferLanguageFromPath(filePath) {
    const path = String(filePath || '').toLowerCase();
    if (path.endsWith('.json') || path.endsWith('.jsonc')) return 'json';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs')) return 'javascript';
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.jsx')) return 'jsx';
    if (path.endsWith('.html') || path.endsWith('.htm') || path.endsWith('.xml') || path.endsWith('.svg')) return 'html';
    return '';
  }

  function highlightCodeSource(source, language) {
    switch (language) {
      case 'json':
      case 'jsonc':
        return highlightJson(source);
      case 'css':
        return highlightCss(source);
      case 'html':
      case 'xml':
      case 'svg':
        return escapeHtml(source);
      case 'js':
      case 'javascript':
      case 'ts':
      case 'typescript':
      case 'jsx':
      case 'tsx':
        return highlightJavaScript(source);
      default:
        return escapeHtml(source);
    }
  }

  function highlightWithTokenizer(source, tokenPattern, classifyToken) {
    const tokens = [];
    let index = 0;

    while (index < source.length) {
      tokenPattern.lastIndex = index;
      const match = tokenPattern.exec(source);
      if (!match || match.index !== index) {
        tokens.push(escapeHtml(source[index]));
        index += 1;
        continue;
      }

      const token = match[0];
      tokens.push(classifyToken(token, match.index, source));
      index = tokenPattern.lastIndex;
    }

    return tokens.join('');
  }

  function tokenSpan(className, value) {
    return `<span class="${className}">${escapeHtml(value)}</span>`;
  }

  function highlightJson(source) {
    const pattern = /"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]|\s+|./gy;
    return highlightWithTokenizer(source, pattern, (token, start, fullSource) => {
      if (/^"(?:\\.|[^"\\])*"$/.test(token)) {
        return isJsonKey(fullSource, start, token.length)
          ? tokenSpan('hljs-attr', token)
          : tokenSpan('hljs-string', token);
      }
      if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) {
        return tokenSpan('hljs-number', token);
      }
      if (/^(true|false|null)$/.test(token)) {
        return tokenSpan('hljs-literal', token);
      }
      if (/^[{}\[\],:]$/.test(token)) {
        return tokenSpan('hljs-punctuation', token);
      }
      return escapeHtml(token);
    });
  }

  function isJsonKey(source, tokenStart, tokenLength) {
    let index = tokenStart + tokenLength;
    while (index < source.length && /\s/.test(source[index])) {
      index += 1;
    }
    return source[index] === ':';
  }

  function highlightCss(source) {
    const pattern = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[a-z-]+|[{}:;(),.]|\s+|[a-zA-Z_-][\w-]*|./gy;
    return highlightWithTokenizer(source, pattern, (token, start, fullSource) => {
      if (/^\/\*[\s\S]*?\*\/$/.test(token)) {
        return tokenSpan('hljs-comment', token);
      }
      if (/^"(?:\\.|[^"\\])*"$/.test(token) || /^'(?:\\.|[^'\\])*'$/.test(token)) {
        return tokenSpan('hljs-string', token);
      }
      if (/^@[a-z-]+$/i.test(token)) {
        return tokenSpan('hljs-keyword', token);
      }
      if (/^[a-zA-Z_-][\w-]*$/.test(token)) {
        const nextSignificant = nextNonWhitespaceCharacter(fullSource, start + token.length);
        if (nextSignificant === ':') {
          return tokenSpan('hljs-attr', token);
        }
        if (nextSignificant === '{') {
          return tokenSpan('hljs-selector-tag', token);
        }
        return tokenSpan('hljs-title', token);
      }
      if (/^[{}:;(),.]$/.test(token)) {
        return tokenSpan('hljs-punctuation', token);
      }
      return escapeHtml(token);
    });
  }

  function highlightJavaScript(source) {
    const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|import|from|export|default|try|catch|finally|throw|async|await|typeof|instanceof|in|of|this|super|yield|true|false|null|undefined)\b|\b(?:NaN|Infinity)\b|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}()[\].,;:?]|\s+|./gy;
    return highlightWithTokenizer(source, pattern, (token) => {
      if (/^\/\//.test(token) || /^\/\*[\s\S]*?\*\/$/.test(token)) {
        return tokenSpan('hljs-comment', token);
      }
      if (/^`(?:\\.|[^`\\])*`$/.test(token) || /^"(?:\\.|[^"\\])*"$/.test(token) || /^'(?:\\.|[^'\\])*'$/.test(token)) {
        return tokenSpan('hljs-string', token);
      }
      if (/^(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|import|from|export|default|try|catch|finally|throw|async|await|typeof|instanceof|in|of|this|super|yield|true|false|null|undefined|NaN|Infinity)$/.test(token)) {
        return tokenSpan('hljs-keyword', token);
      }
      if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)) {
        return tokenSpan('hljs-number', token);
      }
      if (/^[{}()[\].,;:?]$/.test(token)) {
        return tokenSpan('hljs-punctuation', token);
      }
      return escapeHtml(token);
    });
  }

  function nextNonWhitespaceCharacter(source, startIndex) {
    let index = startIndex;
    while (index < source.length) {
      const character = source[index];
      if (!/\s/.test(character)) {
        return character;
      }
      index += 1;
    }
    return '';
  }

  function normaliseScrollRatio(ratio) {
    if (!Number.isFinite(ratio)) {
      return 0;
    }
    return Math.max(0, Math.min(1, ratio));
  }

  function ratioFromScroll(top, max) {
    if (max <= 0) {
      return 0;
    }
    return normaliseScrollRatio(top / max);
  }

  function scrollMetricsForMode(mode) {
    if (mode === 'edit') {
      const max = editor.scrollHeight - editor.clientHeight;
      return {
        top: editor.scrollTop,
        max,
      };
    }

    const max = previewPane.scrollHeight - previewPane.clientHeight;
    return {
      top: previewPane.scrollTop,
      max,
    };
  }

  function applyScrollRatioToBoth(ratio) {
    const bounded = normaliseScrollRatio(ratio);

    suppressScrollEvents = true;
    try {
      const editMax = Math.max(0, editor.scrollHeight - editor.clientHeight);
      editor.scrollTop = bounded * editMax;

      const previewMax = Math.max(0, previewPane.scrollHeight - previewPane.clientHeight);
      previewPane.scrollTop = bounded * previewMax;
    } finally {
      // Defer unsuppress to next tick to avoid immediate re-emit from same frame.
      setTimeout(() => {
        suppressScrollEvents = false;
      }, 0);
    }
  }

  function emitScrollSyncFromMode(mode) {
    if (suppressScrollEvents) {
      return;
    }

    // In split mode, sync panes directly within the webview — no host roundtrip needed.
    if (layoutMode === 'split') {
      const metrics = scrollMetricsForMode(mode);
      const ratio = ratioFromScroll(metrics.top, metrics.max);
      if (scrollEmitTimer) clearTimeout(scrollEmitTimer);
      scrollEmitTimer = setTimeout(() => { applyScrollRatioToBoth(ratio); }, 16);
      return;
    }

    if (mode !== activeMode) {
      return;
    }

    const metrics = scrollMetricsForMode(mode);
    const ratio = ratioFromScroll(metrics.top, metrics.max);

    if (scrollEmitTimer) {
      clearTimeout(scrollEmitTimer);
    }
    scrollEmitTimer = setTimeout(() => {
      host.postMessage({ type: 'scrollSync', ratio });
    }, 16);
  }

  /**
   * Replace `![alt](path)` image paths with the matching data-URI when
   * available.  Paths may be relative to the entry-point directory.
   */
  function rewriteImageSrc(markdown) {
    const currentDir = currentPath.includes('/')
      ? currentPath.slice(0, currentPath.lastIndexOf('/') + 1)
      : '';

    return markdown.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (match, alt, src) => {
        // Strip query/hash
        const clean = src.split('?')[0].split('#')[0];
        // Try the path as-is first, then relative to the current markdown path.
        const candidates = [clean, currentDir + clean];
        for (const candidate of candidates) {
          const normalised = candidate.replace(/^\.\//, '').replace(/\\/g, '/');
          if (imageMap[normalised]) {
            return `![${alt}](${imageMap[normalised]})`;
          }
        }
        return match; // leave unchanged
      }
    );
  }

  function extensionForMime(mimeType) {
    switch ((mimeType || '').toLowerCase()) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
        return 'jpg';
      case 'image/gif':
        return 'gif';
      case 'image/webp':
        return 'webp';
      case 'image/svg+xml':
        return 'svg';
      default:
        return 'png';
    }
  }

  function insertTextAtCursor(text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
    const nextPos = start + text.length;
    editor.selectionStart = editor.selectionEnd = nextPos;
    refreshEditorDecorations();
  }

  function nextPastedImagePath(extension) {
    const baseDir = currentPath.includes('/')
      ? currentPath.slice(0, currentPath.lastIndexOf('/') + 1)
      : '';
    const folder = `${baseDir}images/`;
    const seed = `pasted-${Date.now()}`;

    let candidate = `${folder}${seed}.${extension}`;
    let counter = 1;
    while (imageMap[candidate]) {
      candidate = `${folder}${seed}-${counter}.${extension}`;
      counter += 1;
    }
    return candidate;
  }

  function fileExtensionFromType(type) {
    return extensionForMime(type);
  }

  function fileExtensionFromName(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.png')) return 'png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
    if (lower.endsWith('.gif')) return 'gif';
    if (lower.endsWith('.webp')) return 'webp';
    if (lower.endsWith('.svg')) return 'svg';
    return 'png';
  }

  function isLikelyImageFile(file) {
    if (!file) {
      return false;
    }
    if (typeof file.type === 'string' && file.type.startsWith('image/')) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(String(file.name || ''));
  }

  function extractDataUrlFromClipboard(clipboard) {
    if (!clipboard || typeof clipboard.getData !== 'function') {
      return null;
    }

    const html = clipboard.getData('text/html');
    if (html) {
      const htmlMatch = html.match(/src=["'](data:image\/[a-zA-Z0-9.+-]+;base64,[^"']+)["']/i);
      if (htmlMatch && htmlMatch[1]) {
        return htmlMatch[1];
      }
    }

    const text = clipboard.getData('text/plain');
    if (text && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(text.trim())) {
      return text.trim();
    }

    return null;
  }

  function mimeTypeFromDataUrl(dataUrl) {
    const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
    return m ? m[1].toLowerCase() : 'image/png';
  }

  async function readClipboardImage(clipboard) {
    if (clipboard) {
      const fileFromFiles = Array.from(clipboard.files || []).find((file) => isLikelyImageFile(file));
      if (fileFromFiles) {
        return {
          blob: fileFromFiles,
          mimeType: fileFromFiles.type || 'image/png',
          source: 'files',
        };
      }

      for (const item of Array.from(clipboard.items || [])) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (isLikelyImageFile(file)) {
            return {
              blob: file,
              mimeType: file.type || `image/${fileExtensionFromName(file.name)}`,
              source: 'items-file',
            };
          }
        }

        if (typeof item.type === 'string' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            return {
              blob: file,
              mimeType: item.type,
              source: 'items-image',
            };
          }
        }
      }

      const dataUrl = extractDataUrlFromClipboard(clipboard);
      if (dataUrl) {
        return {
          dataUrl,
          mimeType: mimeTypeFromDataUrl(dataUrl),
          source: 'data-url',
        };
      }
    }

    if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
      try {
        const clipboardItems = await navigator.clipboard.read();
        for (const clipboardItem of clipboardItems) {
          const imageType = clipboardItem.types.find((type) => type.startsWith('image/'));
          if (!imageType) {
            continue;
          }
          const blob = await clipboardItem.getType(imageType);
          if (blob) {
            return {
              blob,
              mimeType: imageType,
              source: 'clipboard-read',
            };
          }
        }
      } catch {
        // Ignore clipboard read failures and fall through to normal paste.
      }
    }

    return null;
  }

  async function handlePaste(e) {
    if (e.__mdzPasteHandled) {
      return;
    }
    e.__mdzPasteHandled = true;

    if (pasteInFlight) {
      return;
    }

    if (e.defaultPrevented) {
      return;
    }

    if (currentPathType !== 'markdown') {
      return;
    }

    const target = e.target;
    if (target !== editor && document.activeElement !== editor) {
      return;
    }

    const clipboard = e.clipboardData;
    pasteInFlight = true;
    try {
      const imagePayload = await readClipboardImage(clipboard);
      if (!imagePayload) {
        return;
      }

      e.preventDefault();

      const ext = fileExtensionFromType(imagePayload.mimeType);
      const archivePath = nextPastedImagePath(ext);

      const baseDir = currentPath.includes('/')
        ? currentPath.slice(0, currentPath.lastIndexOf('/') + 1)
        : '';
      const markdownPath = archivePath.startsWith(baseDir)
        ? archivePath.slice(baseDir.length)
        : archivePath;

      const markdownImage = `![Pasted image](${markdownPath})`;
      insertTextAtCursor(markdownImage);
      host.postMessage({ type: 'edit', markdown: editor.value });
      renderPreview();

      let dataUrl = imagePayload.dataUrl;
      if (!dataUrl && imagePayload.blob) {
        dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(imagePayload.blob);
        });
      }

      if (!dataUrl) {
        return;
      }

      imageMap[archivePath] = dataUrl;
      const base64Data = String(dataUrl).split(',')[1] || '';
      if (!base64Data) {
        return;
      }

      host.postMessage({
        type: 'pasteImage',
        archivePath,
        base64Data,
      });
    } finally {
      pasteInFlight = false;
    }
  }

  editor.addEventListener('paste', handlePaste);
  window.addEventListener('paste', handlePaste, true);

  editor.addEventListener('scroll', () => {
    syncEditorHighlightScroll();
    emitScrollSyncFromMode('edit');
  });
  previewPane.addEventListener('scroll', () => emitScrollSyncFromMode('preview'));

  window.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }

      // Keep browser-like ctrl+wheel zoom local to this custom editor webview.
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      applyZoom(zoomLevel + direction * ZOOM_STEP);
    },
    { passive: false }
  );

  // ── Editor change → notify extension ─────────────────────────────────────
  let editTimer = null;
  let previewTimer = null;

  function schedulePreviewRender() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      renderPreview();
    }, 100);
  }

  editor.addEventListener('input', () => {
    if (!canEditCurrentPath()) {
      return;
    }
    refreshEditorDecorations();
    schedulePreviewRender();
    // Debounce to avoid sending a message on every keystroke
    clearTimeout(editTimer);
    editTimer = setTimeout(() => {
      host.postMessage({ type: 'edit', markdown: editor.value });
    }, 300);
  });

  // ── Handle Tab key in the editor ──────────────────────────────────────────
  editor.addEventListener('keydown', (e) => {
    if (!canEditCurrentPath()) {
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      refreshEditorDecorations();
      renderPreview();
      host.postMessage({ type: 'edit', markdown: editor.value });
    }
  });

  // ── Inbound messages from the extension ───────────────────────────────────
  host.onMessage((message) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'load') {
      sourceFormat = message.sourceFormat === 'markdown' ? 'markdown' : 'mdz';
      isMdzFile = message.isMdzFile === true;
      isMarkdownEditor = message.isMarkdownEditor === true;
      imageMap    = message.images || {};
      archivePaths = Array.isArray(message.paths) ? message.paths : [];
      orphanedAssetPaths.clear();
      if (Array.isArray(message.orphanedAssetPaths)) {
        for (const assetPath of message.orphanedAssetPaths) {
          orphanedAssetPaths.add(String(assetPath || '').toLowerCase());
        }
      }
      entryPoint  = message.entryPoint || '';
      currentPath = message.currentPath || entryPoint;
      currentPathType = message.currentPathType || 'markdown';
      editor.value = message.markdown || '';
      refreshEditorDecorations();
      fallbackTitle = String(message.suggestedTitle || message.headingFallback || message.fileBaseName || 'document');
      renderArchiveTree();
      applySourceFormatUi();

      // Update toolbar label
      setDisplayTitle(message.displayTitle || entryPoint);

      if (isInitialLoad) {
        if (message.initialMode === 'edit' && canEditCurrentPath()) {
          showEdit(false);
        } else {
          showPreview(false);
        }
        setLayoutMode(message.layout || message.initialMode || 'preview');
        isInitialLoad = false;
      } else {
        // Render updated content; non-editable nodes always display in preview mode.
        if (!canEditCurrentPath()) {
          showPreview(activeMode !== 'preview');
        } else {
          renderPreview();
        }
        if (message.layout) {
          setLayoutMode(message.layout);
        }
      }
    } else if (message.type === 'scrollSync') {
      applyScrollRatioToBoth(message.ratio);
    } else if (message.type === 'setMode') {
      if (message.mode === 'edit') {
        showEdit(false);
      } else if (message.mode === 'preview') {
        showPreview(false);
      }
    } else if (message.type === 'layoutState') {
      setLayoutMode(message.layout);
    }
  });

  // ── Signal readiness to the extension ────────────────────────────────────
  host.postMessage({ type: 'ready' });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && orphanContextMenu && !orphanContextMenu.classList.contains('hidden')) {
      e.preventDefault();
      hideOrphanContextMenu();
    } else if (e.key === 'Escape' && titleDialogBackdrop && !titleDialogBackdrop.classList.contains('hidden')) {
      e.preventDefault();
      closeTitleDialog();
    } else if (e.key === 'Escape' && zoomControlsOpen) {
      e.preventDefault();
      setZoomControlsOpen(false);
      if (btnZoomToggle) {
        btnZoomToggle.focus();
      }
    }
  });

  function escapeHtml(input) {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
