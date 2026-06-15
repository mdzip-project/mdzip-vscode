import {
  MdzipDiffView,
  type MdzipDiffViewOptions,
} from '@mdzip/editor/diff-view';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

interface DiffSideMessage {
  readonly label: string;
  readonly fileName: string;
  readonly bytesBase64?: string;
  readonly missingMessage?: string;
}

interface LoadDiffMessage {
  readonly type: 'loadDiff';
  readonly before: DiffSideMessage;
  readonly after: DiffSideMessage;
}

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById('mdzip-diff-root');
const loading = document.getElementById('mdzip-diff-loading');

if (!root) {
  throw new Error('MDZip diff root was not found.');
}

let diffView: MdzipDiffView | null = null;
let loadGeneration = 0;
let resolveRefresh: (() => void) | null = null;

window.addEventListener('message', async (event: MessageEvent<LoadDiffMessage>) => {
  const message = event.data;
  if (message?.type !== 'loadDiff') {
    return;
  }

  const generation = ++loadGeneration;
  loading?.removeAttribute('hidden');
  root.setAttribute('hidden', '');
  diffView?.destroy();
  const options: MdzipDiffViewOptions = {
    before: toDiffSide(message.before),
    after: toDiffSide(message.after),
    showUnchanged: true,
    navigationVisible: true,
    toolbarActions: [{
      id: 'refresh',
      label: 'Refresh comparison',
      icon: 'refresh',
      run: refreshComparison,
    }],
    onFailed(error) {
      vscode.postMessage({
        type: 'failed',
        message: error instanceof Error ? error.message : String(error),
      });
    },
  };
  diffView = new MdzipDiffView(root, options);
  await diffView.open(options);
  if (generation !== loadGeneration) {
    return;
  }
  loading?.setAttribute('hidden', '');
  root.removeAttribute('hidden');
  resolveRefresh?.();
  resolveRefresh = null;
});

window.addEventListener('unload', () => {
  diffView?.destroy();
  diffView = null;
});

vscode.postMessage({ type: 'ready' });

function refreshComparison(): Promise<void> {
  return new Promise<void>((resolve) => {
    resolveRefresh = resolve;
    vscode.postMessage({ type: 'refresh' });
  });
}

function toDiffSide(side: DiffSideMessage): {
  bytes?: Uint8Array;
  label: string;
  fileName: string;
  missingMessage?: string;
} {
  return {
    bytes: side.bytesBase64 ? base64ToBytes(side.bytesBase64) : undefined,
    label: side.label,
    fileName: side.fileName,
    missingMessage: side.missingMessage,
  };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
