import { MdzipWorkspaceView, type MdzipSourceFormat, type MdzipWorkspaceSnapshot } from '@mdzip/editor';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

interface OpenWorkspaceMessage {
  type: 'openWorkspace';
  bytesBase64: string;
  sourceFormat: MdzipSourceFormat;
  fileName: string;
}

const vscode = acquireVsCodeApi();
const root = document.getElementById('mdzip-editor-root');

if (!root) {
  throw new Error('MDZip editor root was not found.');
}

document.documentElement.style.height = '100%';
document.body.style.height = '100%';
document.body.style.margin = '0';
root.style.height = '100%';

const editor = new MdzipWorkspaceView(root, {
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

window.addEventListener('message', (event: MessageEvent<OpenWorkspaceMessage>) => {
  const message = event.data;
  if (message?.type !== 'openWorkspace') {
    return;
  }

  void editor.open(base64ToBytes(message.bytesBase64), {
    sourceFormat: message.sourceFormat,
    fileName: message.fileName,
  });
});

vscode.postMessage({ type: 'ready' });

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
