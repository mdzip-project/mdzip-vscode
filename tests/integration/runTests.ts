import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath = path.resolve(__dirname, 'index');

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    // ELECTRON_RUN_AS_NODE=1 is set in VS Code's extension host environment (where this runs).
    // Passing undefined removes it from Code.exe's env so it starts as Electron, not Node.js.
    extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined },
  });
}

main().catch(err => {
  console.error('Integration test runner failed:', err);
  process.exit(1);
});
