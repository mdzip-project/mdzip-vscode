import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, 'index');

  // Open the fixture folder as workspace folder 0. Workspace-scoped commands (e.g. the
  // Claude Code MCP config tests) need a real workspace folder present from the start —
  // vscode.workspace.updateWorkspaceFolders() cannot safely go from zero folders to one
  // at runtime (VS Code documents that as a potential full extension-host restart).
  const fixturePath = path.join(extensionDevelopmentPath, 'tests', 'integration', 'fixture');

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [fixturePath],
    // ELECTRON_RUN_AS_NODE=1 is set in VS Code's extension host environment (where this runs).
    // Passing undefined removes it from Code.exe's env so it starts as Electron, not Node.js.
    extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined },
  });
}

main().catch(err => {
  console.error('Integration test runner failed:', err);
  process.exit(1);
});
