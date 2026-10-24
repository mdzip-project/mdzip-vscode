import {
  MDZIP_HEADING_ID_PREFIX,
  MdzipWorkspaceView,
  computeDocumentStats,
  type MdzipColorScheme,
  type MdzipColorSchemePreference,
  type MdzipConversionAction,
  type MdzipConversionContext,
  type MdzipSourceFormat,
  type MdzipWorkspaceLayout,
  type MdzipPreviewWidthChoice,
  type MdzipSystemColorScheme,
  type MdzipWorkspaceSnapshot,
} from '@mdzip/editor';
import { mdzipMermaidExtension } from '@mdzip/editor/mermaid';
import { EditorView } from '@codemirror/view';
import { buildStatsReport } from './mdzStats';
import { type MarkdownImageResult } from './mdLinkedImage';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

// The "vscode" icon from Codicons (https://github.com/microsoft/vscode-codicons),
// © Microsoft, licensed CC BY 4.0. Marks the color scheme menu's System choice,
// which here follows the VS Code theme.
const VSCODE_THEME_ICON = '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M15.434 1.72887L12.14 0.144875C12.002 0.078875 11.855 0.046875 11.709 0.046875C11.353 0.046875 11.18 0.211875 11.155 0.228875C11.073 0.270875 11.005 0.337875 11.004 0.338875L4.698 6.08888L1.951 4.00488C1.832 3.91388 1.69 3.86987 1.548 3.86987C1.387 3.86987 1.226 3.92788 1.1 4.04288L0.219 4.84387C0.074 4.97587 0.001 5.15688 0.001 5.33687C0.001 5.51687 0.073 5.69688 0.218 5.82888L2.6 8.00088L0.217 10.1719C0.072 10.3039 0 10.4839 0 10.6639C0 10.8439 0.073 11.0249 0.218 11.1569L1.099 11.9579C1.226 12.0729 1.386 12.1309 1.547 12.1309C1.688 12.1309 1.83 12.0859 1.95 11.9959L4.697 9.91187L11.003 15.6619C11.003 15.6619 11.072 15.7299 11.155 15.7719C11.179 15.7889 11.353 15.9529 11.709 15.9529C11.855 15.9529 12.003 15.9209 12.141 15.8549L15.435 14.2709C15.781 14.1049 16.001 13.7539 16.001 13.3699V2.62888C16.001 2.24487 15.781 1.89488 15.435 1.72787L15.434 1.72887ZM7.217 7.99988L12.002 4.36987V11.6299L7.217 7.99988Z"/></svg>';

/**
 * The editor running the extension, as users know it: "VS Code" for VS Code
 * itself (and Insiders), otherwise its own name (Cursor, VSCodium, Windsurf),
 * so labels don't say "VS Code" in an editor that isn't.
 */
const RAW_APP_NAME = (window as unknown as { __MDZIP_APP_NAME__?: string }).__MDZIP_APP_NAME__ ?? '';
const IS_VSCODE = RAW_APP_NAME === '' || /^Visual Studio Code\b/.test(RAW_APP_NAME);
const APP_NAME = IS_VSCODE ? 'VS Code' : RAW_APP_NAME;

/** What the color scheme menu's System choice follows here: the editor's theme. */
function vscodeThemeSource(): MdzipSystemColorScheme {
  // The VS Code logo only in VS Code; other editors get the library's default icon.
  return IS_VSCODE
    ? { colorScheme: detectColorScheme(), label: 'VS Code theme', icon: VSCODE_THEME_ICON }
    : { colorScheme: detectColorScheme(), label: `${APP_NAME} theme` };
}

const PREVIEW_WIDTHS: readonly MdzipPreviewWidthChoice[] = ['narrow', 'default', 'wide', 'full'];
// Kept across editor recreation (layout or source-format changes rebuild it):
// the user's color scheme choice, and the page width from the mdzip.previewWidth
// setting, which the host sends with every open and when the setting changes.
let colorSchemePreference: MdzipColorSchemePreference = 'system';
let previewWidth: MdzipPreviewWidthChoice = 'default';

interface OpenWorkspaceMessage {
  type: 'openWorkspace';
  bytesBase64: string;
  sourceFormat: MdzipSourceFormat;
  fileName: string;
  layout?: MdzipWorkspaceLayout;
}

interface OpenWorkspaceDirectMessage {
  type: 'openWorkspaceDirect';
  workspace: string; // JSON-serialized workspace; assets have a pre-resolved dataUri field
  // Raw archive bytes for incremental patching, as a bare ArrayBuffer — only
  // an ArrayBuffer (not a Uint8Array/TypedArray, not base64 text) gets
  // vscode's efficient, correctly-recreated postMessage transfer. See the
  // matching comment in mdzEditorProvider.ts.
  archiveBytes?: ArrayBuffer;
  sourceFormat: MdzipSourceFormat;
  fileName: string;
  layout?: MdzipWorkspaceLayout;
  // See the matching comment in mdzEditorProvider.ts's OpenWorkspaceDirectMessage.
  readOnly: boolean;
}

interface DocumentTextMessage {
  type: 'documentText';
  requestId: number;
  text: string;
}

/**
 * Sent only to the throwaway panel `mdzip.convertFolderToMdz` opens (see
 * runPackFilesDialog in extension.ts) — never to a real document's editor panel.
 * `files` is the host's already-collected folder walk; packFilesAsWorkspace is
 * @mdzip/editor's own built-in Document/Project mode + entry-point dialog.
 */
interface PackFilesMessage {
  type: 'packFiles';
  files: Array<{ path: string; bytesBase64: string }>;
  title?: string;
  fileName?: string;
}

const vscode = acquireVsCodeApi();
const root = document.getElementById('mdzip-editor-root');

if (!root) {
  throw new Error('MDZip editor root was not found.');
}
const rootElement = root;

let currentLayout: MdzipWorkspaceLayout = 'preview';
let currentSourceFormat: MdzipSourceFormat = 'mdz';
let editor: MdzipWorkspaceView | null = null;
let hasOpenedWorkspace = false;

// Separate from `editor` above: only the throwaway convertFolderToMdz panel ever
// receives a 'packFiles' message, and it never sends openWorkspace/openWorkspaceDirect,
// so `editor` stays null for that panel's whole lifetime. Kept as its own instance
// (chrome-less — see the `controls` below) rather than reusing `editor`'s state
// machine, so this path can't interfere with the normal open-workspace flow.
let packEditor: MdzipWorkspaceView | null = null;

async function handlePackFiles(message: PackFilesMessage): Promise<void> {
  const files = message.files.map((file) => ({ path: file.path, bytes: base64ToBytes(file.bytesBase64) }));
  if (!packEditor) {
    packEditor = new MdzipWorkspaceView(rootElement, {
      initialColorScheme: detectColorScheme(),
      controls: {
        toolbar: false,
        navigation: false,
        title: false,
        layout: false,
        formatting: false,
        contextMenu: false,
        save: false,
        zoom: false,
        colorScheme: false,
        orphanActions: false,
        fileActions: false,
        search: false,
      },
    });
  }

  try {
    const result = await packEditor.packFilesAsWorkspace(files, { title: message.title, fileName: message.fileName });
    vscode.postMessage({
      type: 'packFilesResult',
      result: result
        ? {
            mode: result.mode,
            entryPoint: result.entryPoint,
            archiveBytesBase64: bytesToBase64(result.archiveBytes),
            opened: result.opened,
          }
        : null,
    });
  } catch (error) {
    vscode.postMessage({
      type: 'packFilesResult',
      result: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

// Off-main-thread archive parsing: the host (mdzEditorProvider.ts) injects the
// webview-resource URL of the pre-bundled mdz-archive.worker.js as a global
// before this script loads. One Worker per editor instance — created
// alongside it below, reused across every open()/openWorkspace() call on that
// instance (including reloads), and left to the editor's destroy() to
// terminate. Falls back to undefined (main-thread parsing) if the URL wasn't
// injected or the environment blocks Worker construction.
function createArchiveWorker(): Worker | undefined {
  const url = (window as unknown as { __MDZIP_WORKER_URL__?: string }).__MDZIP_WORKER_URL__;
  if (!url) { return undefined; }
  try {
    return new Worker(url, { type: 'module' });
  } catch (error) {
    console.error('[MDZip webview] Failed to start the archive worker; falling back to main-thread parsing.', error);
    return undefined;
  }
}
let currentWorker: Worker | undefined;

// Maps relative asset paths to data URIs for disk-sourced images (plain .md files).
// Populated on each openWorkspaceDirect; the single error listener reads it at fire time.
const diskImageMap = new Map<string, string>();
let diskImageListenerInstalled = false;

function updateDiskImageMap(assets: unknown[]): void {
  diskImageMap.clear();
  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') { continue; }
    const { path: p, dataUri: d } = asset as Record<string, unknown>;
    if (typeof p === 'string' && typeof d === 'string' && d.startsWith('data:')) {
      diskImageMap.set(p.replace(/\\/g, '/'), d);
    }
  }

  if (diskImageMap.size > 0 && !diskImageListenerInstalled) {
    diskImageListenerInstalled = true;
    // Capture-phase listener: fires before the element's own handlers, reliably
    // catches images blocked by the webview origin or CSP.
    document.addEventListener('error', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) { return; }
      const src = target.getAttribute('src') ?? '';
      if (src.startsWith('data:')) { return; } // already a data URI — don't loop
      for (const [assetPath, dataUri] of diskImageMap) {
        if (src === assetPath || src.endsWith('/' + assetPath)) {
          target.src = dataUri;
          return;
        }
      }
    }, true);
  }
}

// Pasting/inserting an image into a plain .md: the editor asks the host how to
// handle it (linked file vs. convert to .mdz). The host owns the prompts and
// the file write. For a linked image it's two steps, so cancelling the
// Markdown/HTML insert dialog leaves nothing on disk: the host *prepares* the
// image (choice + target), the editor's own dialog runs here, then the host is
// told to commit (write) or drop it.
const pendingImageRequests = new Map<number, (result: MarkdownImageResult) => void>();
const pendingImageCommits = new Map<number, (reply: { ok: boolean; message?: string }) => void>();
let nextImageRequestId = 1;

function requestMarkdownImage(request: { kind: 'image-file' | 'image-picker'; fileName?: string; base64Data?: string }): Promise<{ requestId: number; result: MarkdownImageResult }> {
  return new Promise((resolve) => {
    const requestId = nextImageRequestId++;
    pendingImageRequests.set(requestId, (result) => resolve({ requestId, result }));
    vscode.postMessage({ type: 'markdownImageRequest', requestId, ...request });
  });
}

function commitMarkdownImage(requestId: number, commit: boolean): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    pendingImageCommits.set(requestId, resolve);
    vscode.postMessage({ type: 'markdownImageCommit', requestId, commit });
  });
}

function reportImageFailure(message: string): void {
  vscode.postMessage({ type: 'workspaceFailed', message });
}

async function handleConversionRequested(
  action: MdzipConversionAction,
  context: MdzipConversionContext
): Promise<boolean> {
  // The nav button keeps the editor's built-in convert dialog.
  if (action.kind === 'navigation') { return false; }
  const request = action.kind === 'image-file'
    ? {
        kind: 'image-file' as const,
        fileName: action.file.name || 'image',
        base64Data: bytesToBase64(new Uint8Array(await action.file.arrayBuffer())),
      }
    : { kind: 'image-picker' as const };
  const { requestId, result } = await requestMarkdownImage(request);
  switch (result.action) {
    case 'builtin':
      return false;
    case 'convert':
      await context.convertToMdz();
      return true;
    case 'prepared': {
      const bytes = base64ToBytes(result.dataUri.split(',')[1] ?? '');
      // The same Markdown-vs-HTML / alt text / size / alignment flow a .mdz gets.
      let decision = null;
      try {
        decision = await context.promptImageInsert({ bytes, fileName: result.fileName, altText: result.altText });
      } catch (error) {
        reportImageFailure(error instanceof Error ? error.message : String(error));
      }
      const commit = await commitMarkdownImage(requestId, decision !== null);
      if (!decision) { return true; }
      if (!commit.ok) {
        reportImageFailure(commit.message ?? 'Could not save the image.');
        return true;
      }
      // The preview only resolves relative images that are workspace assets
      // (it strips the src of anything else), so register the file as one
      // before its link is inserted. It stays a .md — this doesn't touch the text.
      try {
        await editor?.addAsset(result.relativePath, bytes);
      } catch (error) {
        reportImageFailure(`The image was saved, but the preview could not load it: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!await context.insertMarkdown(context.formatImageInsert(result.src, decision))) {
        reportImageFailure('The image was saved, but its link could not be inserted.');
      }
      return true;
    }
    case 'error':
      reportImageFailure(result.message);
      return true;
    default:
      return true;
  }
}

const loadingEl = document.getElementById('mdzip-loading');

// Lazy document text: documents tagged lazyText by the host get a readText()
// that round-trips through the extension host instead of carrying the full
// text in the openWorkspaceDirect payload (which can be hundreds of MB).
const pendingTextRequests = new Map<number, (text: string) => void>();
let nextTextRequestId = 1;

// Files dragged from VS Code's Explorer reach the webview only as URIs
// (text/uri-list); the extension host reads them (readDroppedUris).
const pendingDropRequests = new Map<number, (files: Array<{ name: string; bytes: Uint8Array }>) => void>();
let nextDropRequestId = 1;

function requestDroppedFiles(uris: string[]): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  return new Promise((resolve, reject) => {
    const requestId = nextDropRequestId++;
    const timer = window.setTimeout(() => {
      pendingDropRequests.delete(requestId);
      reject(new Error('Timed out reading the dropped files from the extension host.'));
    }, 60000);
    pendingDropRequests.set(requestId, (files) => {
      window.clearTimeout(timer);
      resolve(files);
    });
    vscode.postMessage({ type: 'readDroppedUris', requestId, uris });
  });
}

function requestDocumentText(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = nextTextRequestId++;
    // A lost request must reject loudly (surfaces via onFailed → error toast)
    // rather than leave callers awaiting forever with no visible failure.
    const timer = window.setTimeout(() => {
      pendingTextRequests.delete(requestId);
      console.error(`[MDZip webview] readDocumentText timed out: ${path} (request ${requestId})`);
      reject(new Error(`Timed out reading "${path}" from the extension host.`));
    }, 30000);
    pendingTextRequests.set(requestId, (text) => {
      window.clearTimeout(timer);
      resolve(text);
    });
    vscode.postMessage({ type: 'readDocumentText', requestId, path });
  });
}

function normalizeLayout(value: unknown): MdzipWorkspaceLayout {
  if (value === 'split' || value === 'source' || value === 'preview') {
    return value;
  }
  // The host's legacy 'edit' mode maps to the library's 'source' layout.
  if (value === 'edit') {
    return 'source';
  }
  return 'preview';
}

// Reads the layout the user is currently looking at from the library's toolbar.
// The library has no public layout getter and resets its internal layout to the
// constructor's `initialLayout` on every openWorkspace(), so before a reload we
// recover the live layout from the active toolbar button (marked with
// aria-pressed="true" on a stable data-ref). Falls back to the last layout we
// created the editor with when the toolbar isn't present.
function readCurrentLayout(): MdzipWorkspaceLayout {
  const refs: Array<[string, MdzipWorkspaceLayout]> = [
    ['preview-btn', 'preview'],
    ['split-btn', 'split'],
    ['source-btn', 'source'],
  ];
  for (const [ref, layout] of refs) {
    const btn = rootElement.querySelector(`[data-ref="${ref}"]`);
    if (btn?.getAttribute('aria-pressed') === 'true') {
      return layout;
    }
  }
  return currentLayout;
}

// Whether the contents pane is open, read from the library's toggle button
// (aria-pressed on data-ref="nav-btn"); there is no public getter.
function readNavigationOpen(): boolean {
  return rootElement.querySelector('[data-ref="nav-btn"]')?.getAttribute('aria-pressed') === 'true';
}

// Bumped on every open, so a slow reload can't restore its file over a newer one's.
let openGeneration = 0;

// What a reload puts back: the open file, the contents pane, the scroll position.
interface ViewState {
  path: string | null;
  navigationOpen: boolean;
  scroll: ScrollPosition | null;
}
// Set from a reload's start until it has restored the view.
let pendingViewState: ViewState | null = null;

// Where the user was scrolled to, kept across a reload. The preview is
// remembered as the heading at or above the top of the pane plus how far past
// it the user had scrolled, because an edit above that point (or images still
// loading) moves everything below it; previewTop is the fallback for a file
// with no headings. The source pane is remembered by line (see SourcePosition).
interface ScrollPosition {
  headingId: string | null;
  headingOffset: number;
  previewTop: number;
  source: SourcePosition | null;
}

// The source pane's top line, by number and text, and how far past its top the
// pane was scrolled (negative: the line starts below the top). Not a pixel
// offset: CodeMirror only measures the lines on screen, so after a reload the
// same scrollTop lands on a different line. The first non-blank line at the
// top is used, and found again by its text, nearest the old line number, so
// lines added above it don't move the view.
interface SourcePosition {
  line: number;
  text: string;
  offset: number;
}

function sourceView(): EditorView | null {
  const dom = rootElement.querySelector<HTMLElement>('.cm-editor');
  const view = dom ? EditorView.findFromDOM(dom) : null;
  // Hidden in the preview-only layout.
  return view && view.dom.offsetParent !== null ? view : null;
}

function readSourcePosition(): SourcePosition | null {
  const view = sourceView();
  if (!view || view.scrollDOM.scrollTop <= 0) { return null; }
  const height = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
  const doc = view.state.doc;
  let line = doc.lineAt(view.lineBlockAtHeight(height).from);
  for (let n = line.number; n <= Math.min(doc.lines, line.number + 50); n++) {
    if (doc.line(n).text.trim()) { line = doc.line(n); break; }
  }
  return { line: line.number, text: line.text, offset: height - view.lineBlockAt(line.from).top };
}

function restoreSourcePosition(position: SourcePosition): void {
  const view = sourceView();
  if (!view) { return; }
  const doc = view.state.doc;
  const start = Math.min(position.line, doc.lines);
  let found = start;
  if (doc.line(start).text !== position.text) {
    for (let distance = 1; distance < doc.lines; distance++) {
      const above = start - distance;
      const below = start + distance;
      if (above >= 1 && doc.line(above).text === position.text) { found = above; break; }
      if (below <= doc.lines && doc.line(below).text === position.text) { found = below; break; }
      if (above < 1 && below > doc.lines) { break; }
    }
  }
  view.dispatch({ effects: EditorView.scrollIntoView(doc.line(found).from, { y: 'start', yMargin: -position.offset }) });
}

function previewPane(): HTMLElement | null {
  const pane = rootElement.querySelector<HTMLElement>('[data-ref="preview-pane"]');
  // Hidden in the source-only layout.
  return pane && pane.offsetParent !== null ? pane : null;
}

function readScrollPosition(): ScrollPosition {
  const pane = previewPane();
  let headingId: string | null = null;
  let headingOffset = 0;
  if (pane && pane.scrollTop > 0) {
    const paneTop = pane.getBoundingClientRect().top;
    for (const heading of Array.from(pane.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'))) {
      const top = heading.getBoundingClientRect().top;
      if (top - paneTop > 1) { break; }
      headingId = heading.id;
      headingOffset = paneTop - top;
    }
  }
  return { headingId, headingOffset, previewTop: pane?.scrollTop ?? 0, source: readSourcePosition() };
}

// Keeps a restored scroll position in place while the preview settles (later
// chunks mounting, images loading, the library's own anchor pin), until the
// user scrolls, clicks or types, or the next open.
let releaseScrollHold: (() => void) | null = null;

function holdScroll(apply: () => void): void {
  releaseScrollHold?.();
  const content = rootElement.querySelector<HTMLElement>('[data-ref="preview-content"]');
  const observer = typeof ResizeObserver === 'undefined' || !content ? null : new ResizeObserver(() => apply());
  if (observer && content) { observer.observe(content); }
  const userEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  const release = (): void => {
    observer?.disconnect();
    for (const type of userEvents) { window.removeEventListener(type, release, true); }
    if (releaseScrollHold === release) { releaseScrollHold = null; }
  };
  for (const type of userEvents) { window.addEventListener(type, release, true); }
  releaseScrollHold = release;
  apply();
}

async function restoreScrollPosition(view: MdzipWorkspaceView, position: ScrollPosition, generation: number): Promise<void> {
  await view.whenRendered();
  if (generation !== openGeneration || view !== editor) { return; }
  await restorePreviewScroll(view, position, generation);
  // The source pane last: in split layout, restoring the preview scrolls the
  // source along with it.
  if (generation !== openGeneration || view !== editor || !position.source) { return; }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (generation !== openGeneration || view !== editor) { return; }
  restoreSourcePosition(position.source);
}

async function restorePreviewScroll(view: MdzipWorkspaceView, position: ScrollPosition, generation: number): Promise<void> {
  const pane = previewPane();
  if (!pane) { return; }
  // scrollToAnchor() finds a heading not drawn yet (further down a long file)
  // only by its plain name, without the id prefix the preview adds.
  const anchor = position.headingId?.startsWith(MDZIP_HEADING_ID_PREFIX)
    ? position.headingId.slice(MDZIP_HEADING_ID_PREFIX.length)
    : position.headingId;
  if (position.headingId && anchor && await view.scrollToAnchor(anchor)) {
    if (generation !== openGeneration || view !== editor) { return; }
    // Looked up on every pass: the preview can re-render while it settles,
    // replacing the heading element.
    const selector = `[id="${CSS.escape(position.headingId)}"]`;
    if (pane.querySelector(selector)) {
      holdScroll(() => {
        const target = pane.querySelector<HTMLElement>(selector);
        if (target) {
          pane.scrollTop += target.getBoundingClientRect().top - pane.getBoundingClientRect().top + position.headingOffset;
        }
      });
      return;
    }
  }
  if (position.previewTop > 0) {
    holdScroll(() => { pane.scrollTop = position.previewTop; });
  }
}

window.addEventListener('message', (event: MessageEvent<OpenWorkspaceMessage | OpenWorkspaceDirectMessage | DocumentTextMessage | PackFilesMessage>) => {
  const message = event.data;
  if ((message as { type?: string })?.type === 'droppedFiles') {
    const { requestId, files } = message as unknown as { requestId: number; files: Array<{ name: string; base64: string }> };
    const resolve = pendingDropRequests.get(requestId);
    if (resolve) {
      pendingDropRequests.delete(requestId);
      resolve(files.map((file) => ({ name: file.name, bytes: base64ToBytes(file.base64) })));
    }
    return;
  }
  if (message?.type === 'documentText') {
    const resolve = pendingTextRequests.get(message.requestId);
    if (resolve) {
      pendingTextRequests.delete(message.requestId);
      resolve(message.text);
    }
    return;
  }
  if ((message as { type?: string })?.type === 'markdownImageResult') {
    const { requestId, result } = message as unknown as { requestId: number; result: MarkdownImageResult };
    const resolve = pendingImageRequests.get(requestId);
    if (resolve) {
      pendingImageRequests.delete(requestId);
      resolve(result);
    }
    return;
  }
  if ((message as { type?: string })?.type === 'markdownImageCommitted') {
    const { requestId, ok, message: reason } = message as unknown as { requestId: number; ok: boolean; message?: string };
    const resolve = pendingImageCommits.get(requestId);
    if (resolve) {
      pendingImageCommits.delete(requestId);
      resolve({ ok, message: reason });
    }
    return;
  }
  if (message?.type === 'packFiles') {
    void handlePackFiles(message);
    return;
  }
  if ((message as { type?: string })?.type === 'setPreviewWidth') {
    const width = (message as unknown as { width?: string }).width as MdzipPreviewWidthChoice;
    if (PREVIEW_WIDTHS.includes(width) && width !== previewWidth) {
      previewWidth = width;
      editor?.setPreviewMaxWidth(width);
    }
    return;
  }
  if (message?.type !== 'openWorkspace' && message?.type !== 'openWorkspaceDirect') {
    return;
  }

  hasOpenedWorkspace = true;
  const isFirst = !editor;
  // The host's message.layout only reflects the *initial* layout — it never sees
  // the user's in-toolbar layout toggles. So trust it for the first open, but on
  // any re-send (notably an external-change reload) preserve the layout the user
  // is actually viewing. Without this, the library's openWorkspace() reset would
  // silently snap an edited/split view back to preview when a file changes on disk.
  const layout = isFirst ? normalizeLayout(message.layout) : readCurrentLayout();
  // A reload (the file changed on disk) re-opens the whole archive, which
  // shows the entry point again; keep the file the user was reading and,
  // when the editor is re-created below, the contents pane open or closed.
  // A reload that arrives while the previous one is still restoring (an agent
  // making several changes in a row) reuses what that one saved: read now, the
  // view would be showing the entry point mid-reload.
  const viewState: ViewState | null = isFirst ? null : pendingViewState ?? {
    path: editor?.getCurrentPath() ?? null,
    navigationOpen: readNavigationOpen(),
    scroll: readScrollPosition(),
  };
  pendingViewState = viewState;
  const previousPath = viewState?.path ?? null;
  const navigationOpen = viewState?.navigationOpen ?? false;
  const scrollPosition = viewState?.scroll ?? null;
  const generation = ++openGeneration;
  const restoreDone = (): void => {
    if (generation === openGeneration) { pendingViewState = null; }
  };
  releaseScrollHold?.();

  if (!editor) {
    currentLayout = layout;
    currentSourceFormat = message.sourceFormat;
    editor = createEditor(currentLayout, currentSourceFormat);
    currentWorker = createArchiveWorker();
  } else if (layout !== currentLayout || message.sourceFormat !== currentSourceFormat) {
    editor.destroy();
    rootElement.replaceChildren();
    currentLayout = layout;
    currentSourceFormat = message.sourceFormat;
    editor = createEditor(currentLayout, currentSourceFormat, navigationOpen);
    // destroy() above terminates the worker paired with the old editor instance.
    currentWorker = createArchiveWorker();
  }
  const openedEditor = editor;
  const restorePath = async (): Promise<void> => {
    if (!previousPath || generation !== openGeneration || openedEditor !== editor) { return; }
    // openPath() is false when the file is gone: the entry point stays open,
    // at its top.
    if (openedEditor.getCurrentPath() !== previousPath && !(await openedEditor.openPath(previousPath))) { return; }
    if (scrollPosition) { await restoreScrollPosition(openedEditor, scrollPosition, generation); }
  };

  if (message.type === 'openWorkspaceDirect') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawWorkspace = JSON.parse(message.workspace) as any;
    // Reattach asset reader functions stripped by JSON serialization.
    // readDataUri is used for preview rendering; readBytes is used by MdzPackagerCore when rebuilding the ZIP.
    if (Array.isArray(rawWorkspace.assets)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawWorkspace.assets = rawWorkspace.assets.map((asset: any) => ({
        ...asset,
        readDataUri: asset.dataUri != null
          ? () => Promise.resolve(asset.dataUri as string)
          : undefined,
        readBytes: asset.dataUri != null
          ? async () => base64ToBytes((asset.dataUri as string).split(',')[1] ?? '')
          : undefined,
      }));
    }
    updateDiskImageMap(Array.isArray(rawWorkspace.assets) ? rawWorkspace.assets : []);
    // Reattach document readers for lazy documents (text stays on the host side
    // until the document is actually opened in the navigator). The library clears
    // isLazy when it materializes text through readText.
    if (Array.isArray(rawWorkspace.documents)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawWorkspace.documents = rawWorkspace.documents.map((doc: any) =>
        doc?.isLazy && !doc.text
          ? { ...doc, readText: () => requestDocumentText(doc.path as string) }
          : doc);
    }
    const openPromise = editor.openWorkspace(rawWorkspace, {
      sourceFormat: message.sourceFormat,
      fileName: message.fileName,
      // When present, asset/manifest edits patch these bytes incrementally
      // instead of rebuilding the ZIP from the workspace.
      archiveBytes: message.archiveBytes ? new Uint8Array(message.archiveBytes) : undefined,
      worker: currentWorker,
      // Read-only files on disk (checked via fs.stat's permission bit — see
      // MdzDocument.readOnly) open the library's built-in read-only mode:
      // disables the CodeMirror editor, save/title buttons, drag, etc.,
      // instead of accepting edits that only fail with EPERM at save time.
      mode: message.readOnly ? 'read-only' : 'editable',
    });
    if (isFirst) {
      void openPromise.finally(() => { loadingEl?.remove(); });
    } else {
      void openPromise.then(restorePath).catch(() => { /* reported by the open itself */ }).finally(restoreDone);
    }
    return;
  }

  const openPromise = editor.open(base64ToBytes(message.bytesBase64), {
    sourceFormat: message.sourceFormat,
    fileName: message.fileName,
    worker: currentWorker,
  });
  if (isFirst) {
    void openPromise.finally(() => { loadingEl?.remove(); });
  } else {
    void openPromise.then(restorePath).catch(() => { /* reported by the open itself */ }).finally(restoreDone);
  }
});

postReadyUntilOpened();

// Suppress VS Code's default webview context menu (Cut/Copy/Paste) outside of
// places where it is actually functional: text inputs, the CodeMirror editor,
// and text selections in the preview. Everywhere else (nav tree, toolbar) the
// default items do nothing and just look broken. The library's own context
// menus (e.g. orphaned-asset actions) attach deeper and still work.
// Capture phase: VS Code's webview bootstrap registers its own bubble-phase
// contextmenu listener before this script loads, so a bubble-phase
// preventDefault here runs too late for it to see. Capture runs first.
window.addEventListener('contextmenu', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, [contenteditable], .cm-editor')) {
    return;
  }
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    return;
  }
  event.preventDefault();
}, { capture: true });

// Live theme sync: VS Code updates body attributes when the user switches
// color theme. The editor's System choice follows it (unless the user picked
// Light or Dark in the toolbar menu), switching in place: no editor
// recreation, so CodeMirror state and unsaved edits survive.
new MutationObserver(() => {
  editor?.setSystemColorScheme(vscodeThemeSource());
}).observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind', 'class'] });


// Status bar statistics (mdzip-vscode#12). onSnapshotChanged fires for every
// workspace event — selection moves included — so debounce, and skip the count
// entirely when the counted text hasn't changed.
const STATS_DEBOUNCE_MS = 200;
let statsTimer: number | undefined;
let lastStatsSource: string | null = null; // source format + entry path
let lastStatsText: string | null = null;

function scheduleStatsReport(snapshot: MdzipWorkspaceSnapshot): void {
  window.clearTimeout(statsTimer);
  statsTimer = window.setTimeout(() => postStatsReport(snapshot), STATS_DEBOUNCE_MS);
}

function postStatsReport(snapshot: MdzipWorkspaceSnapshot): void {
  const isMarkdown = snapshot.currentPathType === 'markdown';
  // The source format is part of the key: converting a .md to an .mdz changes
  // what the report says (the entry name) without touching the path or text.
  const source = `${snapshot.sourceFormat}:${snapshot.currentPath}`;
  if (isMarkdown && source === lastStatsSource && snapshot.currentText === lastStatsText) {
    return;
  }
  lastStatsSource = isMarkdown ? source : null;
  lastStatsText = isMarkdown ? snapshot.currentText : null;

  vscode.postMessage({ type: 'documentStats', report: buildStatsReport(snapshot, computeDocumentStats) });
}

function postSnapshot(
  type: 'workspaceChanged' | 'workspaceSaved',
  bytes: Uint8Array,
  snapshot: MdzipWorkspaceSnapshot
): void {
  vscode.postMessage({
    type,
    archiveBase64: bytesToBase64(bytes),
    currentText: snapshot.currentText,
    currentPath: snapshot.currentPath,
    currentPathType: snapshot.currentPathType,
    sourceFormat: snapshot.sourceFormat,
    dirty: snapshot.dirty,
  });
}

function detectColorScheme(): MdzipColorScheme {
  const themeKind = document.body.getAttribute('data-vscode-theme-kind');
  if (themeKind) {
    return themeKind === 'vscode-light' || themeKind === 'vscode-high-contrast-light' ? 'light' : 'dark';
  }
  if (document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light')) {
    return 'light';
  }
  return 'dark';
}

function createEditor(
  initialLayout: MdzipWorkspaceLayout,
  sourceFormat: MdzipSourceFormat,
  navigationOpen = false
): MdzipWorkspaceView {
  const isMdz = sourceFormat === 'mdz';
  return new MdzipWorkspaceView(rootElement, {
    controls: {
      preset: 'hosted-editor',
      navigation: isMdz,
      title: isMdz,
      orphanActions: isMdz,
      // VS Code's webview host already provides find-in-page (Ctrl+F) over
      // the rendered content, so the editor's own search button would be
      // redundant here.
      search: false,
    },
    navigationButtonActive: navigationOpen,
    // Right-click a file in the tree: open it in a VS Code editor (draw.io for a
    // .drawio.svg, the PDF viewer for a .pdf, ...), straight from the archive.
    // Shift+drag from VS Code's Explorer onto the file tree: the drop carries
    // only URIs, so the extension host reads the files.
    resolveDroppedUris: isMdz ? requestDroppedFiles : undefined,
    hostFileActions: isMdz ? [{
      id: 'open-in-vscode',
      label: `Open in ${APP_NAME} Editor`,
      run: (file) => vscode.postMessage({ type: 'openArchiveEntry', path: file.path }),
    }] : undefined,
    initialLayout,
    // System (the default) follows the VS Code theme, shown as "VS Code theme"
    // with the VS Code icon; a Light or Dark pick is kept across recreation.
    initialColorScheme: colorSchemePreference,
    systemColorScheme: vscodeThemeSource(),
    onColorSchemePreferenceChanged: (preference) => {
      colorSchemePreference = preference;
    },
    // The page width menu reads and writes the mdzip.previewWidth setting.
    previewMaxWidth: previewWidth,
    onPreviewWidthChanged: (width) => {
      previewWidth = width;
      vscode.postMessage({ type: 'previewWidthChanged', width });
    },
    // Tighten the built-in toolbar and content spacing to sit closer to VS
    // Code's native UI density. (contentDensity only supports comfortable/compact.)
    toolbarDensity: 'dense',
    contentDensity: 'compact',
    // Pasting/dropping an image opens the built-in dialog for Markdown vs HTML,
    // alt text, sizing, and alignment instead of inserting a bare
    // ![alt](path). The HTML path uses portable `align` attributes, which
    // survive the preview sanitizer (it strips inline `style`).
    imageInsertMode: 'ask',
    // VS Code runs with spell-check disabled and shows its own Cut/Copy/Paste-
    // only menu for Shift+Right-Click, so the "Spelling Suggestions" hint
    // would promise something that can never appear here.
    showSpellingSuggestionsHint: false,
    // This is a live-editing host: the preview re-renders on every keystroke.
    // 'initial' keeps the first-load reveal animation but snaps packaged images
    // open on same-document edits, avoiding a loading pulse on each re-render.
    imageHydrationAnimation: 'initial',
    // Renders fenced ```mermaid blocks to inline SVG in the preview. The mermaid
    // library is bundled into editor.bundle.js and loaded only when a document
    // actually contains a mermaid block. Theme follows the editor color scheme.
    markdownExtensions: [mdzipMermaidExtension()],
    // Without this, marked+DOMPurify render the whole document synchronously
    // before anything is mounted — on a large chat-export-style .mdz (thousands
    // of message rows/images) that blocks the webview's thread for seconds and
    // can trip VS Code's "window is not responding" prompt. Chunks the render
    // near the viewport instead (verified against a real 39MB/15K-image export).
    progressiveTextRendering: true,
    onChanged: (bytes, snapshot) => {
      postSnapshot('workspaceChanged', bytes, snapshot);
    },
    // Manifest-only edits (e.g. title dialog) skip the archive rebuild entirely;
    // the host patches manifest.json into the real bytes incrementally.
    onManifestChanged: (event) => {
      vscode.postMessage({
        type: 'manifestChanged',
        manifest: event.snapshot.workspace.manifest ?? null,
        dirty: event.snapshot.dirty,
      });
    },
    onSaved: (bytes, snapshot) => {
      postSnapshot('workspaceSaved', bytes, snapshot);
    },
    onSnapshotChanged: (snapshot) => {
      scheduleStatsReport(snapshot);
    },
    onConversionRequested: handleConversionRequested,
    onFailed: (error) => {
      vscode.postMessage({
        type: 'workspaceFailed',
        message: error instanceof Error ? error.message : String(error),
      });
    },
    // A preview link that isn't another Markdown doc inside this archive —
    // e.g. a relative link out to the surrounding workspace/repo. The
    // webview has no filesystem access, so resolving and acting on it
    // (open the file, reveal a folder) happens host-side; see 'openExternalLink'
    // in mdzEditorProvider.ts.
    onUnresolvedLinkClick: (href, snapshot) => {
      vscode.postMessage({ type: 'openExternalLink', href, currentPath: snapshot.currentPath });
    },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function postReadyUntilOpened(attempt = 0): void {
  vscode.postMessage({ type: 'ready' });

  window.setTimeout(() => {
    if (!hasOpenedWorkspace && attempt < 20) {
      postReadyUntilOpened(attempt + 1);
    }
  }, 250);
}
