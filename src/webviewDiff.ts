import {
  MdzipDiffView,
  navigationToggleIconHtml,
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
const refreshButton = document.getElementById('mdzip-diff-refresh');
const navigationButton = document.getElementById('mdzip-diff-toggle-navigation');
const loading = document.getElementById('mdzip-diff-loading');

if (!root) {
  throw new Error('MDZip diff root was not found.');
}

if (navigationButton) {
  navigationButton.innerHTML = navigationToggleIconHtml('mdzip-diff-navigation-icon');
}

refreshButton?.addEventListener('click', () => {
  vscode.postMessage({ type: 'refresh' });
});

let diffView: MdzipDiffView | null = null;
let navigationVisible = true;
let loadGeneration = 0;

navigationButton?.addEventListener('click', () => {
  navigationVisible = !navigationVisible;
  diffView?.setNavigationVisible(navigationVisible);
  updateNavigationButton();
});

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
    navigationVisible,
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
});

window.addEventListener('unload', () => {
  diffView?.destroy();
  diffView = null;
});

vscode.postMessage({ type: 'ready' });

function updateNavigationButton(): void {
  if (!navigationButton) {
    return;
  }
  const label = navigationVisible
    ? 'Hide archive navigation'
    : 'Show archive navigation';
  navigationButton.title = label;
  navigationButton.setAttribute('aria-label', label);
  navigationButton.setAttribute('aria-pressed', String(navigationVisible));
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
