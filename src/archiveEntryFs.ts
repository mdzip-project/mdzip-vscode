import * as crypto from 'crypto';
import { promises as fsPromises } from 'fs';
import * as vscode from 'vscode';
import { MdzArchiveCore } from '@mdzip/core-js';
import { MdzEditorProvider } from './mdzEditorProvider';

// A file system for the files inside an .mdz, so any VS Code editor can open
// one: draw.io for a .drawio.svg, the PDF viewer for a .pdf, the text editor
// for a .json, and so on. Reads come from the archive; a save writes that one
// entry back with @mdzip/core-js, which keeps every other entry and manifest
// field as it was. An MDZip editor open on the same archive reloads through
// its own file watcher.
//
// URI: mdzip-entry://<id>/<archive name>/<entry path>. The path is what
// people see (tab title: the entry's name; breadcrumb: spike.mdz > files >
// sample.pdf), and editors chosen by file pattern (*.drawio.svg) match as they
// would on disk. <id> is a short hash of the archive's URI, kept in the
// authority because webviews (the PDF viewer, for one) drop a URI's query when
// they load a resource. The id → archive map is stored in the extension's
// global state, so links still work after a window reload.

export const ARCHIVE_ENTRY_SCHEME = 'mdzip-entry';
const ARCHIVE_IDS_KEY = 'mdzip.archiveEntryIds';
const MAX_ARCHIVE_IDS = 200;
let archiveIds: vscode.Memento | undefined;
const knownArchives = new Map<string, string>();

function archiveId(archiveUri: vscode.Uri): string {
  return crypto.createHash('sha256').update(archiveUri.toString()).digest('hex').slice(0, 16);
}

function rememberArchive(id: string, archiveUri: vscode.Uri): void {
  if (knownArchives.get(id) === archiveUri.toString()) return;
  knownArchives.set(id, archiveUri.toString());
  if (!archiveIds) return;
  const stored = { ...(archiveIds.get<Record<string, string>>(ARCHIVE_IDS_KEY) ?? {}), [id]: archiveUri.toString() };
  const ids = Object.keys(stored);
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_ARCHIVE_IDS))) delete stored[old];
  void archiveIds.update(ARCHIVE_IDS_KEY, stored);
}

export function archiveEntryUri(archiveUri: vscode.Uri, entryPath: string): vscode.Uri {
  const id = archiveId(archiveUri);
  rememberArchive(id, archiveUri);
  const name = archiveUri.path.split('/').pop() || 'archive.mdz';
  return vscode.Uri.from({ scheme: ARCHIVE_ENTRY_SCHEME, authority: id, path: `/${name}${entryPath ? `/${entryPath}` : ''}` });
}

export function parseArchiveEntryUri(uri: vscode.Uri): { archiveUri: vscode.Uri; entryPath: string } {
  const match = /^\/[^/]+(?:\/(.*))?$/.exec(uri.path);
  const id = uri.authority.toLowerCase();
  const archive = knownArchives.get(id) ?? archiveIds?.get<Record<string, string>>(ARCHIVE_IDS_KEY)?.[id];
  if (!match || !archive) throw vscode.FileSystemError.FileNotFound(uri);
  knownArchives.set(id, archive);
  return { archiveUri: vscode.Uri.parse(archive, true), entryPath: (match[1] ?? '').replace(/\/+$/, '') };
}

/**
 * Read-only when the archive file is, or when its file system can't be
 * written (a git version, for example): its entries then open read-only.
 * VS Code doesn't report a read-only file's permissions on Windows, so a file
 * on disk is checked directly, as the MDZip editor does (mdzDocument.ts).
 */
async function isReadonlyArchive(archiveUri: vscode.Uri, stat: vscode.FileStat): Promise<boolean> {
  if (stat.permissions === vscode.FilePermission.Readonly) return true;
  if (vscode.workspace.fs.isWritableFileSystem(archiveUri.scheme) === false) return true;
  if (archiveUri.scheme !== 'file') return false;
  try {
    return ((await fsPromises.stat(archiveUri.fsPath)).mode & 0o200) === 0;
  } catch {
    return false;
  }
}

interface CachedArchive {
  mtime: number;
  size: number;
  archive: MdzArchiveCore;
  bytes: Uint8Array;
}

export class ArchiveEntryFileSystem implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  public readonly onDidChangeFile = this.emitter.event;
  private readonly cache = new Map<string, CachedArchive>();

  private async open(archiveUri: vscode.Uri): Promise<CachedArchive & { stat: vscode.FileStat }> {
    const stat = await vscode.workspace.fs.stat(archiveUri);
    const key = archiveUri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.mtime === stat.mtime && cached.size === stat.size) return { ...cached, stat };
    const bytes = new Uint8Array(await vscode.workspace.fs.readFile(archiveUri));
    const entry = { mtime: stat.mtime, size: stat.size, bytes, archive: await MdzArchiveCore.open(bytes) };
    this.cache.set(key, entry);
    return { ...entry, stat };
  }

  public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { archiveUri, entryPath } = parseArchiveEntryUri(uri);
    const { archive, stat } = await this.open(archiveUri);
    const times = { ctime: stat.ctime, mtime: stat.mtime };
    const readonly = await isReadonlyArchive(archiveUri, stat) ? { permissions: vscode.FilePermission.Readonly } : {};
    if (entryPath && archive.hasEntry(entryPath)) {
      const size = archive.listEntries().find((e) => e.path === entryPath)?.byteSize ?? 0;
      return { type: vscode.FileType.File, size, ...times, ...readonly };
    }
    if (!entryPath || archive.listPaths().some((p) => p.startsWith(`${entryPath}/`))) {
      return { type: vscode.FileType.Directory, size: 0, ...times, ...readonly };
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { archiveUri, entryPath } = parseArchiveEntryUri(uri);
    const { archive } = await this.open(archiveUri);
    const prefix = entryPath ? `${entryPath}/` : '';
    const children = new Map<string, vscode.FileType>();
    for (const path of archive.listPaths()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash < 0) children.set(rest, vscode.FileType.File);
      else children.set(rest.slice(0, slash), vscode.FileType.Directory);
    }
    return [...children];
  }

  public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { archiveUri, entryPath } = parseArchiveEntryUri(uri);
    const { archive } = await this.open(archiveUri);
    if (!archive.hasEntry(entryPath)) throw vscode.FileSystemError.FileNotFound(uri);
    return archive.readBytes(entryPath);
  }

  public async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
    const { archiveUri, entryPath } = parseArchiveEntryUri(uri);
    if (MdzEditorProvider.isDocumentDirty(archiveUri)) {
      // Writing now would be overwritten by the MDZip editor's next save (or overwrite its changes).
      const name = archiveUri.path.split('/').pop() ?? 'The archive';
      const message = `${name} has unsaved changes in the MDZip editor. Save or revert them, then save ${uri.path.split('/').pop()} again.`;
      void vscode.window.showWarningMessage(message, 'Save MDZip Changes').then(async (choice) => {
        if (choice === 'Save MDZip Changes') {
          await vscode.commands.executeCommand('vscode.openWith', archiveUri, MdzEditorProvider.VIEW_TYPE);
          await vscode.commands.executeCommand('workbench.action.files.save');
        }
      });
      throw vscode.FileSystemError.Unavailable(message);
    }
    const { archive, bytes, stat } = await this.open(archiveUri);
    if (await isReadonlyArchive(archiveUri, stat)) throw vscode.FileSystemError.NoPermissions(uri);
    const exists = archive.hasEntry(entryPath);
    if (!exists && !options.create) throw vscode.FileSystemError.FileNotFound(uri);
    if (exists && !options.overwrite) throw vscode.FileSystemError.FileExists(uri);
    const { blob } = await MdzArchiveCore.updateFiles(bytes, [{ path: entryPath, content }]);
    await vscode.workspace.fs.writeFile(archiveUri, new Uint8Array(await blob.arrayBuffer()));
    this.cache.delete(archiveUri.toString());
    this.emitter.fire([{ type: exists ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created, uri }]);
  }

  // Watching: a change to the archive on disk is reported as a change to the watched entry,
  // so an editor showing it can offer to reload.
  public watch(uri: vscode.Uri): vscode.Disposable {
    let archiveUri: vscode.Uri;
    try {
      archiveUri = parseArchiveEntryUri(uri).archiveUri;
    } catch {
      return new vscode.Disposable(() => {});
    }
    if (archiveUri.scheme !== 'file') return new vscode.Disposable(() => {});
    const folder = vscode.Uri.joinPath(archiveUri, '..');
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, archiveUri.path.split('/').pop() ?? '')
    );
    const changed = (): void => {
      this.cache.delete(archiveUri.toString());
      this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    };
    watcher.onDidChange(changed);
    watcher.onDidCreate(changed);
    return watcher;
  }

  public createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions('Creating folders inside an archive is not supported here.');
  }

  public delete(): void {
    throw vscode.FileSystemError.NoPermissions('Delete files inside an archive from the MDZip editor.');
  }

  public rename(): void {
    throw vscode.FileSystemError.NoPermissions('Rename files inside an archive from the MDZip editor.');
  }
}

/** The archive the user is looking at: the active MDZip editor tab, if any. */
function activeArchiveUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom && input.viewType === MdzEditorProvider.VIEW_TYPE) return input.uri;
  return undefined;
}

export function registerArchiveEntryFileSystem(context: vscode.ExtensionContext): void {
  archiveIds = context.globalState;
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(ARCHIVE_ENTRY_SCHEME, new ArchiveEntryFileSystem(), { isCaseSensitive: true }),
    vscode.commands.registerCommand('mdzip.openArchiveEntry', async (archiveArg?: vscode.Uri, entryArg?: string) => {
      let archiveUri = archiveArg instanceof vscode.Uri ? archiveArg : activeArchiveUri();
      if (!archiveUri) {
        const picked = await vscode.window.showOpenDialog({ filters: { MDZip: ['mdz'] }, canSelectMany: false, openLabel: 'Choose archive' });
        archiveUri = picked?.[0];
      }
      if (!archiveUri) return;
      let entryPath = typeof entryArg === 'string' ? entryArg : undefined;
      if (!entryPath) {
        const archive = await MdzArchiveCore.open(new Uint8Array(await vscode.workspace.fs.readFile(archiveUri)));
        const choice = await vscode.window.showQuickPick(
          archive.listPaths().filter((p) => p !== 'manifest.json').map((p) => ({ label: p.split('/').pop() ?? p, description: p, path: p })),
          { placeHolder: 'Open a file from the archive in a VS Code editor' }
        );
        entryPath = choice?.path;
      }
      if (!entryPath) return;
      await vscode.commands.executeCommand('vscode.open', archiveEntryUri(archiveUri, entryPath));
    })
  );
}
