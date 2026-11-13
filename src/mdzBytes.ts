import * as vscode from 'vscode';
import type { GitExtension } from './vendor/git';
import { isZipBytes, parseGitUriQuery, readGitBlob } from './gitBlob';

/** The git executable VS Code's Git extension uses, or plain `git`. */
export function gitExecutablePath(): string {
  try {
    const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (gitExt?.isActive) return gitExt.exports.getAPI(1).git.path || 'git';
  } catch {
    // Fall back to git on PATH.
  }
  return 'git';
}

/**
 * Reads a file to open as an archive. A git: URI (the committed or staged side
 * of a Source Control diff) comes through `git show --textconv`, so in a
 * repository set up for `mdz textconv` it returns text, or fails if the
 * textconv command can't run. Then the raw blob is read instead; see gitBlob.ts.
 */
export async function readArchiveBytes(uri: vscode.Uri): Promise<Uint8Array> {
  if (uri.scheme !== 'git' || uri.path.toLowerCase().endsWith('.md')) {
    return vscode.workspace.fs.readFile(uri);
  }
  let bytes: Uint8Array | undefined;
  let readError: unknown;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
    if (isZipBytes(bytes)) return bytes;
  } catch (error) {
    readError = error;
  }
  const query = parseGitUriQuery(uri.query);
  if (query) {
    try {
      const raw = await readGitBlob(gitExecutablePath(), query.ref, query.path);
      if (isZipBytes(raw)) return new Uint8Array(raw);
    } catch {
      // Keep what the Git extension returned, or its error.
    }
  }
  if (bytes) return bytes;
  throw readError;
}
