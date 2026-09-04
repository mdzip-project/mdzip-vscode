import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';

/** The exports shape from our activate(). */
interface MdzipTestApi {
  hasDocument(uri: vscode.Uri): boolean;
  simulateWebviewChange(uri: vscode.Uri, bytes: Uint8Array): void;
  getUserMcpConfigPath(): string;
}

function getApi(): MdzipTestApi {
  const ext = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode');
  assert.ok(ext, 'Extension not found');
  assert.ok(ext.isActive, 'Extension not active');
  return ext.exports;
}

suite('MDZip user MCP config integration', () => {
  let configPath: string;
  let originalContent: string | undefined;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode');
    assert.ok(ext, 'Extension not found — is it installed in the test host?');
    if (!ext.isActive) {
      await ext.activate();
    }
    configPath = getApi().getUserMcpConfigPath();
    originalContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : undefined;
  });

  teardown(() => {
    // Restore whatever was there before each test so tests don't bleed into each other.
    if (originalContent === undefined) {
      fs.rmSync(configPath, { force: true });
    } else {
      fs.writeFileSync(configPath, originalContent);
    }
  });

  test('enableUserMcp writes the launcher entry directly, without an active editor', async () => {
    // Regression: the old implementation depended on vscode.window.activeTextEditor
    // being the just-opened config file, which raced and silently fell back to the
    // clipboard. Assert no active editor is required for the write to succeed.
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(configPath, { force: true });

    await vscode.commands.executeCommand('mdzip.enableUserMcp');

    assert.ok(fs.existsSync(configPath), 'expected mcp.json to be written directly');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.servers?.MDZip, 'expected servers.MDZip entry');
    assert.strictEqual(config.servers.MDZip.type, 'stdio');
    assert.ok(
      String(config.servers.MDZip.args[0]).includes('mdzip-mcp-launcher.cjs'),
      'expected the version-independent launcher path, not a pinned dist/ path'
    );
  });

  test('enableUserMcp merges into existing servers instead of overwriting them', async () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ servers: { SomeOtherServer: { type: 'stdio', command: 'node', args: ['x.js'] } } }, null, 2)
    );

    await vscode.commands.executeCommand('mdzip.enableUserMcp');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.servers?.SomeOtherServer, 'existing unrelated server entry must survive the merge');
    assert.ok(config.servers?.MDZip, 'expected servers.MDZip entry to be added');
  });

  test('enableUserMcp replaces a legacy lowercase "mdzip" entry rather than duplicating it', async () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ servers: { mdzip: { type: 'stdio', command: 'node', args: ['stale/path.js'] } } }, null, 2)
    );

    await vscode.commands.executeCommand('mdzip.enableUserMcp');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(config.servers?.mdzip, undefined, 'legacy lowercase key must be removed');
    assert.ok(config.servers?.MDZip, 'expected the current-cased servers.MDZip entry');
  });
});
