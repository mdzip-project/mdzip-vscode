import {
  MdzipWorkspaceView,
  type MdzipSourceFormat,
  type MdzipWorkspaceLayout,
  type MdzipWorkspaceSnapshot,
} from '@mdzip/editor';

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

const vscode = acquireVsCodeApi();
const root = document.getElementById('mdzip-editor-root');

if (!root) {
  throw new Error('MDZip editor root was not found.');
}
const rootElement = root;

document.documentElement.style.height = '100%';
document.body.style.height = '100%';
document.body.style.margin = '0';
rootElement.style.height = '100%';

let currentLayout: MdzipWorkspaceLayout = 'preview';
let currentSourceFormat: MdzipSourceFormat = 'mdz';
let editor = createEditor(currentLayout, currentSourceFormat);
let hasOpenedWorkspace = false;

window.addEventListener('message', (event: MessageEvent<OpenWorkspaceMessage>) => {
  const message = event.data;
  if (message?.type !== 'openWorkspace') {
    return;
  }

  hasOpenedWorkspace = true;
  const layout = message.layout ?? 'preview';
  if (layout !== currentLayout || message.sourceFormat !== currentSourceFormat) {
    editor.destroy();
    rootElement.replaceChildren();
    currentLayout = layout;
    currentSourceFormat = message.sourceFormat;
    editor = createEditor(currentLayout, currentSourceFormat);
  }

  void editor.open(base64ToBytes(message.bytesBase64), {
    sourceFormat: message.sourceFormat,
    fileName: message.fileName,
  });
});

postReadyUntilOpened();

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
    dirty: snapshot.dirty,
  });
}

function createEditor(
  initialLayout: MdzipWorkspaceLayout,
  sourceFormat: MdzipSourceFormat
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
    onChanged: (bytes, snapshot) => {
      postSnapshot('workspaceChanged', bytes, snapshot);
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
