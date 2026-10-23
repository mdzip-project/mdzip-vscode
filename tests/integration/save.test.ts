import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/** The exports shape from our activate(). */
interface MdzipTestApi {
  hasDocument(uri: vscode.Uri): boolean;
  simulateWebviewChange(uri: vscode.Uri, bytes: Uint8Array): void;
  simulateManifestChange(uri: vscode.Uri, manifest: unknown): Promise<void>;
  documentMarkdown(uri: vscode.Uri): string | undefined;
  runMcpTool(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>;
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

  test('markdown: default override opens the built-in text diff', async () => {
    const leftUri = vscode.Uri.file(path.join(tmpDir, 'diff-left.md'));
    const rightUri = vscode.Uri.file(path.join(tmpDir, 'diff-right.md'));
    fs.writeFileSync(leftUri.fsPath, '# Left\n');
    fs.writeFileSync(rightUri.fsPath, '# Right\n');

    const config = vscode.workspace.getConfiguration('workbench');
    const previous = config.get<Record<string, string>>('editorAssociations');
    await config.update(
      'editorAssociations',
      { ...(previous ?? {}), '*.md': 'mdzip.mdEditor' },
      vscode.ConfigurationTarget.Global
    );

    try {
      await vscode.commands.executeCommand(
        '_workbench.diff',
        leftUri,
        rightUri,
        'Markdown text diff',
        [vscode.ViewColumn.Active, { preview: true, override: 'default' }]
      );
      await new Promise(r => setTimeout(r, 500));
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
      assert.ok(
        tab?.input instanceof vscode.TabInputTextDiff,
        'the explicit default override should open a built-in text diff'
      );
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await config.update('editorAssociations', previous, vscode.ConfigurationTarget.Global);
    }
  });

  // mdzip-vscode#18: an MCP write to an archive open (and clean) in the MDZip
  // editor must survive the editor's next rename and save. Before the fix the
  // editor kept its pre-MCP bytes and wrote them back.
  test('mdz: an MCP write to an open archive survives a later rename and save', async () => {
    const mdzPath = path.join(tmpDir, 'mcp-then-rename.mdz');
    fs.copyFileSync(path.join(__dirname, '..', '..', 'tests', 'integration', 'fixture', 'archive-entries.mdz'), mdzPath);
    const uri = vscode.Uri.file(mdzPath);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'mdzip.mdzEditor');
    const api = getApi();
    await waitForDocument(api, uri);
    // Let the webview load and report its workspace back, as it does for a user.
    await new Promise(r => setTimeout(r, 1500));

    const text = (result: { content: Array<{ text?: string }>; isError?: boolean }): string => {
      assert.ok(!result.isError, `tool failed: ${result.content[0]?.text}`);
      return result.content[0]?.text ?? '';
    };
    const review = JSON.parse(text(await api.runMcpTool('mdz_review_document', { archivePath: mdzPath })));
    text(await api.runMcpTool('upsert_canonical_document', {
      archivePath: mdzPath,
      content: '# Written by the agent\n',
      expectedContentHash: review.canonicalContentHash,
    }));

    // The editor notices the change on disk and reloads (it has no unsaved edits).
    const deadline = Date.now() + 10_000;
    while (!/Written by the agent/.test(api.documentMarkdown(uri) ?? '')) {
      if (Date.now() > deadline) throw new Error('the editor did not reload the MCP write');
      await new Promise(r => setTimeout(r, 100));
    }

    const manifest = JSON.parse(text(await api.runMcpTool('mdz_read_text', { archivePath: mdzPath, entryPath: 'manifest.json' })));
    await api.simulateManifestChange(uri, { ...manifest, title: 'Renamed after the agent' });
    await saveActiveDocument();
    await new Promise(r => setTimeout(r, 500));

    // mdz_review_document returns its metadata first, then the Markdown.
    const after = await api.runMcpTool('mdz_review_document', { archivePath: mdzPath });
    assert.ok(!after.isError);
    const markdown = after.content.map((part) => part.text ?? '').join('\n');
    assert.match(markdown, /Written by the agent/, 'the MCP change must still be in the file');
    const savedManifest = JSON.parse(text(await api.runMcpTool('mdz_read_text', { archivePath: mdzPath, entryPath: 'manifest.json' })));
    assert.equal(savedManifest.title, 'Renamed after the agent');
  });

  // Leave nothing open for the suites that follow (they write files in the
  // workspace folder, which an editor left open can hold on Windows).
  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await new Promise(r => setTimeout(r, 300));
  });
});
