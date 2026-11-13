// Raw reads of committed or staged .mdz files.
//
// VS Code's Git extension reads every file with `git show --textconv`, both
// for git: URIs (the left side of a Source Control diff) and for the API's
// Repository.buffer(). In a repository that sets up `mdz textconv`
// (`*.mdz diff=mdz` plus `git config diff.mdz.textconv ...`), that returns the
// archive printed as text, not the ZIP, and opening it fails with
// ERR_ZIP_INVALID. `git cat-file blob` never runs textconv, so it's used here
// to get the real bytes. No vscode import, so it can be unit-tested.
import { execFile } from 'child_process';
import * as path from 'path';

/** True when the bytes start with a ZIP local file header or an empty archive's end record. */
export function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06));
}

export interface GitUriQuery {
  /** Absolute file system path of the file in the working tree. */
  path: string;
  /** Git ref: a commit-ish such as HEAD, or '' / '~' for the index. */
  ref: string;
}

/** Parses the JSON query of a VS Code git: URI. Returns undefined when it isn't one. */
export function parseGitUriQuery(query: string): GitUriQuery | undefined {
  try {
    const parsed = JSON.parse(query) as { path?: unknown; ref?: unknown };
    if (typeof parsed.path !== 'string' || !parsed.path) return undefined;
    return { path: parsed.path, ref: typeof parsed.ref === 'string' ? parsed.ref : 'HEAD' };
  } catch {
    return undefined;
  }
}

/**
 * The `cat-file` object name for a file, relative to the file's own folder
 * (git resolves `./name` against the working directory), so the repository
 * root isn't needed. '' and '~' name the index, as in VS Code's git: URIs.
 */
export function blobObjectName(ref: string, fsPath: string): string {
  const name = `./${path.basename(fsPath)}`;
  return ref === '' || ref === '~' ? `:${name}` : `${ref}:${name}`;
}

/** Reads a file's bytes from git, without textconv or other filters. */
export function readGitBlob(gitPath: string, ref: string, fsPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      gitPath,
      ['cat-file', 'blob', blobObjectName(ref, fsPath)],
      { cwd: path.dirname(fsPath), encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout as Buffer)),
    );
  });
}
