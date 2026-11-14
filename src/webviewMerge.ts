// Webview script of the merge-conflict panel (mdzMergePanel.ts): shows the
// conflicts in an .mdz or .md with @mdzip/editor's MdzipMergeView and sends
// each resolution back to the extension, which writes the file.
import { MdzipMergeView, type MdzipMergeViewOptions } from '@mdzip/editor/merge-view';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

interface LoadMergeMessage {
  readonly type: 'loadMerge';
  readonly fileName: string;
  readonly bytesBase64?: string;
  readonly markdown?: string;
  readonly hasResources?: boolean;
  /** A reload after the file changed elsewhere: keep the view mode. */
  readonly keepMode?: boolean;
  /** Git's three versions during a merge (null: that side has no such file). */
  readonly versions?: Record<'base' | 'ours' | 'theirs', VersionMessage | null>;
  readonly oursLabel?: string;
  readonly theirsLabel?: string;
}

interface VersionMessage {
  readonly bytesBase64?: string;
  readonly markdown?: string;
}

interface ResourceMessage {
  readonly type: 'resource';
  readonly id: number;
  readonly bytesBase64?: string;
}

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById('mdzip-diff-root');
const loading = document.getElementById('mdzip-diff-loading');

if (!root) {
  throw new Error('MDZip merge root was not found.');
}

let mergeView: MdzipMergeView | null = null;
let loadGeneration = 0;
let nextResourceId = 0;
const pendingResources = new Map<number, (bytes: Uint8Array | null) => void>();

window.addEventListener('message', async (event: MessageEvent<LoadMergeMessage | ResourceMessage>) => {
  const message = event.data;
  if (message?.type === 'resource') {
    const resolve = pendingResources.get(message.id);
    pendingResources.delete(message.id);
    resolve?.(message.bytesBase64 ? base64ToBytes(message.bytesBase64) : null);
    return;
  }
  if (message?.type !== 'loadMerge') {
    return;
  }

  const generation = ++loadGeneration;
  // Source by default: the result can be edited there.
  const rendered = message.keepMode ? mergeView?.isRendered ?? false : false;
  const version = (side: VersionMessage | null | undefined) => (side
    ? { bytes: side.bytesBase64 !== undefined ? base64ToBytes(side.bytesBase64) : undefined, markdown: side.markdown }
    : null);
  mergeView?.destroy();
  root.replaceChildren();
  const options: MdzipMergeViewOptions = {
    bytes: message.bytesBase64 !== undefined ? base64ToBytes(message.bytesBase64) : undefined,
    markdown: message.markdown,
    fileName: message.fileName,
    versions: message.versions
      ? { base: version(message.versions.base), ours: version(message.versions.ours), theirs: version(message.versions.theirs) }
      : undefined,
    oursLabel: message.oursLabel,
    theirsLabel: message.theirsLabel,
    readResource: message.hasResources ? requestResource : undefined,
    rendered,
    colorScheme: vscodeColorScheme(),
    // Same toolbar size as the MDZip editor in VS Code.
    toolbarDensity: 'dense',
    onChange(change) {
      vscode.postMessage({
        type: 'changed',
        path: change.path,
        text: change.bytes ? undefined : change.text,
        bytesBase64: change.bytes ? bytesToBase64(change.bytes) : undefined,
        remaining: change.remaining,
      });
    },
    onResolved() {
      vscode.postMessage({ type: 'resolved' });
    },
    onComplete(event) {
      vscode.postMessage({ type: 'complete', remaining: event.remaining });
    },
    onFailed(error) {
      vscode.postMessage({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
    },
  };
  mergeView = new MdzipMergeView(root, options);
  await mergeView.open(options);
  if (generation !== loadGeneration) {
    return;
  }
  loading?.setAttribute('hidden', '');
  root.removeAttribute('hidden');
  vscode.postMessage({ type: 'loaded', conflictCount: mergeView.conflictCount });
});

window.addEventListener('unload', () => {
  mergeView?.destroy();
  mergeView = null;
});

vscode.postMessage({ type: 'ready' });

/** Asks the extension for an image linked from a plain Markdown document. */
function requestResource(path: string): Promise<Uint8Array | null> {
  const id = ++nextResourceId;
  return new Promise((resolve) => {
    pendingResources.set(id, resolve);
    vscode.postMessage({ type: 'readResource', id, path });
  });
}

// VS Code marks the webview body with the theme kind.
function vscodeColorScheme(): 'light' | 'dark' {
  const classes = document.body.classList;
  return classes.contains('vscode-dark') || classes.contains('vscode-high-contrast') && !classes.contains('vscode-high-contrast-light')
    ? 'dark'
    : 'light';
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}
