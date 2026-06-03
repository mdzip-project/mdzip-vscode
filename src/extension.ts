import * as vscode from 'vscode';
import * as path from 'path';
import type { GitExtension } from './vendor/git';
import { MdzEditorProvider } from './mdzEditorProvider';
import {
  buildNewArchiveWithTitle,
  buildNewArchiveBytesWithTitle,
  fileBaseNameFromPath,
  readCanonicalMarkdown,
  suggestedTitleFromMarkdown,
} from '@mdzip/editor';

const BUNDLED_MCP_SERVER_LABEL = 'MDZip MCP Server';
const BUNDLED_MCP_SERVER_KEY = 'MDZip';
const LEGACY_BUNDLED_MCP_SERVER_KEY = 'mdzip';

async function pickMdzFile(prompt: string): Promise<vscode.Uri | undefined> {
  const result = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { 'MDZip Document': ['mdz'] },
    title: prompt,
  });
  return result?.[0];
}

async function getGitBaseBytes(fileUri: vscode.Uri): Promise<Buffer> {
  const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!gitExt) throw new Error('Git extension not available');
  if (!gitExt.isActive) await gitExt.activate();
  const api = gitExt.exports.getAPI(1);

  const repo = api.getRepository(fileUri);
  if (!repo) throw new Error('File is not inside a git repository');

  const relPath = fileUri.fsPath
    .substring(repo.rootUri.fsPath.length + 1)
    .replace(/\\/g, '/');

  try {
    return await repo.buffer('HEAD', relPath);
  } catch {
    throw new Error(`File has no git history: ${path.basename(fileUri.fsPath)}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const version = context.extension.packageJSON.version;
  console.log(`[MDZip] Activating extension version ${version}`);

  context.subscriptions.push(MdzEditorProvider.register(context));

  const bundledServerPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'mdz-mcp-server.js').fsPath;
  const bundledServerConfig: { type: 'stdio'; command: string; args: string[] } = {
    type: 'stdio',
    command: 'node',
    args: [bundledServerPath],
  };

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider('mdzip.bundled-mcp', {
      provideMcpServerDefinitions() {
        return [
          new vscode.McpStdioServerDefinition(
            BUNDLED_MCP_SERVER_LABEL,
            process.execPath,
            [bundledServerPath],
            {},
            String(context.extension.packageJSON.version || '0.0.0')
          ),
        ];
      },
    })
  );

  void maybeShowWelcomeWalkthrough(context);
  void maybePromptClaudeCodeMcp(context, bundledServerConfig);

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.copyMcpConfigSnippet', async () => {
      const snippet = JSON.stringify(
        {
          servers: {
            [BUNDLED_MCP_SERVER_KEY]: bundledServerConfig,
          },
        },
        null,
        2
      );

      await vscode.env.clipboard.writeText(snippet);
      vscode.window.showInformationMessage('Copied MDZip MCP server config snippet to clipboard.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.enableWorkspaceMcp', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage('Open a workspace folder to enable the MDZip MCP server.');
        return;
      }

      const vscodeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode');
      const mcpConfigUri = vscode.Uri.joinPath(vscodeDir, 'mcp.json');

      let config: { servers?: Record<string, unknown> } = {};
      try {
        const existing = await vscode.workspace.fs.readFile(mcpConfigUri);
        config = JSON.parse(new TextDecoder('utf-8').decode(existing));
      } catch {
        // Missing file is expected on first run.
      }

      if (!config || typeof config !== 'object') {
        config = {};
      }
      if (!config.servers || typeof config.servers !== 'object') {
        config.servers = {};
      }

      upsertBundledMcpServer(config.servers, bundledServerConfig);

      await vscode.workspace.fs.createDirectory(vscodeDir);
      await vscode.workspace.fs.writeFile(
        mcpConfigUri,
        new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`)
      );

      const document = await vscode.workspace.openTextDocument(mcpConfigUri);
      await vscode.window.showTextDocument(document);
      vscode.window.showInformationMessage('Enabled MDZip MCP server in workspace .vscode/mcp.json');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.enableUserMcp', async () => {
      const opened = await openBuiltInMcpConfiguration(['mcp', 'user', 'configuration']);
      const editor = vscode.window.activeTextEditor;
      if (!opened || !editor) {
        await vscode.env.clipboard.writeText(
          JSON.stringify({ servers: { [BUNDLED_MCP_SERVER_KEY]: bundledServerConfig } }, null, 2)
        );
        vscode.window.showWarningMessage(
          'Could not open the user MCP configuration automatically. The MDZip MCP config snippet was copied to the clipboard instead.'
        );
        return;
      }

      const nextText = mergeMcpConfigText(editor.document.getText(), bundledServerConfig);
      const edit = new vscode.WorkspaceEdit();
      const end = editor.document.lineAt(editor.document.lineCount - 1).range.end;
      edit.replace(editor.document.uri, new vscode.Range(new vscode.Position(0, 0), end), `${nextText}\n`);
      await vscode.workspace.applyEdit(edit);
      await editor.document.save();
      vscode.window.showInformationMessage('Enabled MDZip MCP server in user MCP configuration.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.openGettingStarted', async () => {
      await openWalkthrough(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.openMcpServerStatus', async () => {
      const commands = await vscode.commands.getCommands(true);
      const opened = await executeDiscoveredCommand(commands, [
        ['mcp', 'list', 'server'],
        ['mcp', 'server'],
      ]);

      if (opened) {
        return;
      }

      vscode.window.showInformationMessage(
        'Open the Command Palette and run "MCP: List Servers" to inspect bundled MDZip MCP server status.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.openExtensionHelp', async () => {
      const commands = await vscode.commands.getCommands(true);

      try {
        await vscode.commands.executeCommand('extension.open', context.extension.id);
        return;
      } catch {
        // Fall through to other built-in extension UI entry points.
      }

      const opened =
        (await executeKnownCommand('workbench.extensions.search', `@id:${context.extension.id}`)) ||
        (await executeDiscoveredCommand(commands, [
          ['extension', 'open'],
          ['extensions', 'search'],
          ['extensions', 'installed'],
        ]));

      if (!opened) {
        vscode.window.showInformationMessage(
          'Open the Extensions view and search for "MDZip (.mdz) Editor" to review extension details and bundled MCP setup.'
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.openDocumentation', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://mdzip.org/spec.html'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.openWebsite', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('https://mdzip.org'));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.enableWorkspaceAgentInstructions', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showWarningMessage(
          'Open a workspace folder to write MDZip agent instructions for Copilot.'
        );
        return;
      }

      const githubDir = vscode.Uri.joinPath(workspaceFolder.uri, '.github');
      const instructionsUri = vscode.Uri.joinPath(githubDir, 'copilot-instructions.md');

      let existingText = '';
      try {
        const bytes = await vscode.workspace.fs.readFile(instructionsUri);
        existingText = new TextDecoder('utf-8').decode(bytes);
      } catch {
        // Missing file is expected on first run.
      }

      const block = buildWorkspaceAgentInstructionsBlock();
      const nextText = upsertMarkedBlock(existingText, 'mdzip-mcp-review-guidance', block);

      await vscode.workspace.fs.createDirectory(githubDir);
      await vscode.workspace.fs.writeFile(instructionsUri, new TextEncoder().encode(nextText));

      const document = await vscode.workspace.openTextDocument(instructionsUri);
      await vscode.window.showTextDocument(document);
      vscode.window.showInformationMessage(
        'Updated workspace .github/copilot-instructions.md with MDZip MCP review guidance.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.newFile', async (resource?: vscode.Uri) => {
      const targetUri = await resolveNewMdzTargetUri(resource);
      if (!targetUri) {
        return;
      }

      // Write an empty .mdz archive with a starter index.md
      const blob = await buildNewArchiveWithTitle(
        '# New Document\n\nStart writing here.\n',
        fileBaseNameFromPath(targetUri.path)
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await vscode.workspace.fs.writeFile(targetUri, bytes);

      // Open freshly-created files in source edit mode for immediate typing.
      MdzEditorProvider.markNextOpenInEdit(targetUri);
      await vscode.commands.executeCommand('vscode.openWith', targetUri, 'mdzip.mdzEditor');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.convertMarkdownToMdz', async (resource?: vscode.Uri) => {
      const sourceUri = await resolveSourceMarkdownUri(resource);
      if (!sourceUri) {
        return;
      }

      const sourceBytes = await vscode.workspace.fs.readFile(sourceUri);
      const markdown = new TextDecoder('utf-8').decode(sourceBytes);

      const sourcePath = sourceUri.path;
      const slashIndex = sourcePath.lastIndexOf('/');
      const dirPath = slashIndex >= 0 ? sourcePath.slice(0, slashIndex) : '';
      const sourceName = slashIndex >= 0 ? sourcePath.slice(slashIndex + 1) : sourcePath;
      const baseName = sourceName.replace(/\.md$/i, '') || 'document';
      const targetUri = sourceUri.with({ path: `${dirPath}/${baseName}.mdz` });
      const derivedTitle = suggestedTitleFromMarkdown(markdown, baseName);
      const relativeImageAssets = await collectRelativeMarkdownImageAssets(sourceUri, markdown);

      let buildAssets: readonly { archivePath: string; fileBytes: Uint8Array }[] = [];
      if (relativeImageAssets.length > 0) {
        const copySelection = await vscode.window.showInformationMessage(
          `Found ${relativeImageAssets.length} relative image reference${relativeImageAssets.length === 1 ? '' : 's'}. Copy matching files into the new .mdz?`,
          { modal: true },
          'Copy Images',
          'Skip Images'
        );

        if (copySelection === 'Copy Images') {
          buildAssets = relativeImageAssets;
        }
      }

      const bytes = await buildNewArchiveBytesWithTitle(markdown, derivedTitle, buildAssets);
      await vscode.workspace.fs.writeFile(targetUri, bytes);

      MdzEditorProvider.markNextOpenInEdit(targetUri);
      await vscode.commands.executeCommand('vscode.openWith', targetUri, 'mdzip.mdzEditor');
    })
  );


  // Register FileSystemProvider for virtual markdown URIs
  class MdzMarkdownFsProvider implements vscode.FileSystemProvider {
      static cache = new Map<string, Uint8Array>(); // key → raw .mdz bytes

      onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>().event;

      async stat(): Promise<vscode.FileStat> {
        return { type: vscode.FileType.File, size: 0, mtime: 0, ctime: 0 };
      }

      async readDirectory(): Promise<[string, vscode.FileType][]> {
        return [];
      }

      async createDirectory(): Promise<void> {
        throw vscode.FileSystemError.NoPermissions('Read-only file system');
      }

      async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        // URI format: mdzip-markdown:///<key>/<fsPath>
        // path will be /<key>/<fsPath> due to triple slash in URI
        const match = uri.path.match(/^\/([^/]+)\/(.+)$/);
        if (!match) throw new Error('Invalid URI format');
        const [, key, fsPath] = match;

        // Use cached bytes if present (git base), else read from disk (working copy)
        const cached = MdzMarkdownFsProvider.cache.get(key);
        const mdzBytes = cached ?? new Uint8Array(await vscode.workspace.fs.readFile(vscode.Uri.file(fsPath)));

        const result = await readCanonicalMarkdown(mdzBytes);
        return new TextEncoder().encode(result.markdown);
      }

      async writeFile(): Promise<void> {
        throw vscode.FileSystemError.NoPermissions('Read-only file system');
      }

      async delete(): Promise<void> {
        throw vscode.FileSystemError.NoPermissions('Read-only file system');
      }

      async rename(): Promise<void> {
        throw vscode.FileSystemError.NoPermissions('Read-only file system');
      }

      watch(): vscode.Disposable {
        return new vscode.Disposable(() => {});
      }
  }

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('mdzip-markdown', new MdzMarkdownFsProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.compareMarkdown', async (resource?: vscode.Uri) => {
      console.log('[MDZip] compareMarkdown command invoked');
      try {
        console.log('[MDZip] Showing compare dialog');
        vscode.window.showInformationMessage('Starting MDZip markdown compare...');

        console.log('[MDZip] Starting file selection');
        let rightUri = resource;
        if (!rightUri) {
          const activeUri = vscode.window.activeTextEditor?.document.uri;
          if (activeUri?.path.toLowerCase().endsWith('.mdz')) {
            rightUri = activeUri;
          }
        }

        if (!rightUri) {
          console.log('[MDZip] Showing right file picker');
          rightUri = await pickMdzFile('Select working .mdz file');
          if (!rightUri) {
            console.log('[MDZip] Right file cancelled');
            return;
          }
        }
        console.log('[MDZip] Right file selected:', rightUri.fsPath);

        console.log('[MDZip] Showing left file picker');
        const leftUri = await pickMdzFile('Select base .mdz file to compare');
        if (!leftUri) {
          console.log('[MDZip] Left file cancelled');
          return;
        }
        console.log('[MDZip] Left file selected:', leftUri.fsPath);

        console.log('[MDZip] Reading archives...');
        vscode.window.showInformationMessage('Reading archives...');

        // Read file, checking for unsaved changes
        const readMdzFile = async (uri: vscode.Uri, side: string): Promise<Uint8Array> => {
          // For custom editors (.mdz files), always ask user to save before comparing
          // to ensure we're comparing the latest version
          const isOpenInTab = Array.from(vscode.window.tabGroups.all)
            .some(group => group.tabs.some(tab =>
              (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputCustom) &&
              tab.input.uri.fsPath === uri.fsPath
            ));

          if (isOpenInTab) {
            const save = await vscode.window.showWarningMessage(
              `${side} file is open. Save before comparing to ensure you're comparing the latest version?`,
              'Save',
              'Compare Anyway',
              'Cancel'
            );
            if (save === 'Cancel') {
              throw new Error('Cancelled by user');
            }
            if (save === 'Save') {
              // Try saving the document
              const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath);
              if (doc) {
                await doc.save();
              } else {
                // For custom editors, use the files.save command
                await vscode.commands.executeCommand('workbench.action.files.saveFiles', [uri]);
              }
            }
          }

          const bytes = await vscode.workspace.fs.readFile(uri);
          if (bytes.length === 0) {
            throw new Error(`File is empty or not saved: ${uri.fsPath}`);
          }
          return bytes;
        };

        const leftBytes = await readMdzFile(leftUri, 'Left');
        const rightBytes = await readMdzFile(rightUri, 'Right');

        vscode.window.showInformationMessage('Creating diff view...');

        // Create virtual URIs using hash + path to ensure uniqueness and cache-safety
        const leftHash = Date.now().toString(36);
        const rightHash = Date.now().toString(36) + '2';
        const leftVirtualUri = vscode.Uri.parse(`mdzip-markdown:///${leftHash}/${leftUri.fsPath}`);
        const rightVirtualUri = vscode.Uri.parse(`mdzip-markdown:///${rightHash}/${rightUri.fsPath}`);

        const leftLabel = path.basename(leftUri.fsPath);
        const rightLabel = path.basename(rightUri.fsPath);
        const title = `${leftLabel} ↔ ${rightLabel} (Markdown)`;

        // Open the diff with virtual URIs (read-only, no dirty flags)
        await vscode.commands.executeCommand('vscode.diff', leftVirtualUri, rightVirtualUri, title, {
          preview: true
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Compare failed: ${msg}`);
        console.error('MDZip compare error:', err);
        if (err instanceof Error) {
          console.error('Stack:', err.stack);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.compareWithGitBase', async (resource?: vscode.Uri) => {
      try {
        // Resolve the file URI from context menu, active custom editor tab, or file picker
        let fileUri = resource;
        if (!fileUri) {
          for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
              if (tab.input instanceof vscode.TabInputCustom &&
                  tab.input.uri.path.toLowerCase().endsWith('.mdz')) {
                fileUri = tab.input.uri;
                break;
              }
            }
            if (fileUri) break;
          }
        }
        if (!fileUri) {
          fileUri = await pickMdzFile('Select .mdz file to compare with git base');
          if (!fileUri) return;
        }

        // Prompt to save if file is open and possibly dirty
        const isOpenInTab = vscode.window.tabGroups.all.some(g =>
          g.tabs.some(t =>
            (t.input instanceof vscode.TabInputText || t.input instanceof vscode.TabInputCustom) &&
            t.input.uri.fsPath === fileUri!.fsPath
          )
        );
        if (isOpenInTab) {
          const choice = await vscode.window.showWarningMessage(
            'Save file before comparing with git base?',
            'Save', 'Compare Anyway', 'Cancel'
          );
          if (choice === 'Cancel' || choice === undefined) return;
          if (choice === 'Save') {
            const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === fileUri!.fsPath);
            if (doc) await doc.save();
            else await vscode.commands.executeCommand('workbench.action.files.saveFiles', [fileUri]);
          }
        }

        // Fetch git HEAD bytes and store in cache
        const gitBytes = await getGitBaseBytes(fileUri);
        const baseKey = Date.now().toString(36) + 'base';
        MdzMarkdownFsProvider.cache.set(baseKey, new Uint8Array(gitBytes));

        const workingKey = Date.now().toString(36) + 'work';
        // working side: no cache entry → provider reads from disk

        const baseName = path.basename(fileUri.fsPath);
        const baseVirtualUri = vscode.Uri.parse(`mdzip-markdown:///${baseKey}/${fileUri.fsPath}`);
        const workVirtualUri = vscode.Uri.parse(`mdzip-markdown:///${workingKey}/${fileUri.fsPath}`);
        const title = `${baseName}: HEAD ↔ Working`;

        await vscode.commands.executeCommand('vscode.diff', baseVirtualUri, workVirtualUri, title, {
          preview: true
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Git compare failed: ${msg}`);
      }
    })
  );

}

async function resolveSourceMarkdownUri(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (resource && resource.path.toLowerCase().endsWith('.md')) {
    return resource;
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && activeUri.path.toLowerCase().endsWith('.md')) {
    return activeUri;
  }

  vscode.window.showWarningMessage('Select a .md file to convert to .mdz.');
  return undefined;
}

async function resolveNewMdzTargetUri(resource?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (resource) {
    try {
      const stat = await vscode.workspace.fs.stat(resource);
      if (stat.type === vscode.FileType.Directory) {
        const rawName = await vscode.window.showInputBox({
          title: 'New MDZip Document',
          prompt: 'Enter file name',
          value: 'Untitled.mdz',
          validateInput: (value) => {
            const name = value.trim();
            if (!name) {
              return 'File name is required.';
            }
            if (name.includes('/') || name.includes('\\')) {
              return 'Use a file name, not a path.';
            }
            return null;
          },
        });
        if (!rawName) {
          return undefined;
        }

        const fileName = rawName.toLowerCase().endsWith('.mdz') ? rawName : `${rawName}.mdz`;
        return vscode.Uri.joinPath(resource, fileName);
      }
    } catch {
      // Fall through to Save dialog when resource metadata is unavailable.
    }
  }

  return vscode.window.showSaveDialog({
    filters: { 'MDZip Document': ['mdz'] },
    title: 'New MDZip Document',
  });
}

export function deactivate(): void {
  // nothing to do
}

async function maybePromptClaudeCodeMcp(
  context: vscode.ExtensionContext,
  bundledServerConfig: { type: 'stdio'; command: string; args: string[] }
): Promise<void> {
  const key = 'mdzip.hasPromptedClaudeCodeMcp.v1';
  if (context.globalState.get<boolean>(key)) {
    return;
  }

  await context.globalState.update(key, true);

  const workspaceLabel = 'Add to Workspace';
  const userLabel = 'Add to User Settings';
  const selection = await vscode.window.showInformationMessage(
    'Add the MDZip MCP server to your Claude Code config so Claude can read .mdz files directly?',
    workspaceLabel,
    userLabel,
    'Not Now'
  );

  if (selection === workspaceLabel) {
    await vscode.commands.executeCommand('mdzip.enableWorkspaceMcp');
  } else if (selection === userLabel) {
    await vscode.commands.executeCommand('mdzip.enableUserMcp');
  }
}

async function maybeShowWelcomeWalkthrough(context: vscode.ExtensionContext): Promise<void> {
  const key = 'mdzip.hasShownWelcomeWalkthrough.v2';
  if (context.globalState.get<boolean>(key)) {
    return;
  }

  await context.globalState.update(key, true);

  const openGuideLabel = 'Open Getting Started';
  const openHelpLabel = 'Extension Details';
  const selection = await vscode.window.showInformationMessage(
    'MDZip is installed. Open an .mdz file or use the MDZip commands from the Command Palette.',
    openGuideLabel,
    openHelpLabel,
    'Later'
  );

  if (selection === openGuideLabel) {
    const opened = await openWalkthrough(context);
    if (!opened) {
      await vscode.commands.executeCommand('mdzip.openExtensionHelp');
    }
    return;
  }

  if (selection === openHelpLabel) {
    await vscode.commands.executeCommand('mdzip.openExtensionHelp');
  }
}

async function openWalkthrough(context: vscode.ExtensionContext): Promise<boolean> {
  try {
    await vscode.commands.executeCommand(
      'workbench.action.openWalkthrough',
      `${context.extension.id}#mdzip.gettingStarted`,
      false
    );
    return true;
  } catch {
    return false;
  }
}

async function openBuiltInMcpConfiguration(terms: string[]): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  return executeDiscoveredCommand(commands, [terms]);
}

function findCommandId(commands: readonly string[], terms: string[]): string | undefined {
  const loweredTerms = terms.map((term) => term.toLowerCase());
  return commands.find((command) => {
    const lower = command.toLowerCase();
    return loweredTerms.every((term) => lower.includes(term));
  });
}

function mergeMcpConfigText(
  existingText: string,
  serverConfig: { type: 'stdio'; command: string; args: string[] }
): string {
  let parsed: { servers?: Record<string, unknown> } = {};
  if (existingText.trim()) {
    parsed = JSON.parse(existingText) as { servers?: Record<string, unknown> };
  }
  if (!parsed || typeof parsed !== 'object') {
    parsed = {};
  }
  if (!parsed.servers || typeof parsed.servers !== 'object') {
    parsed.servers = {};
  }
  upsertBundledMcpServer(parsed.servers, serverConfig);
  return JSON.stringify(parsed, null, 2);
}

function upsertBundledMcpServer(
  servers: Record<string, unknown>,
  serverConfig: { type: 'stdio'; command: string; args: string[] }
): void {
  const legacyConfig = servers[LEGACY_BUNDLED_MCP_SERVER_KEY];
  servers[BUNDLED_MCP_SERVER_KEY] = serverConfig;

  if (
    legacyConfig &&
    typeof legacyConfig === 'object' &&
    JSON.stringify(legacyConfig) === JSON.stringify(serverConfig)
  ) {
    delete servers[LEGACY_BUNDLED_MCP_SERVER_KEY];
  }
}

function buildWorkspaceAgentInstructionsBlock(): string {
  return [
    '## MDZip MCP Review Guidance',
    '',
    'When reviewing, summarizing, or editing `.mdz` files:',
    '',
    '1. Call `mdz_review_document` first with the `.mdz` `archivePath`.',
    '2. Use the returned `resolvedMarkdownPath`, `canonicalEntrypointPath`, and `entrypointSource` fields before deciding on write actions.',
    '3. For canonical markdown updates, call `upsert_canonical_document` instead of editing archive entries manually.',
    '4. If a tool returns a machine-readable error with `nextAction`, follow that next action and retry.',
    '5. Do not extract archive entries to disk unless the user explicitly asks for extraction.',
    '6. Use lower-level tools (`mdz_list_entries`, `mdz_read_text`, `mdz_read_image`) only for follow-up detail checks.',
    '',
  ].join('\n');
}

function upsertMarkedBlock(existingText: string, markerName: string, blockBody: string): string {
  const startMarker = `<!-- ${markerName}:start -->`;
  const endMarker = `<!-- ${markerName}:end -->`;
  const wrappedBlock = `${startMarker}\n${blockBody.trim()}\n${endMarker}`;

  const escapedStart = escapeRegExp(startMarker);
  const escapedEnd = escapeRegExp(endMarker);
  const blockPattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`, 'm');

  if (!existingText.trim()) {
    return `${wrappedBlock}\n`;
  }

  if (blockPattern.test(existingText)) {
    return `${existingText.replace(blockPattern, wrappedBlock).replace(/\s*$/, '\n')}`;
  }

  const needsSeparator = existingText.endsWith('\n') ? '\n' : '\n\n';
  return `${existingText}${needsSeparator}${wrappedBlock}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function executeKnownCommand(commandId: string, ...args: unknown[]): Promise<boolean> {
  try {
    await vscode.commands.executeCommand(commandId, ...args);
    return true;
  } catch {
    return false;
  }
}

async function executeDiscoveredCommand(
  commands: readonly string[],
  candidateTermSets: readonly string[][]
): Promise<boolean> {
  for (const terms of candidateTermSets) {
    const commandId = findCommandId(commands, terms);
    if (!commandId) {
      continue;
    }

    if (await executeKnownCommand(commandId)) {
      return true;
    }
  }

  return false;
}

async function collectRelativeMarkdownImageAssets(
  sourceUri: vscode.Uri,
  markdown: string
): Promise<Array<{ archivePath: string; fileBytes: Uint8Array }>> {
  const sourceDir = path.dirname(sourceUri.fsPath);
  const assets = new Map<string, Uint8Array>();

  for (const imageTarget of extractMarkdownImageTargets(markdown)) {
    if (!isRelativeImageTarget(imageTarget)) {
      continue;
    }

    const localPath = imageTarget.replace(/\\/g, '/');
    const resolvedPath = path.resolve(sourceDir, localPath);
    const relativePath = path.relative(sourceDir, resolvedPath).replace(/\\/g, '/');

    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      continue;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(resolvedPath));
      assets.set(relativePath, bytes);
    } catch {
      // Skip missing files and continue converting the markdown.
    }
  }

  return [...assets.entries()].map(([archivePath, fileBytes]) => ({ archivePath, fileBytes }));
}

function extractMarkdownImageTargets(markdown: string): string[] {
  const targets = new Set<string>();
  const imagePattern = /!\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of markdown.matchAll(imagePattern)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget) {
      continue;
    }

    const angleBracketMatch = rawTarget.match(/^<(.+)>$/);
    const target = angleBracketMatch ? angleBracketMatch[1].trim() : rawTarget;
    if (target) {
      targets.add(target);
    }
  }

  return [...targets];
}

function isRelativeImageTarget(target: string): boolean {
  const normalisedTarget = target.replace(/\\/g, '/');

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalisedTarget)) {
    return false;
  }

  if (normalisedTarget.startsWith('//')) {
    return false;
  }

  if (normalisedTarget.startsWith('/')) {
    return false;
  }

  if (/^[a-zA-Z]:/.test(normalisedTarget)) {
    return false;
  }

  return true;
}
