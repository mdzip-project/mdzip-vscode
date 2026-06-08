import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'dist/integration/**/*.test.js',
  workspaceFolder: './tests/integration/fixture',
  mocha: {
    timeout: 30000,
  },
});
