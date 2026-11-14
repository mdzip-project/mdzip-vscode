import {
  MdzipDiffView,
  type MdzipDiffSideInput,
  type MdzipDiffViewOptions,
} from '@mdzip/editor/diff-view';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

interface DiffSideMessage {
  readonly label: string;
  readonly fileName: string;
  readonly bytesBase64?: string;
  readonly markdown?: string;
  readonly hasResources?: boolean;
  readonly editable?: boolean;
  readonly missingMessage?: string;
}

/** The working document changed outside the comparison (a text editor, undo, revert). */
interface UpdateMarkdownMessage {
  readonly type: 'updateMarkdown';
  readonly side: 'before' | 'after';
  readonly text: string;
}

interface ResourceMessage {
  readonly type: 'resource';
  readonly id: number;
  readonly bytesBase64?: string;
}

interface LoadDiffMessage {
  readonly type: 'loadDiff';
  readonly before: DiffSideMessage;
  readonly after: DiffSideMessage;
  readonly rendered?: boolean;
  /** A refresh: keep the current view mode. */
  readonly keepMode?: boolean;
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
let nextResourceId = 0;
const pendingResources = new Map<number, (bytes: Uint8Array | null) => void>();

window.addEventListener('message', async (event: MessageEvent<LoadDiffMessage | ResourceMessage | UpdateMarkdownMessage>) => {
  const message = event.data;
  if (message?.type === 'updateMarkdown') {
    // Typing not yet sent would be overwritten: the document's text wins.
    pendingEdits.delete(message.side);
    await diffView?.updateMarkdown(message.side, message.text);
    return;
  }
  if (message?.type === 'resource') {
    const resolve = pendingResources.get(message.id);
    pendingResources.delete(message.id);
    resolve?.(message.bytesBase64 ? base64ToBytes(message.bytesBase64) : null);
    return;
  }
  if (message?.type !== 'loadDiff') {
    return;
  }

  const generation = ++loadGeneration;
  loading?.removeAttribute('hidden');
  root.setAttribute('hidden', '');
  diffView?.destroy();
  const options: MdzipDiffViewOptions = {
    before: toDiffSide(message.before, 'before'),
    after: toDiffSide(message.after, 'after'),
    showUnchanged: true,
    // A plain .md comparison is one document: let the library hide the list.
    navigationVisible: isMarkdownComparison(message) ? undefined : true,
    // Keep the current choice across a refresh; otherwise what the extension asks for.
    rendered: (message.keepMode ? diffView?.isRendered : undefined) ?? message.rendered ?? false,
    colorScheme: vscodeColorScheme(),
    // Same toolbar size as the MDZip editor in VS Code.
    toolbarDensity: 'dense',
    onRenderedChanged(rendered) {
      vscode.postMessage({ type: 'renderedChanged', rendered });
    },
    toolbarActions: [{ id: 'refresh', label: 'Refresh comparison', icon: 'refresh', run: refreshComparison }],
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
  // The tab title names the mode.
  vscode.postMessage({ type: 'renderedState', rendered: diffView.isRendered });
  loading?.setAttribute('hidden', '');
  root.removeAttribute('hidden');
  resolveRefresh?.();
  resolveRefresh = null;
});

window.addEventListener('unload', () => {
  flushEdits();
  diffView?.destroy();
  diffView = null;
});

// Ctrl+S / Cmd+S: VS Code saves the document itself, but typing from the
// last moment may not have reached it yet, so send it and save once more.
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
    flushEdits();
    vscode.postMessage({ type: 'save' });
  }
});

vscode.postMessage({ type: 'ready' });

// Edits to an editable side go to the extension shortly after typing pauses.
const pendingEdits = new Map<'before' | 'after', string>();
let editTimer: ReturnType<typeof setTimeout> | undefined;

function queueEdit(side: 'before' | 'after', text: string): void {
  pendingEdits.set(side, text);
  if (editTimer) clearTimeout(editTimer);
  editTimer = setTimeout(flushEdits, 150);
}

function flushEdits(): void {
  if (editTimer) clearTimeout(editTimer);
  editTimer = undefined;
  for (const [side, text] of pendingEdits) {
    vscode.postMessage({ type: 'markdownEdited', side, text });
  }
  pendingEdits.clear();
}

function refreshComparison(): Promise<void> {
  flushEdits();
  return new Promise<void>((resolve) => {
    resolveRefresh = resolve;
    vscode.postMessage({ type: 'refresh' });
  });
}

function toDiffSide(side: DiffSideMessage, name: 'before' | 'after'): MdzipDiffSideInput {
  return {
    bytes: side.bytesBase64 ? base64ToBytes(side.bytesBase64) : undefined,
    markdown: side.markdown,
    readResource: side.hasResources ? (path) => requestResource(name, path) : undefined,
    editable: side.editable,
    onMarkdownChange: side.editable ? (text) => queueEdit(name, text) : undefined,
    label: side.label,
    fileName: side.fileName,
    missingMessage: side.missingMessage,
  };
}

function isMarkdownComparison(message: LoadDiffMessage): boolean {
  return [message.before, message.after].some((side) => side.markdown !== undefined)
    && [message.before, message.after].every((side) => side.markdown !== undefined || !side.bytesBase64);
}

/** Asks the extension for an image linked from a Markdown side. */
function requestResource(side: 'before' | 'after', path: string): Promise<Uint8Array | null> {
  const id = ++nextResourceId;
  return new Promise((resolve) => {
    pendingResources.set(id, resolve);
    vscode.postMessage({ type: 'readResource', id, side, path });
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
