import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/** The exports shape from our activate(). */
interface MdzipTestApi {
  hasDocument(uri: vscode.Uri): boolean;
  simulateWebviewChange(uri: vscode.Uri, bytes: Uint8Array): void;
  getUserMcpConfigPath(): string;
  runClaudeMcpRepairCheck(): Promise<void>;
}

function getApi(): MdzipTestApi {
  const ext = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode');
  assert.ok(ext, 'Extension not found');
  assert.ok(ext.isActive, 'Extension not active');
  return ext.exports;
}

suite('MDZip Claude Code MCP config integration', () => {
  let configPath: string;
  let originalContent: string | undefined;

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension<MdzipTestApi>('mdzip-project.mdzip-vscode');
    assert.ok(ext, 'Extension not found — is it installed in the test host?');
    if (!ext.isActive) {
      await ext.activate();
    }
    getApi();

    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'expected the fixture folder to be open as workspace folder 0 (see runTests.ts launchArgs)');
    configPath = path.join(folder.uri.fsPath, '.mcp.json');
    originalContent = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : undefined;
  });

  teardown(() => {
    if (originalContent === undefined) {
      fs.rmSync(configPath, { force: true });
    } else {
      fs.writeFileSync(configPath, originalContent);
    }
  });

  test('enableClaudeMcp writes a project .mcp.json with an mcpServers.MDZip entry', async () => {
    fs.rmSync(configPath, { force: true });

    await vscode.commands.executeCommand('mdzip.enableClaudeMcp');

    assert.ok(fs.existsSync(configPath), 'expected .mcp.json to be written at the workspace root');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.mcpServers?.MDZip, 'expected mcpServers.MDZip entry (not servers.MDZip)');
    assert.strictEqual(config.mcpServers.MDZip.type, 'stdio');
    assert.ok(
      String(config.mcpServers.MDZip.args[0]).includes('mdzip-mcp-launcher.cjs'),
      'expected the version-independent launcher path'
    );
  });

  test('enableClaudeMcp merges into existing mcpServers instead of overwriting them', async () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { SomeOtherServer: { type: 'stdio', command: 'node', args: ['x.js'] } } }, null, 2)
    );

    await vscode.commands.executeCommand('mdzip.enableClaudeMcp');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(config.mcpServers?.SomeOtherServer, 'existing unrelated server entry must survive the merge');
    assert.ok(config.mcpServers?.MDZip, 'expected mcpServers.MDZip entry to be added');
  });

  test('repair check leaves a working .mcp.json entry alone (only fires when genuinely broken)', async () => {
    // A real, resolvable path (this test file itself) — must NOT be touched even though it's
    // not the launcher, since maybeRepairClaudeMcpConfig only acts on version-pinned paths
    // matching <extension-package-name>-<version>/... that no longer resolve.
    const untouched = { mcpServers: { MDZip: { type: 'stdio', command: 'node', args: [__filename] } } };
    fs.writeFileSync(configPath, JSON.stringify(untouched, null, 2));

    await getApi().runClaudeMcpRepairCheck();

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepStrictEqual(config, untouched, 'a non-version-pinned entry must not be rewritten');
  });

  test('repair check rewrites a stale version-pinned .mcp.json entry to the launcher path', async () => {
    const staleDir = path.join(os.tmpdir(), 'mdzip-project.mdzip-vscode-0.1.240', 'dist');
    const stalePath = path.join(staleDir, 'mdz-mcp-server.js');
    // Deliberately do NOT create staleDir/stalePath on disk — that orphaned state is the bug.
    fs.rmSync(staleDir, { recursive: true, force: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { MDZip: { type: 'stdio', command: 'node', args: [stalePath] } } }, null, 2)
    );

    await getApi().runClaudeMcpRepairCheck();

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(
      config.mcpServers?.MDZip?.args?.[0]?.includes('mdzip-mcp-launcher.cjs'),
      `expected the stale version-pinned entry to be rewritten to the launcher path, got: ${JSON.stringify(config)}`
    );
  });

  test('repair check repairs a stale legacy lowercase "mdzip" entry too', async () => {
    const staleDir = path.join(os.tmpdir(), 'mdzip-project.mdzip-vscode-0.2.0', 'dist');
    const stalePath = path.join(staleDir, 'mdz-mcp-server.js');
    fs.rmSync(staleDir, { recursive: true, force: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { mdzip: { type: 'stdio', command: 'node', args: [stalePath] } } }, null, 2)
    );

    await getApi().runClaudeMcpRepairCheck();

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(config.mcpServers?.mdzip, undefined, 'legacy lowercase key must be removed');
    assert.ok(
      config.mcpServers?.MDZip?.args?.[0]?.includes('mdzip-mcp-launcher.cjs'),
      `expected the current-cased entry to be repaired to the launcher path, got: ${JSON.stringify(config)}`
    );
  });
});
