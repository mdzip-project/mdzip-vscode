// Linked images for plain Markdown (.md) documents (mdzip-vscode#14): instead
// of converting to .mdz, the image is written beside the document (or into a
// subfolder) and referenced with a relative link. Pure and vscode-free — the
// webview asks, the extension host validates and writes (see
// `_handleMarkdownImageRequest` in mdzEditorProvider.ts).

export const DEFAULT_IMAGE_SUBFOLDER = 'images';
export const MAX_LINKED_IMAGE_BYTES = 25 * 1024 * 1024;
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

const IMAGE_FILE_PATTERN = new RegExp(`\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i');
const INVALID_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

export function isImageFileName(name: string): boolean {
  return IMAGE_FILE_PATTERN.test(name);
}

export function imageMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/** Returns an error message, or undefined when the subfolder name is usable. */
export function validateImageSubfolder(value: string): string | undefined {
  const name = value.trim();
  if (!name) {
    return 'Enter a subfolder name.';
  }
  if (name === '.' || name === '..' || /[<>:"/\\|?*\u0000-\u001f]/.test(name)) {
    return 'Enter a single valid subfolder name.';
  }
  return undefined;
}

/** Keeps only the base name and swaps characters files can't contain. */
export function sanitizeImageFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(INVALID_NAME_CHARS, '-').trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'image';
  }
  return cleaned;
}

/** `image.png` → `image-2.png`, `image-3.png`, … until `taken` says it's free. */
export async function uniqueImageFileName(
  fileName: string,
  taken: (candidate: string) => Promise<boolean>
): Promise<string> {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : '';
  let candidate = fileName;
  for (let suffix = 2; await taken(candidate); suffix += 1) {
    candidate = `${stem}-${suffix}${extension}`;
  }
  return candidate;
}

/**
 * Path of `imagePath` relative to `documentDir` (both POSIX-style URI paths),
 * or undefined when the image isn't inside that folder. The preview can only
 * show images inside the document's own folder tree, so `../` links are out.
 * Windows drive letters compare case-insensitively (`/f:/` vs `/F:/`).
 */
export function relativeImagePath(documentDir: string, imagePath: string): string | undefined {
  const dir = documentDir.replace(/\/+$/, '');
  const windowsDrive = /^\/[a-zA-Z]:/.test(dir);
  const norm = (value: string) => (windowsDrive ? value.toLowerCase() : value);
  if (!norm(imagePath).startsWith(norm(dir) + '/')) {
    return undefined;
  }
  const relative = imagePath.slice(dir.length + 1);
  return relative && !relative.split('/').includes('..') ? relative : undefined;
}

/** Alt text from a file name: `my-pic.png` → `my pic`. */
export function imageAltText(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
}

/** Percent-encodes each path segment so the link survives spaces and brackets. */
export function encodeImageSrc(relativePath: string): string {
  return relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    ))
    .join('/');
}

/** `![alt text](images/my%20pic.png)` — same shape Studio writes. */
export function markdownImageReference(fileName: string, relativePath: string): string {
  const alt = imageAltText(fileName).replace(/[[\]\\]/g, '\\$&');
  return `![${alt || 'image'}](${encodeImageSrc(relativePath)})`;
}

// --- Webview ⇄ host protocol -------------------------------------------------

export interface MarkdownImageRequest {
  requestId: number;
  /** `image-file`: the webview already has the bytes. `image-picker`: the host asks the user for a file. */
  kind: 'image-file' | 'image-picker';
  fileName?: string;
  base64Data?: string;
}

export type MarkdownImageResult =
  /** User chose to embed: the webview runs the editor's own convert-to-.mdz. */
  | { action: 'convert' }
  /** Nothing the host can do for linked images (e.g. an unsaved document): show the editor's built-in dialog. */
  | { action: 'builtin' }
  | { action: 'cancel' }
  /**
   * The image is chosen and its target decided, but a copy is not written until
   * the webview commits (see `MarkdownImageCommit`), so cancelling the insert
   * dialog leaves nothing behind. `src` is the encoded link target.
   */
  | { action: 'prepared'; relativePath: string; src: string; fileName: string; altText: string; dataUri: string }
  | { action: 'error'; message: string };

/** Validates the untrusted webview payload. */
export function parseMarkdownImageRequest(raw: unknown): MarkdownImageRequest | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const { requestId, kind, fileName, base64Data } = raw as Record<string, unknown>;
  if (typeof requestId !== 'number' || !Number.isFinite(requestId)) {
    return undefined;
  }
  if (kind === 'image-picker') {
    return { requestId, kind };
  }
  if (kind !== 'image-file' || typeof base64Data !== 'string' || !base64Data) {
    return undefined;
  }
  if (typeof fileName !== 'string' || fileName.length > 260) {
    return undefined;
  }
  // base64 is ~4/3 the byte size; reject before decoding anything large.
  if (base64Data.length > Math.ceil(MAX_LINKED_IMAGE_BYTES * 4 / 3) + 4) {
    return undefined;
  }
  return { requestId, kind, fileName, base64Data };
}

export interface MarkdownImageCommit {
  requestId: number;
  /** false = the user cancelled the insert dialog; drop the staged copy. */
  commit: boolean;
}

export function parseMarkdownImageCommit(raw: unknown): MarkdownImageCommit | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const { requestId, commit } = raw as Record<string, unknown>;
  if (typeof requestId !== 'number' || !Number.isFinite(requestId) || typeof commit !== 'boolean') {
    return undefined;
  }
  return { requestId, commit };
}
