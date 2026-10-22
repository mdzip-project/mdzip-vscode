import * as assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import * as vscode from 'vscode';

// Files inside an .mdz opened in VS Code editors through the mdzip-entry file
// system (src/archiveEntryFs.ts).

interface MdzipTestApi {
  hasDocument(uri: vscode.Uri): boolean;
  simulateWebviewChange(uri: vscode.Uri, bytes: Uint8Array): void;
}

const FIXTURE = path.resolve(__dirname, '../../tests/integration/fixture/archive-entries.mdz');
// @mdzip/core-js is ESM-only; keep TypeScript from rewriting import() to require().
const importEsm = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

// The extension makes entry URIs (they carry an id it registers for the
// archive), so get one by opening an entry, then build the others from it.
let entryBase: vscode.Uri | undefined;
function entryUri(archiveUri: vscode.Uri, entryPath: string): vscode.Uri {
  assert.ok(entryBase, 'call openEntry first');
  return entryBase.with({ path: `/${path.basename(archiveUri.fsPath)}${entryPath ? `/${entryPath}` : ''}` });
}

async function openEntry(archiveUri: vscode.Uri, entryPath: string): Promise<vscode.Uri> {
  await vscode.commands.executeCommand('mdzip.openArchiveEntry', archiveUri, entryPath);
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input as { uri?: vscode.Uri } | undefined;
  assert.ok(input?.uri, 'no tab opened');
  entryBase = input.uri;
  return input.uri;
}

const sha = (bytes: Uint8Array): string => crypto.createHash('sha256').update(bytes).digest('hex');

async function readEntries(archivePath: string): Promise<Map<string, Uint8Array>> {
  const corePath = path.resolve(__dirname, '../../node_modules/@mdzip/core-js/dist/index.js');
  const { MdzArchiveCore } = await importEsm(pathToFileURL(corePath).href);
  const archive = await MdzArchiveCore.open(new Uint8Array(fs.readFileSync(archivePath)));
  const entries = new Map<string, Uint8Array>();
  for (const p of archive.listPaths()) entries.set(p, await archive.readBytes(p));
  return entries;
}

async function replaceAll(document: vscode.TextDocument, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
  assert.ok(await vscode.workspace.applyEdit(edit));
}

suite('MDZip archive entries in VS Code editors', () => {
  let tmpDir: string;
  let archivePath: string;
  let archiveUri: vscode.Uri;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode');
    assert.ok(ext, 'Extension not found');
    if (!ext.isActive) await ext.activate();
  });

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdzip-entry-'));
    archivePath = path.join(tmpDir, 'entries.mdz');
    fs.copyFileSync(FIXTURE, archivePath);
    archiveUri = vscode.Uri.file(archivePath);
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    try { fs.chmodSync(archivePath, 0o666); } catch { /* already gone */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('the open command shows the entry under its own name, with the archive as its parent folder', async () => {
    const uri = await openEntry(archiveUri, 'files/settings.json');
    assert.strictEqual(vscode.window.tabGroups.activeTabGroup.activeTab?.label, 'settings.json');
    assert.strictEqual(uri.scheme, 'mdzip-entry');
    assert.match(uri.authority, /^[0-9a-f]{16}$/);
    assert.strictEqual(uri.query, '');
    assert.strictEqual(uri.path, '/entries.mdz/files/settings.json');
    assert.strictEqual(vscode.window.activeTextEditor?.document.getText().includes('"original"'), true);

    const folder = await vscode.workspace.fs.stat(entryUri(archiveUri, 'files'));
    assert.strictEqual(folder.type, vscode.FileType.Directory);
    const listing = await vscode.workspace.fs.readDirectory(entryUri(archiveUri, ''));
    assert.deepStrictEqual(listing.map(([name]) => name).sort(), ['diagrams', 'files', 'index.md', 'manifest.json']);
  });

  test('saving an entry writes it into the archive and leaves every other entry as it was', async () => {
    await openEntry(archiveUri, 'index.md');
    const before = await readEntries(archivePath);
    const document = await vscode.workspace.openTextDocument(entryUri(archiveUri, 'files/settings.json'));
    await replaceAll(document, '{\n  "name": "edited in VS Code"\n}\n');
    assert.strictEqual(await document.save(), true);

    const after = await readEntries(archivePath);
    assert.match(Buffer.from(after.get('files/settings.json')!).toString('utf8'), /edited in VS Code/);
    for (const [entryPath, bytes] of before) {
      if (entryPath === 'files/settings.json' || entryPath === 'manifest.json') continue;
      assert.strictEqual(sha(after.get(entryPath)!), sha(bytes), `${entryPath} changed`);
    }
  });

  test('a missing entry is reported as not found', async () => {
    await openEntry(archiveUri, 'index.md');
    await assert.rejects(
      Promise.resolve(vscode.workspace.fs.readFile(entryUri(archiveUri, 'files/missing.json'))),
      (error: unknown) => error instanceof vscode.FileSystemError && error.code === 'FileNotFound'
    );
  });

  test('a save is refused while the archive has unsaved changes in the MDZip editor', async () => {
    const api = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode')!.exports;
    await vscode.commands.executeCommand('vscode.openWith', archiveUri, 'mdzip.mdzEditor');
    const deadline = Date.now() + 15_000;
    while (!api.hasDocument(archiveUri) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    await openEntry(archiveUri, 'index.md');
    await vscode.commands.executeCommand('vscode.openWith', archiveUri, 'mdzip.mdzEditor');
    api.simulateWebviewChange(archiveUri, new Uint8Array(fs.readFileSync(archivePath)));

    const archiveBefore = sha(fs.readFileSync(archivePath));
    const document = await vscode.workspace.openTextDocument(entryUri(archiveUri, 'files/settings.json'));
    await replaceAll(document, '{ "name": "should not be saved" }\n');
    const saved = await document.save();
    assert.strictEqual(saved, false, 'save refused');
    assert.strictEqual(sha(fs.readFileSync(archivePath)), archiveBefore, 'archive untouched');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });

  test('entries of a read-only archive are read-only', async () => {
    await openEntry(archiveUri, 'index.md');
    fs.chmodSync(archivePath, 0o444);
    const stat = await vscode.workspace.fs.stat(entryUri(archiveUri, 'files/settings.json'));
    assert.strictEqual(stat.permissions, vscode.FilePermission.Readonly);
  });
});
