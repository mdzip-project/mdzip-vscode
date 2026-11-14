// Reads the versions of a plain .md file that a comparison shows: a git
// version (HEAD, the index or any commit) or the working tree, plus the images
// each version links to, read from the same place as its text.
import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import type { GitExtension } from './vendor/git';
import { readGitBlob } from './gitBlob';

export interface GitRepoInfo {
  readonly gitPath: string;
  readonly root: string;
}

/**
 * The git executable and repository root for a file, for raw blob reads.
 * Asks git itself (`rev-parse --show-toplevel`) rather than VS Code's Git
 * extension: while VS Code starts up, restoring editors, that extension may
 * not have found the repository yet and would report "not in a repository".
 */
export async function getGitRepoInfo(fileUri: vscode.Uri): Promise<GitRepoInfo> {
  const gitPath = await gitExecutable();
  const root = await gitTopLevel(gitPath, path.dirname(fileUri.fsPath));
  if (!root) throw new Error('File is not inside a git repository');
  return { gitPath, root };
}

/** The git that VS Code's Git extension uses (its `git.path` setting), or `git` on the PATH. */
async function gitExecutable(): Promise<string> {
  const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git');
  try {
    if (gitExt) {
      if (!gitExt.isActive) await gitExt.activate();
      const gitPath = gitExt.exports.getAPI(1).git.path;
      if (gitPath) return gitPath;
    }
  } catch {
    // The Git extension is disabled or failed: use git from the PATH.
  }
  return 'git';
}

function gitTopLevel(gitPath: string, cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(gitPath, ['rev-parse', '--show-toplevel'], { cwd, windowsHide: true }, (error, stdout) => {
      const root = String(stdout ?? '').trim();
      resolve(error || !root ? undefined : path.normalize(root));
    });
  });
}

export function isMarkdownUri(uri: vscode.Uri): boolean {
  return /\.(md|markdown)$/i.test(uri.path);
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Decodes Markdown text with LF line endings, so a CRLF checkout doesn't differ on every line. */
export function decodeMarkdownText(bytes: Uint8Array): string {
  return normalizeLineEndings(new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, ''));
}

export function samePath(a: string, b: string): boolean {
  const left = path.normalize(a);
  const right = path.normalize(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/**
 * How a git ref is labelled on its side of a comparison: the index is "Staged",
 * as in VS Code's Source Control view, and a full commit hash is shortened.
 */
export function refLabel(ref: string): string {
  if (ref === '' || ref === '~') return 'Staged';
  return /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref;
}

/**
 * Of two commits, the newer: the descendant when one contains the other,
 * otherwise the one committed later. Ties and errors give `b`.
 */
export async function newerRef(fileUri: vscode.Uri, a: string, b: string): Promise<string> {
  const git = await getGitRepoInfo(fileUri);
  const run = (args: string[]) => new Promise<{ ok: boolean; out: string }>((resolve) => {
    execFile(git.gitPath, args, { cwd: git.root, windowsHide: true }, (error, stdout) => {
      resolve({ ok: !error, out: String(stdout ?? '').trim() });
    });
  });
  if ((await run(['merge-base', '--is-ancestor', b, a])).ok) return a;
  if ((await run(['merge-base', '--is-ancestor', a, b])).ok) return b;
  const [timeA, timeB] = await Promise.all([
    run(['log', '-1', '--format=%ct', a, '--']),
    run(['log', '-1', '--format=%ct', b, '--']),
  ]);
  return Number(timeA.out) > Number(timeB.out) ? a : b;
}

/** A file's text as saved on disk (not an open document's unsaved edits), or undefined if unreadable. */
export async function readSavedText(fsPath: string): Promise<string | undefined> {
  try {
    return decodeMarkdownText(await vscode.workspace.fs.readFile(vscode.Uri.file(fsPath)));
  } catch {
    return undefined;
  }
}

export interface MarkdownVersionSource {
  /** The repository, or undefined when the file isn't in one (there's no git version then). */
  readonly git: GitRepoInfo | undefined;
  /** A version's text: a git ref, or undefined for the working tree (an open document's unsaved text included). */
  loadText(ref: string | undefined, fsPath: string): Promise<string | undefined>;
  /** Reads the images a version links to, from the same version. */
  imageReader(ref: string | undefined, documentPath: string): (linked: string) => Promise<Uint8Array | undefined>;
}

export async function markdownVersionSource(fileUri: vscode.Uri): Promise<MarkdownVersionSource> {
  let git: GitRepoInfo | undefined;
  try {
    git = await getGitRepoInfo(fileUri);
  } catch {
    git = undefined;
  }

  // A root-relative image source resolves against the repository root.
  const linkedPath = (documentPath: string, linked: string): string =>
    linked.startsWith('/')
      ? path.join(git?.root ?? path.dirname(documentPath), linked)
      : path.resolve(path.dirname(documentPath), linked);
  const readBlob = async (ref: string, fsPath: string): Promise<Uint8Array | undefined> => {
    if (!git) return undefined;
    try {
      return new Uint8Array(await readGitBlob(git.gitPath, ref, fsPath));
    } catch {
      return undefined;
    }
  };
  const readDisk = async (fsPath: string): Promise<Uint8Array | undefined> => {
    try {
      return await vscode.workspace.fs.readFile(vscode.Uri.file(fsPath));
    } catch {
      return undefined;
    }
  };

  return {
    git,
    async loadText(ref, fsPath) {
      if (ref === undefined) {
        const open = vscode.workspace.textDocuments.find(
          d => d.uri.scheme === 'file' && samePath(d.uri.fsPath, fsPath)
        );
        if (open) return normalizeLineEndings(open.getText());
      }
      const bytes = ref === undefined ? await readDisk(fsPath) : await readBlob(ref, fsPath);
      return bytes ? decodeMarkdownText(bytes) : undefined;
    },
    imageReader(ref, documentPath) {
      return (linked) => {
        const target = linkedPath(documentPath, linked);
        return ref === undefined ? readDisk(target) : readBlob(ref, target);
      };
    },
  };
}
