import {
  MdzipWorkspaceView,
  type MdzipColorScheme,
  type MdzipSourceFormat,
  type MdzipWorkspaceLayout,
  type MdzipWorkspaceSnapshot,
} from '@mdzip/editor';
import { mdzipMermaidExtension } from '@mdzip/editor/mermaid';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

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
  bytesBase64?: string; // raw archive bytes for incremental patching (small archives only)
  sourceFormat: MdzipSourceFormat;
  fileName: string;
  layout?: MdzipWorkspaceLayout;
}

interface DocumentTextMessage {
  type: 'documentText';
  requestId: number;
  text: string;
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

const loadingEl = document.getElementById('mdzip-loading');

// Lazy document text: documents tagged lazyText by the host get a readText()
// that round-trips through the extension host instead of carrying the full
// text in the openWorkspaceDirect payload (which can be hundreds of MB).
const pendingTextRequests = new Map<number, (text: string) => void>();
let nextTextRequestId = 1;

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

window.addEventListener('message', (event: MessageEvent<OpenWorkspaceMessage | OpenWorkspaceDirectMessage | DocumentTextMessage>) => {
  const message = event.data;
  if (message?.type === 'documentText') {
    const resolve = pendingTextRequests.get(message.requestId);
    if (resolve) {
      pendingTextRequests.delete(message.requestId);
      resolve(message.text);
    }
    return;
  }
  if (message?.type !== 'openWorkspace' && message?.type !== 'openWorkspaceDirect') {
    return;
  }

  hasOpenedWorkspace = true;
  const layout = message.layout ?? 'preview';
  const isFirst = !editor;

  if (!editor) {
    currentLayout = layout;
    currentSourceFormat = message.sourceFormat;
    editor = createEditor(currentLayout, currentSourceFormat, detectColorScheme());
  } else if (layout !== currentLayout || message.sourceFormat !== currentSourceFormat) {
    editor.destroy();
    rootElement.replaceChildren();
    currentLayout = layout;
    currentSourceFormat = message.sourceFormat;
    editor = createEditor(currentLayout, currentSourceFormat, detectColorScheme());
  }

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
      archiveBytes: message.bytesBase64 ? base64ToBytes(message.bytesBase64) : undefined,
    });
    if (isFirst) {
      void openPromise.finally(() => { loadingEl?.remove(); });
    }
    return;
  }

  const openPromise = editor.open(base64ToBytes(message.bytesBase64), {
    sourceFormat: message.sourceFormat,
    fileName: message.fileName,
  });
  if (isFirst) {
    void openPromise.finally(() => { loadingEl?.remove(); });
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
// color theme. setColorScheme re-renders in place — no editor recreation, so
// CodeMirror state and unsaved edits survive.
new MutationObserver(() => {
  editor?.setColorScheme(detectColorScheme());
}).observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind', 'class'] });


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
  initialColorScheme: MdzipColorScheme
): MdzipWorkspaceView {
  const isMdz = sourceFormat === 'mdz';
  return new MdzipWorkspaceView(rootElement, {
    controls: {
      preset: 'hosted-editor',
      navigation: isMdz,
      title: isMdz,
      orphanActions: isMdz,
    },
    navigationButtonActive: false,
    initialLayout,
    initialColorScheme,
    // Pasting/dropping an image opens the built-in dialog for Markdown vs HTML,
    // alt text, sizing, and alignment instead of inserting a bare
    // ![alt](path). The HTML path uses portable `align` attributes, which
    // survive the preview sanitizer (it strips inline `style`).
    imageInsertMode: 'ask',
    // This is a live-editing host: the preview re-renders on every keystroke.
    // 'initial' keeps the first-load reveal animation but snaps packaged images
    // open on same-document edits, avoiding a loading pulse on each re-render.
    imageHydrationAnimation: 'initial',
    // Renders fenced ```mermaid blocks to inline SVG in the preview. The mermaid
    // library is bundled into editor.bundle.js and loaded only when a document
    // actually contains a mermaid block. Theme follows the editor color scheme.
    markdownExtensions: [mdzipMermaidExtension()],
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
    onFailed: (error) => {
      vscode.postMessage({
        type: 'workspaceFailed',
        message: error instanceof Error ? error.message : String(error),
      });
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
