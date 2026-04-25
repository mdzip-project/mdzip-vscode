/**
 * Thin wrappers around mdzip-core-js and jszip for use in the VS Code extension.
 *
 * All archive I/O goes through these helpers so the rest of the extension
 * does not need to import jszip or mdzip-core-js directly.
 */

import JSZip from 'jszip';
import { MdzArchiveCore, MdzPackagerCore, MdzManifest, MDZ_IMAGE_MIME_TYPES } from 'mdzip-core-js';

export interface ArchiveEntry {
  path: string;
  isMarkdown: boolean;
  isImage: boolean;
}

export interface OpenedArchive {
  /** All non-directory entry paths */
  paths: ArchiveEntry[];
  /** Resolved primary markdown entry-point path */
  entryPoint: string;
  /** Parsed manifest, or null */
  manifest: MdzManifest | null;
  /** Raw markdown text of the entry-point file */
  markdownText: string;
  /** Embedded image map: archive-relative path → data URI */
  images: Map<string, string>;
}

/** Open a .mdz archive binary and extract content needed by the editor. */
export async function openMdzArchive(bytes: Uint8Array): Promise<OpenedArchive> {
  const archive = await MdzArchiveCore.open(bytes);
  const entryPoint = await archive.resolveEntryPoint();
  const manifest = await archive.readManifest();

  const zip = await JSZip.loadAsync(bytes);
  const paths: ArchiveEntry[] = [];

  for (const [rawPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const path = MdzArchiveCore.normalizePath(rawPath);
    paths.push({
      path,
      isMarkdown: MdzArchiveCore.isMarkdownFile(path),
      isImage: isImagePath(path),
    });
  }

  // Read markdown text
  const mdEntry = zip.files[entryPoint] ?? Object.values(zip.files).find(
    (e) => MdzArchiveCore.normalizePath(e.name).toLowerCase() === entryPoint.toLowerCase()
  );
  if (!mdEntry) {
    throw new Error(`Entry point "${entryPoint}" not found in archive.`);
  }
  const markdownText = await mdEntry.async('text');

  // Read all images as base64 data URIs
  const images = new Map<string, string>();
  for (const entry of paths) {
    if (!entry.isImage) continue;
    const zipEntry = zip.files[entry.path] ?? Object.values(zip.files).find(
      (e) => MdzArchiveCore.normalizePath(e.name).toLowerCase() === entry.path.toLowerCase()
    );
    if (!zipEntry) continue;
    const base64 = await zipEntry.async('base64');
    const ext = entry.path.split('.').pop()?.toLowerCase() ?? '';
    const mime = MDZ_IMAGE_MIME_TYPES[ext] ?? 'image/png';
    images.set(entry.path, `data:${mime};base64,${base64}`);
  }

  return { paths, entryPoint, manifest, markdownText, images };
}

/**
 * Update the entry-point markdown file inside an existing .mdz archive and
 * return the new archive bytes.
 */
export async function updateMarkdownInArchive(
  existingBytes: Uint8Array,
  entryPointPath: string,
  newMarkdown: string
): Promise<Uint8Array> {
  const result = await MdzArchiveCore.addFile(existingBytes, entryPointPath, newMarkdown);
  const blob = result.blob;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Build a brand-new .mdz archive containing a single `index.md` file with
 * the given markdown content and a manifest set to document mode.
 */
export async function buildNewArchive(markdownContent: string): Promise<Blob> {
  const result = await MdzPackagerCore.buildArchive(
    [{ path: 'index.md', text: markdownContent }],
    'document',
    {
      createIndex: false,
      mapFiles: false,
      filters: MdzPackagerCore.DEFAULT_FILTERS,
      mode: 'document',
      entryPoint: 'index.md',
    }
  );
  return result.blob;
}

/** Return true when the path has a recognised image extension. */
export function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ext in MDZ_IMAGE_MIME_TYPES;
}
