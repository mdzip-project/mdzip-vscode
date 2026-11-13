import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// The committed side of a Source Control diff is a git: URI, which VS Code's
// Git extension reads with `git show --textconv`. In a repository set up for
// `mdz textconv`, that's text, not the archive; the editor must still open it
// (src/mdzBytes.ts).

interface MdzipTestApi {
  readArchiveBytes(uri: vscode.Uri): Promise<Uint8Array>;
  hasDiffPanel(filePath: string): boolean;
}

interface GitApi {
  openRepository(root: vscode.Uri): Promise<unknown>;
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}

const FIXTURE = path.resolve(__dirname, '../../tests/integration/fixture/archive-entries.mdz');

function git(cwd: string, ...args: string[]): Buffer {
  return execFileSync('git', args, { cwd });
}

const isZip = (bytes: Uint8Array): boolean => bytes[0] === 0x50 && bytes[1] === 0x4b;

suite('MDZip with git textconv', () => {
  let root: string;
  let fileUri: vscode.Uri;
  let gitApi: GitApi;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode');
    assert.ok(ext);
    if (!ext.isActive) await ext.activate();

    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mdzip-textconv-')));
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'test@example.org');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'config', 'diff.mdz.textconv', 'node -e "process.stdout.write(\'===== manifest.json =====\\n\')"');
    fs.writeFileSync(path.join(root, '.gitattributes'), '*.mdz diff=mdz\n');
    fs.copyFileSync(FIXTURE, path.join(root, 'guide.mdz'));
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'one');
    fileUri = vscode.Uri.file(path.join(root, 'guide.mdz'));

    const gitExt = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git');
    assert.ok(gitExt, 'vscode.git not found');
    if (!gitExt.isActive) await gitExt.activate();
    gitApi = gitExt.exports.getAPI(1);
    assert.ok(await gitApi.openRepository(vscode.Uri.file(root)), 'git repository not opened');
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // VS Code's Git extension may still hold the repository open.
    }
  });

  const api = (): MdzipTestApi => vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode')!.exports;

  test('the committed and staged versions are read as the archive, not the textconv text', async () => {
    const headUri = gitApi.toGitUri(fileUri, 'HEAD');
    // The setup reproduces the problem: VS Code hands over the textconv text.
    assert.equal(isZip(await vscode.workspace.fs.readFile(headUri)), false);

    const committed = fs.readFileSync(FIXTURE);
    assert.deepEqual(Buffer.from(await api().readArchiveBytes(headUri)), committed);
    assert.deepEqual(Buffer.from(await api().readArchiveBytes(gitApi.toGitUri(fileUri, '~'))), committed);
  });

  test('opening the committed side shows the MDZip archive diff', async () => {
    await vscode.commands.executeCommand('vscode.openWith', gitApi.toGitUri(fileUri, 'HEAD'), 'mdzip.mdzEditor');
    const deadline = Date.now() + 10_000;
    while (!api().hasDiffPanel(fileUri.fsPath)) {
      assert.ok(Date.now() < deadline, 'the MDZip diff did not open');
      await new Promise((r) => setTimeout(r, 100));
    }
  });
});
