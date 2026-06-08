import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/** The exports shape from our activate(). */
interface MdzipTestApi {
  hasDocument(uri: vscode.Uri): boolean;
  simulateWebviewChange(uri: vscode.Uri, bytes: Uint8Array): void;
}

function getApi(): MdzipTestApi {
  const ext = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode');
  assert.ok(ext, 'Extension not found');
  assert.ok(ext.isActive, 'Extension not active');
  return ext.exports;
}

async function waitForDocument(api: MdzipTestApi, uri: vscode.Uri, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!api.hasDocument(uri)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for document: ${uri.toString()}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

async function saveActiveDocument(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.files.save');
}

suite('MDZip save integration', () => {
  let tmpDir: string;

  suiteSetup(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdzip-test-'));
    // Activate the extension by opening the workspace
    const ext = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode');
    assert.ok(ext, 'Extension not found — is it installed in the test host?');
    if (!ext.isActive) {
      await ext.activate();
    }
  });

  suiteTeardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('markdown: save writes webview bytes to disk', async () => {
    const mdPath = path.join(tmpDir, 'test-save.md');
    fs.writeFileSync(mdPath, '# Original\n');
    const uri = vscode.Uri.file(mdPath);

    // Open with the custom editor
    await vscode.commands.executeCommand('vscode.openWith', uri, 'mdzip.mdEditor');
    const api = getApi();
    await waitForDocument(api, uri);

    const edited = new TextEncoder().encode('# Edited content\n');
    api.simulateWebviewChange(uri, edited);

    await saveActiveDocument();

    // Give VS Code a tick to flush the write
    await new Promise(r => setTimeout(r, 500));

    const onDisk = fs.readFileSync(mdPath);
    assert.deepStrictEqual(new Uint8Array(onDisk), edited, 'disk must contain the edited bytes');

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('markdown: dirty state is cleared after save', async () => {
    const mdPath = path.join(tmpDir, 'test-dirty.md');
    fs.writeFileSync(mdPath, '# Hello\n');
    const uri = vscode.Uri.file(mdPath);

    await vscode.commands.executeCommand('vscode.openWith', uri, 'mdzip.mdEditor');
    const api = getApi();
    await waitForDocument(api, uri);

    api.simulateWebviewChange(uri, new TextEncoder().encode('# Changed\n'));
    // VS Code processes the onDidChangeCustomDocument event asynchronously.
    await new Promise(r => setTimeout(r, 300));

    const tabBefore = vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .find(t => (t.input as { uri?: vscode.Uri })?.uri?.toString() === uri.toString());
    assert.ok(tabBefore?.isDirty, 'tab should be dirty before save');

    await saveActiveDocument();
    await new Promise(r => setTimeout(r, 500));

    const tabAfter = vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .find(t => (t.input as { uri?: vscode.Uri })?.uri?.toString() === uri.toString());
    assert.ok(!tabAfter?.isDirty, 'tab should not be dirty after save');

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  test('markdown: revert discards webview edits', async () => {
    const original = '# Before revert\n';
    const mdPath = path.join(tmpDir, 'test-revert.md');
    fs.writeFileSync(mdPath, original);
    const uri = vscode.Uri.file(mdPath);

    await vscode.commands.executeCommand('vscode.openWith', uri, 'mdzip.mdEditor');
    const api = getApi();
    await waitForDocument(api, uri);

    api.simulateWebviewChange(uri, new TextEncoder().encode('# After bad edit\n'));

    // Revert via command
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await new Promise(r => setTimeout(r, 500));

    // Now save — should write the service bytes (original), not the pre-revert edit
    await saveActiveDocument();
    await new Promise(r => setTimeout(r, 500));

    const onDisk = fs.readFileSync(mdPath, 'utf8');
    // The save after revert should NOT contain the "bad edit"
    assert.ok(!onDisk.includes('bad edit'), 'post-revert save must not write stale webview bytes');

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});
