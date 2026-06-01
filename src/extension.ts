import * as vscode from 'vscode';
import * as path from 'path';
import { MdzEditorProvider } from './mdzEditorProvider';
import { fileBaseNameFromPath, suggestedTitleFromMarkdown } from './shared/editorMetadata';

export function activate(context: vscode.ExtensionContext): void {
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
            'MDZip Bundled MCP Server',
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
            mdzip: bundledServerConfig,
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

      config.servers.mdzip = bundledServerConfig;

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
          JSON.stringify({ servers: { mdzip: bundledServerConfig } }, null, 2)
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
      const { buildNewArchiveWithTitle } = await import('./mdzArchiveUtils');
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

      const { buildNewArchiveBytesWithTitle } = await import('./mdzArchiveUtils');
      const bytes = await buildNewArchiveBytesWithTitle(markdown, derivedTitle, buildAssets);
      await vscode.workspace.fs.writeFile(targetUri, bytes);

      MdzEditorProvider.markNextOpenInEdit(targetUri);
      await vscode.commands.executeCommand('vscode.openWith', targetUri, 'mdzip.mdzEditor');
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
  parsed.servers.mdzip = serverConfig;
  return JSON.stringify(parsed, null, 2);
}

function buildWorkspaceAgentInstructionsBlock(): string {
  return [
    '## MDZip MCP Review Guidance',
    '',
    'When reviewing, summarizing, or analyzing `.mdz` files:',
    '',
    '1. Call `mdz_review_document` first with the `.mdz` `archivePath`.',
    '2. Use the returned markdown text and MCP image payloads together in the same analysis.',
    '3. Do not extract archive entries to disk unless the user explicitly asks for extraction.',
    '4. Use lower-level tools (`mdz_list_entries`, `mdz_read_text`, `mdz_read_image`) only for follow-up detail checks.',
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
