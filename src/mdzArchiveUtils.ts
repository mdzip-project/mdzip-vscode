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

export interface NewArchiveAsset {
  archivePath: string;
  fileBytes: Uint8Array;
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
 * Add or replace a binary file in an existing .mdz archive and return bytes.
 */
export async function updateBinaryInArchive(
  existingBytes: Uint8Array,
  archivePath: string,
  fileBytes: Uint8Array
): Promise<Uint8Array> {
  const result = await MdzArchiveCore.addFile(existingBytes, archivePath, fileBytes);
  const blob = result.blob;
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Read raw file bytes from an archive by archive-relative path.
 */
export async function readBinaryFileFromArchive(
  existingBytes: Uint8Array,
  archivePath: string
): Promise<Uint8Array> {
  const normalizedPath = MdzArchiveCore.normalizePath(archivePath);
  const zip = await JSZip.loadAsync(existingBytes);
  const entry = zip.files[normalizedPath] ?? Object.values(zip.files).find(
    (candidate) => MdzArchiveCore.normalizePath(candidate.name).toLowerCase() === normalizedPath.toLowerCase()
  );

  if (!entry || entry.dir) {
    throw new Error(`Archive file "${archivePath}" not found.`);
  }

  return entry.async('uint8array');
}

/**
 * Read a UTF-8 text file from an archive by archive-relative path.
 */
export async function readTextFileFromArchive(
  existingBytes: Uint8Array,
  archivePath: string
): Promise<string> {
  const bytes = await readBinaryFileFromArchive(existingBytes, archivePath);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Build a brand-new .mdz archive containing a single `index.md` file with
 * the given markdown content and a manifest set to document mode.
 */
export async function buildNewArchive(markdownContent: string): Promise<Blob> {
  return buildNewArchiveWithTitle(markdownContent, 'document');
}

/**
 * Build a brand-new .mdz archive with an explicit manifest title.
 */
export async function buildNewArchiveWithTitle(
  markdownContent: string,
  title: string
): Promise<Blob> {
  const result = await MdzPackagerCore.buildArchive(
    [{ path: 'index.md', text: markdownContent }],
    'document',
    {
      createIndex: false,
      mapFiles: false,
      filters: MdzPackagerCore.DEFAULT_FILTERS,
      mode: 'document',
      entryPoint: 'index.md',
      title,
    }
  );
  return result.blob;
}

/**
 * Build a brand-new .mdz archive and optionally seed it with embedded assets.
 */
export async function buildNewArchiveBytesWithTitle(
  markdownContent: string,
  title: string,
  assets: readonly NewArchiveAsset[] = []
): Promise<Uint8Array> {
  const blob = await buildNewArchiveWithTitle(markdownContent, title);
  let bytes = new Uint8Array(await blob.arrayBuffer());

  for (const asset of assets) {
    bytes = Uint8Array.from(await updateBinaryInArchive(bytes, asset.archivePath, asset.fileBytes));
  }

  return bytes;
}

/**
 * Update only the manifest title inside an existing .mdz archive.
 */
export async function updateManifestTitleInArchive(
  existingBytes: Uint8Array,
  newTitle: string
): Promise<Uint8Array> {
  const archive = await MdzArchiveCore.open(existingBytes);
  const manifest = await archive.readManifest();
  if (!manifest) {
    throw new Error('Cannot set title: manifest.json is missing.');
  }

  const nextManifest = {
    ...manifest,
    title: newTitle,
  };

  const result = await MdzArchiveCore.addFile(
    existingBytes,
    'manifest.json',
    JSON.stringify(nextManifest, null, 2)
  );
  return new Uint8Array(await result.blob.arrayBuffer());
}

/** Return true when the path has a recognised image extension. */
export function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ext in MDZ_IMAGE_MIME_TYPES;
}
