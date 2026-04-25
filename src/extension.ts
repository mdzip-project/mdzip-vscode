import * as vscode from 'vscode';
import { MdzEditorProvider } from './mdzEditorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(MdzEditorProvider.register(context));

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.newFile', async () => {
      const uri = await vscode.window.showSaveDialog({
        filters: { 'MDZip Document': ['mdz'] },
        title: 'New MDZip Document',
      });
      if (!uri) return;

      // Write an empty .mdz archive with a starter index.md
      const { buildNewArchive } = await import('./mdzArchiveUtils');
      const blob = await buildNewArchive('# New Document\n\nStart writing here.\n');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await vscode.workspace.fs.writeFile(uri, bytes);
      await vscode.commands.executeCommand('vscode.openWith', uri, 'mdzip.mdzEditor');
    })
  );
}

export function deactivate(): void {
  // nothing to do
}
