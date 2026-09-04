import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import type { GitExtension } from './vendor/git';
import { MdzEditorProvider, getNonce, postToWebviewSafely } from './mdzEditorProvider';
import { MdzDiffPanel } from './mdzDiffPanel';
import { initLogging, logInfo, logError } from './mdzLog';
import { MdzArchiveCore } from '@mdzip/core-js';
import {
  agentsMdAsset,
  configureTemplateFolder,
  confirmOverwriteIfNeeded,
  createMdzFromTemplate,
  openTemplatesFolder,
  readFolderFiles,
  readmeMdAsset,
} from './mdzTemplates';
import {
  buildNewArchiveBytesWithTitle,
  openMdzArchive,
  readCanonicalMarkdown,
  suggestedTitleFromMarkdown,
  updateBinaryInArchive,
  isImagePath,
  MdzipWorkspaceService,
} from '@mdzip/editor';

const BUNDLED_MCP_SERVER_LABEL = 'MDZip MCP Server';
const BUNDLED_MCP_SERVER_KEY = 'MDZip';
const LEGACY_BUNDLED_MCP_SERVER_KEY = 'mdzip';
const MCP_LAUNCHER_FILENAME = 'mdzip-mcp-launcher.cjs';
const MDZIP_EXTENSION_PACKAGE_NAME = 'mdzip-project.mdzip-vscode';
const CONVERT_REMEMBERED_CHOICES_KEY = 'mdzip.convertToMdz.rememberedChoices.v1';
const CONVERT_AUTO_REMEMBER_KEY = 'mdzip.convertToMdz.autoRemember.v1';

/** Toggle-able options in `mdzip.convertMarkdownToMdz`'s checkbox picker, keyed by
 * their QuickPick item and (optionally) persisted as remembered defaults. `copyImages`
 * is deliberately excluded from the always-present defaults — it only applies, and is
 * only remembered, on runs where the source markdown actually has relative images. */
interface ConvertToMdzChoices {
  copyImages?: boolean;
  addAgentsGuide: boolean;
  addReadme: boolean;
  deleteOriginal: boolean;
  appendZipSuffix: boolean;
}

const CONVERT_TO_MDZ_HARDCODED_DEFAULTS: ConvertToMdzChoices = {
  copyImages: true,
  addAgentsGuide: true,
  addReadme: true,
  deleteOriginal: false,
  appendZipSuffix: false,
};

/** Whether a URI is an MDZip archive by name: `.mdz`, or `.mdz.zip` (the
 * "for recipients without MDZip support" naming from `mdzip.convertMarkdownToMdz`'s
 * checkbox picker). Shared by every command that gates on "is this file an .mdz",
 * so `.mdz.zip` behaves consistently with `.mdz` everywhere, not just in the
 * custom editor's own selector. */
function isMdzUri(uri: vscode.Uri): boolean {
  const lowerPath = uri.path.toLowerCase();
  return lowerPath.endsWith('.mdz') || lowerPath.endsWith('.mdz.zip');
}

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

/** Resolve a target .mdz for a command: explicit resource arg, else the active
 * .mdz tab, else a file picker. Shared by commands that act on "the" .mdz file
 * the user means, whether invoked from the explorer, editor title bar, or
 * command palette with nothing focused. */
async function resolveMdzFileForCommand(
  resource: unknown,
  pickerTitle: string
): Promise<vscode.Uri | undefined> {
  let fileUri = resourceUriFromCommandArg(resource);

  if (!fileUri) {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.isActive && tab.input instanceof vscode.TabInputCustom &&
            isMdzUri(tab.input.uri)) {
          fileUri = tab.input.uri;
          break;
        }
      }
      if (fileUri) { break; }
    }
  }

  if (!fileUri) {
    fileUri = await pickMdzFile(pickerTitle);
    if (!fileUri) { return undefined; }
  }

  if (!isMdzUri(fileUri)) {
    vscode.window.showWarningMessage('Select a .mdz file.');
    return undefined;
  }

  return fileUri;
}

/** Resolve a target folder for `mdzip.convertFolderToMdz`: an explicit resource
 * arg (Explorer context menu on a folder), else a folder picker (command palette). */
async function resolveFolderForCommand(resource: unknown): Promise<vscode.Uri | undefined> {
  const uri = resourceUriFromCommandArg(resource);
  if (uri) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.Directory) {
        return uri;
      }
    } catch {
      // Fall through to the picker below.
    }
  }

  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select Folder to Convert to .mdz',
  });
  return selected?.[0];
}

/** Whether this .mdz has unsaved edits in an open custom-editor tab. Custom
 * editor documents never appear in `vscode.workspace.textDocuments`, so dirty
 * state has to be read off the tab itself. */
function isMdzUriDirtyInTab(uri: vscode.Uri): boolean {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === uri.toString()) {
        return tab.isDirty;
      }
    }
  }
  return false;
}

async function getGitBaseBytes(fileUri: vscode.Uri): Promise<Buffer | undefined> {
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
    return undefined;
  }
}

function resourceUriFromCommandArg(resource?: unknown): vscode.Uri | undefined {
  if (Array.isArray(resource)) {
    return resourceUriFromCommandArg(resource[0]);
  }
  if (resource instanceof vscode.Uri) {
    return resource;
  }
  if (resource && typeof resource === 'object' && 'resourceUri' in resource) {
    const resourceUri = (resource as { resourceUri?: unknown }).resourceUri;
    if (resourceUri instanceof vscode.Uri) {
      return resourceUri;
    }
  }
  return undefined;
}

function originalUriFromCommandArg(resource: unknown, fallback: vscode.Uri): vscode.Uri {
  if (Array.isArray(resource)) {
    return originalUriFromCommandArg(resource[0], fallback);
  }
  if (resource && typeof resource === 'object' && 'originalUri' in resource) {
    const originalUri = (resource as { originalUri?: unknown }).originalUri;
    if (originalUri instanceof vscode.Uri) {
      return originalUri;
    }
  }
  return fallback;
}

async function resolveGitCompareTarget(
  resource: unknown
): Promise<{ fileUri: vscode.Uri; baseUri: vscode.Uri } | undefined> {
  let fileUri = resourceUriFromCommandArg(resource);

  if (!fileUri) {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputCustom &&
            isMdzUri(tab.input.uri)) {
          fileUri = tab.input.uri;
          break;
        }
      }
      if (fileUri) break;
    }
  }

  if (!fileUri) {
    fileUri = await pickMdzFile('Select .mdz file to compare with git base');
    if (!fileUri) return undefined;
  }

  if (!isMdzUri(fileUri)) {
    vscode.window.showWarningMessage('Select a .mdz file to compare with git base.');
    return undefined;
  }

  const isOpenInTab = vscode.window.tabGroups.all.some(g =>
    g.tabs.some(t =>
      (t.input instanceof vscode.TabInputText || t.input instanceof vscode.TabInputCustom) &&
      t.input.uri.toString() === fileUri!.toString()
    )
  );
  if (isOpenInTab) {
    const choice = await vscode.window.showWarningMessage(
      'Save file before comparing with git base?',
      'Save', 'Compare Anyway', 'Cancel'
    );
    if (choice === 'Cancel' || choice === undefined) return undefined;
    if (choice === 'Save') {
      const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === fileUri!.toString());
      if (doc) await doc.save();
      else await vscode.commands.executeCommand('workbench.action.files.saveFiles', [fileUri]);
    }
  }

  return {
    fileUri,
    baseUri: originalUriFromCommandArg(resource, fileUri),
  };
}

/** API exported by activate(). Consumed by integration tests via vscode.extensions.getExtension(...).exports. */
export interface MdzipTestApi {
  /** Returns true once the document for this URI has been opened by the custom editor provider. */
  hasDocument(uri: vscode.Uri): boolean;
  /**
   * Simulate what the workspaceChanged message handler does: store webview bytes,
   * mark dirty, and fire the dirty event. Bypasses the async webview message pipeline
   * so integration tests can verify the full VS Code save flow synchronously.
   */
  simulateWebviewChange(uri: vscode.Uri, bytes: Uint8Array): void;
  /** The user-profile mcp.json path `mdzip.enableUserMcp` writes to. For integration tests only. */
  getUserMcpConfigPath(): string;
  /**
   * Runs the same stale-.mcp.json repair check that normally fires on activation and on
   * workspace-folder changes. For integration tests only — driving it via a real folder-add
   * is unreliable in a test host (going from a single-folder window to multi-root also forces
   * a reload, same as the empty-to-first-folder case), so tests call this directly instead.
   */
  runClaudeMcpRepairCheck(): Promise<void>;
}

export function activate(context: vscode.ExtensionContext): MdzipTestApi {
  const version = context.extension.packageJSON.version;
  initLogging(context);
  logInfo(`Activating extension version ${version}`);

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
  void maybePromptAiToolMcpSetup(context);
  void maybeRepairClaudeMcpConfig(context);
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void maybeRepairClaudeMcpConfig(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.copyMcpConfigSnippet', async () => {
      const launcherConfig = await getGlobalLauncherMcpServerConfig(context);
      const snippet = JSON.stringify(
        {
          servers: {
            [BUNDLED_MCP_SERVER_KEY]: launcherConfig,
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

      const launcherConfig = await getWorkspaceLauncherMcpServerConfig(context);
      upsertBundledMcpServer(config.servers, launcherConfig);

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
      const launcherConfig = await getGlobalLauncherMcpServerConfig(context);
      const mcpConfigUri = getUserMcpConfigUri(context);

      try {
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
        upsertBundledMcpServer(config.servers, launcherConfig);

        await vscode.workspace.fs.createDirectory(parentUri(mcpConfigUri));
        await vscode.workspace.fs.writeFile(
          mcpConfigUri,
          new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`)
        );

        const document = await vscode.workspace.openTextDocument(mcpConfigUri);
        await vscode.window.showTextDocument(document);
        vscode.window.showInformationMessage('Enabled MDZip MCP server in user MCP configuration.');
      } catch (error) {
        logError('Failed to write user MCP configuration directly', error);
        await vscode.env.clipboard.writeText(
          JSON.stringify({ servers: { [BUNDLED_MCP_SERVER_KEY]: launcherConfig } }, null, 2)
        );
        vscode.window.showWarningMessage(
          'Could not write the user MCP configuration automatically. The MDZip MCP config snippet was copied to the clipboard instead.'
        );
      }
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
    vscode.commands.registerCommand('mdzip.newFile', async (resource?: unknown) => {
      await createMdzFromTemplate(context, resource);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.newFromTemplate', async (resource?: unknown) => {
      await createMdzFromTemplate(context, resource);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.configureTemplateFolder', async () => {
      await configureTemplateFolder();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.openTemplatesFolder', async () => {
      await openTemplatesFolder();
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
      const derivedTitle = suggestedTitleFromMarkdown(markdown, baseName);
      const relativeImageAssets = await collectRelativeMarkdownImageAssets(sourceUri, markdown);

      // A single checkbox-style multi-select instead of sequential modal prompts — VS Code's
      // MessageOptions (showInformationMessage/showWarningMessage, modal or not) has no
      // checkbox support (only `modal`/`detail`), but showQuickPick's canPickMany does, and
      // it collapses what would otherwise be several dialogs into one.
      const remembered = context.globalState.get<ConvertToMdzChoices>(CONVERT_REMEMBERED_CHOICES_KEY);
      const autoRemember = context.globalState.get<boolean>(CONVERT_AUTO_REMEMBER_KEY, false);
      const defaults: ConvertToMdzChoices = autoRemember
        ? { ...CONVERT_TO_MDZ_HARDCODED_DEFAULTS, ...remembered }
        : CONVERT_TO_MDZ_HARDCODED_DEFAULTS;

      type ConvertOptionKey = keyof ConvertToMdzChoices | 'rememberChoices';
      type ConvertOption = vscode.QuickPickItem & { key: ConvertOptionKey };
      const options: ConvertOption[] = [];
      if (relativeImageAssets.length > 0) {
        options.push({
          key: 'copyImages',
          label: `$(file-media) Copy ${relativeImageAssets.length} relative image reference${relativeImageAssets.length === 1 ? '' : 's'} into the archive`,
          picked: defaults.copyImages,
        });
      }
      options.push({
        key: 'addAgentsGuide',
        label: '$(robot) Add an AGENTS.md guide for AI coding agents',
        picked: defaults.addAgentsGuide,
      });
      options.push({
        key: 'addReadme',
        label: '$(book) Add a README.md for human readers',
        picked: defaults.addReadme,
      });
      options.push({
        key: 'deleteOriginal',
        label: '$(trash) Delete the original .md file after converting',
        picked: defaults.deleteOriginal,
      });
      options.push({
        key: 'appendZipSuffix',
        label: '$(file-zip) Name it "<file>.mdz.zip" (for recipients without MDZip support)',
        picked: defaults.appendZipSuffix,
      });
      options.push({
        key: 'rememberChoices',
        label: autoRemember
          ? '$(save) Remembering these choices as the default (uncheck to stop)'
          : '$(save) Remember these choices as the default from now on',
        picked: autoRemember,
      });

      const selected = await vscode.window.showQuickPick(options, {
        title: 'Convert to .mdz',
        placeHolder: 'Choose what to include, then press Enter (Esc cancels)',
        canPickMany: true,
      });
      if (!selected) {
        return; // Cancelled (Escape) — abort the whole conversion, don't write a partial .mdz.
      }

      const selectedKeys = new Set(selected.map((option) => option.key));
      const chosen: ConvertToMdzChoices = {
        addAgentsGuide: selectedKeys.has('addAgentsGuide'),
        addReadme: selectedKeys.has('addReadme'),
        deleteOriginal: selectedKeys.has('deleteOriginal'),
        appendZipSuffix: selectedKeys.has('appendZipSuffix'),
      };
      if (relativeImageAssets.length > 0) {
        chosen.copyImages = selectedKeys.has('copyImages');
      }

      const rememberChecked = selectedKeys.has('rememberChoices');
      if (rememberChecked) {
        // Checked (whether newly or still) — (re)save this run's picks as the remembered
        // defaults and (re)activate. Always visible and always reflects current state, so
        // there's nothing to hunt for later: checked = active, unchecking it is the "off" switch.
        await context.globalState.update(CONVERT_REMEMBERED_CHOICES_KEY, { ...remembered, ...chosen });
        await context.globalState.update(CONVERT_AUTO_REMEMBER_KEY, true);
      } else if (autoRemember) {
        // Was active, explicitly unchecked this run — turn it off. Leaves the previously
        // remembered values in storage (dormant, not deleted) in case it's turned back on.
        await context.globalState.update(CONVERT_AUTO_REMEMBER_KEY, false);
      }

      const buildAssets: { archivePath: string; fileBytes: Uint8Array }[] = [];
      if (chosen.copyImages) {
        buildAssets.push(...relativeImageAssets);
      }
      if (chosen.addAgentsGuide) {
        buildAssets.push(await agentsMdAsset(context));
      }
      if (chosen.addReadme) {
        buildAssets.push(await readmeMdAsset(context));
      }

      const targetExtension = chosen.appendZipSuffix ? '.mdz.zip' : '.mdz';
      const targetUri = sourceUri.with({ path: `${dirPath}/${baseName}${targetExtension}` });
      if (!(await confirmOverwriteIfNeeded(targetUri))) {
        return; // Target exists and the user declined to overwrite it — abort, nothing written.
      }

      const bytes = await buildNewArchiveBytesWithTitle(markdown, derivedTitle, buildAssets);
      await vscode.workspace.fs.writeFile(targetUri, bytes);

      if (chosen.deleteOriginal) {
        try {
          await vscode.workspace.fs.delete(sourceUri, { useTrash: true });
        } catch (error) {
          logError('Failed to delete original markdown after conversion', error);
          vscode.window.showWarningMessage(
            `Converted to ${path.posix.basename(targetUri.path)}, but could not delete the original ${path.posix.basename(sourceUri.path)}.`
          );
        }
      }

      MdzEditorProvider.markNextOpenInSplit(targetUri);
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
      logInfo('compareMarkdown command invoked');
      try {
        logInfo('Showing compare dialog');
        vscode.window.showInformationMessage('Starting MDZip markdown compare...');

        logInfo('Starting file selection');
        let rightUri = resource;
        if (!rightUri) {
          const activeUri = vscode.window.activeTextEditor?.document.uri;
          if (activeUri && isMdzUri(activeUri)) {
            rightUri = activeUri;
          }
        }

        if (!rightUri) {
          logInfo('Showing right file picker');
          rightUri = await pickMdzFile('Select working .mdz file');
          if (!rightUri) {
            logInfo('Right file cancelled');
            return;
          }
        }
        logInfo('Right file selected', rightUri.fsPath);

        logInfo('Showing left file picker');
        const leftUri = await pickMdzFile('Select base .mdz file to compare');
        if (!leftUri) {
          logInfo('Left file cancelled');
          return;
        }
        logInfo('Left file selected', leftUri.fsPath);

        logInfo('Reading archives');
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
        logError('Compare failed', err);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.enableCodexMcp', async () => {
      const launcherConfig = await getGlobalLauncherMcpServerConfig(context);
      const target = await vscode.window.showQuickPick(
        [
          {
            label: 'User Config',
            description: '~/.codex/config.toml',
          },
          {
            label: 'Workspace Config',
            description: '.codex/config.toml',
          },
        ],
        {
          title: 'Enable MDZip MCP Server for Codex',
          placeHolder: 'Choose where to write Codex MCP configuration',
        }
      );

      if (!target) {
        return;
      }

      if (!(await canUseNodeCommand())) {
        const choice = await vscode.window.showWarningMessage(
          'Codex will need "node" on PATH to start the bundled MDZip MCP server.',
          'Continue',
          'Cancel'
        );
        if (choice !== 'Continue') {
          return;
        }
      }

      const isWorkspaceTarget = target.label === 'Workspace Config';
      const configUri = isWorkspaceTarget ? getWorkspaceCodexConfigUri() : getUserCodexConfigUri();
      if (!configUri) {
        vscode.window.showWarningMessage('Open a workspace folder to enable workspace Codex MCP configuration.');
        return;
      }

      let existingText = '';
      try {
        const existing = await vscode.workspace.fs.readFile(configUri);
        existingText = new TextDecoder('utf-8').decode(existing);
      } catch {
        // Missing config is expected on first run.
      }

      const nextText = upsertCodexMcpServerConfig(existingText, BUNDLED_MCP_SERVER_KEY, launcherConfig);
      await vscode.workspace.fs.createDirectory(parentUri(configUri));
      await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(nextText));

      const document = await vscode.workspace.openTextDocument(configUri);
      await vscode.window.showTextDocument(document);

      const trustNote = isWorkspaceTarget
        ? ' Codex will load this project config only when the workspace is trusted.'
        : '';
      vscode.window.showInformationMessage(
        `Enabled MDZip MCP server for Codex. Restart Codex or open a new Codex session for the server to become available.${trustNote}`
      );
      await context.globalState.update('mdzip.aiToolMcpSetupPrompt.state.v1', 'enabled');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.enableClaudeMcp', async () => {
      const configUri = getWorkspaceClaudeMcpConfigUri();
      if (!configUri) {
        vscode.window.showWarningMessage('Open a workspace folder to enable the MDZip MCP server for Claude Code.');
        return;
      }

      const launcherConfig = await getGlobalLauncherMcpServerConfig(context);

      let config: { mcpServers?: Record<string, unknown> } = {};
      try {
        const existing = await vscode.workspace.fs.readFile(configUri);
        config = JSON.parse(new TextDecoder('utf-8').decode(existing));
      } catch {
        // Missing file is expected on first run.
      }
      if (!config || typeof config !== 'object') {
        config = {};
      }
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        config.mcpServers = {};
      }
      upsertBundledMcpServer(config.mcpServers, launcherConfig);

      await vscode.workspace.fs.writeFile(
        configUri,
        new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`)
      );

      const document = await vscode.workspace.openTextDocument(configUri);
      await vscode.window.showTextDocument(document);
      vscode.window.showInformationMessage(
        'Enabled MDZip MCP server for Claude Code in .mcp.json. Restart Claude Code or start a new session for the server to become available.'
      );
      await context.globalState.update('mdzip.aiToolMcpSetupPrompt.state.v1', 'enabled');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.copyClaudeMcpConfigSnippet', async () => {
      const launcherConfig = await getGlobalLauncherMcpServerConfig(context);
      const snippet = JSON.stringify(
        {
          mcpServers: {
            [BUNDLED_MCP_SERVER_KEY]: launcherConfig,
          },
        },
        null,
        2
      );

      await vscode.env.clipboard.writeText(snippet);
      vscode.window.showInformationMessage('Copied MDZip MCP server config snippet (Claude Code mcpServers format) to clipboard.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.compareWithGitBase', async (resource?: unknown) => {
      logInfo('compareWithGitBase command invoked');
      try {
        const target = await resolveGitCompareTarget(resource);
        if (!target) {
          logInfo('compareWithGitBase command cancelled before target resolution');
          return;
        }
        logInfo('compareWithGitBase target resolved', target.fileUri.fsPath);

        const gitBytes = await getGitBaseBytes(target.baseUri);
        if (!gitBytes) {
          throw new Error(`File has no git history: ${path.basename(target.fileUri.fsPath)}`);
        }
        logInfo('compareWithGitBase git base loaded', { bytes: gitBytes.length });
        const baseKey = Date.now().toString(36) + 'base';
        MdzMarkdownFsProvider.cache.set(baseKey, new Uint8Array(gitBytes));

        const workingKey = Date.now().toString(36) + 'work';
        const baseName = path.basename(target.fileUri.fsPath || target.fileUri.path);
        const baseVirtualUri = vscode.Uri.parse(`mdzip-markdown:///${baseKey}/${target.baseUri.fsPath}`);
        const workVirtualUri = vscode.Uri.parse(`mdzip-markdown:///${workingKey}/${target.fileUri.fsPath}`);
        const title = `${baseName}: HEAD to Working (Markdown)`;

        await vscode.commands.executeCommand('vscode.diff', baseVirtualUri, workVirtualUri, title, {
          preview: true
        });
        logInfo('compareWithGitBase diff opened', title);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Git compare failed: ${msg}`);
        logError('Git compare failed', err);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.compareArchiveWithGitBase', async (resource?: unknown) => {
      logInfo('compareArchiveWithGitBase command invoked');
      try {
        const target = await resolveGitCompareTarget(resource);
        if (!target) {
          logInfo('compareArchiveWithGitBase command cancelled before target resolution');
          return;
        }
        logInfo('compareArchiveWithGitBase target resolved', target.fileUri.fsPath);

        const [gitBytes, workingBytes] = await Promise.all([
          getGitBaseBytes(target.baseUri),
          vscode.workspace.fs.readFile(target.fileUri).then(
            bytes => bytes,
            () => undefined
          ),
        ]);

        if (!gitBytes && !workingBytes) {
          throw new Error(`No git base or working-copy bytes are available for ${path.basename(target.fileUri.fsPath)}`);
        }
        logInfo('compareArchiveWithGitBase archive bytes loaded', {
          gitBytes: gitBytes?.length ?? 0,
          workingBytes: workingBytes?.length ?? 0,
        });

        const baseName = path.basename(target.fileUri.fsPath || target.fileUri.path);
        await MdzDiffPanel.open({
          title: `${baseName}: Archive Contents`,
          resourceUri: target.fileUri,
          before: {
            label: 'HEAD',
            uri: target.baseUri,
            bytes: gitBytes ? new Uint8Array(gitBytes) : undefined,
            loadBytes: async () => {
              const bytes = await getGitBaseBytes(target.fileUri);
              return bytes ? new Uint8Array(bytes) : undefined;
            },
            missingMessage: 'This file has no readable HEAD version. It may be new, untracked, or renamed from a path without history.',
          },
          after: {
            label: 'Working Tree',
            uri: target.fileUri,
            bytes: workingBytes,
            loadBytes: async () => {
              try {
                return await vscode.workspace.fs.readFile(target.fileUri);
              } catch {
                return undefined;
              }
            },
            missingMessage: 'The working-copy file is not readable. It may have been deleted.',
          },
        }, context.extensionUri);
        logInfo('compareArchiveWithGitBase panel opened', baseName);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Archive compare failed: ${msg}`);
        logError('Archive compare failed', err);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.extractToFolder', async (resource?: unknown) => {
      const fileUri = await resolveMdzFileForCommand(resource, 'Select .mdz file to extract');
      if (!fileUri) { return; }

      const baseName = path.posix.basename(fileUri.path, '.mdz');
      const dirPath = path.posix.dirname(fileUri.path);
      const folderUri = fileUri.with({ path: `${dirPath}/${baseName}_tmp` });

      try {
        await vscode.workspace.fs.stat(folderUri);
        // Folder exists — ask before overwriting.
        const overwriteLabel = 'Extract Anyway';
        const selection = await vscode.window.showWarningMessage(
          `Folder "${baseName}_tmp" already exists. Extract and overwrite existing files?`,
          { modal: true },
          overwriteLabel
        );
        if (selection !== overwriteLabel) { return; }
      } catch {
        // Folder does not exist — proceed.
      }

      const mdzBytes = await vscode.workspace.fs.readFile(fileUri);
      const service = await MdzipWorkspaceService.open(mdzBytes, {
        sourceFormat: 'mdz',
        fileName: fileUri.path,
      });

      const { paths } = service.content;
      await vscode.workspace.fs.createDirectory(folderUri);

      let extracted = 0;
      for (const entry of paths) {
        const entryBytes = await service.readPathBytes(entry.path);
        if (!entryBytes) { continue; }

        const segments = entry.path.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean);
        if (segments.length === 0) { continue; }
        if (segments.length > 1) {
          await vscode.workspace.fs.createDirectory(
            vscode.Uri.joinPath(folderUri, ...segments.slice(0, -1))
          );
        }
        await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folderUri, ...segments), entryBytes);
        extracted++;
      }

      await vscode.commands.executeCommand('revealInExplorer', folderUri);
      vscode.window.showInformationMessage(
        `Extracted ${extracted} file${extracted === 1 ? '' : 's'} to ${baseName}_tmp/`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.convertFolderToMdz', async (resource?: unknown) => {
      const folderUri = await resolveFolderForCommand(resource);
      if (!folderUri) { return; }

      const collected = await readFolderFiles(folderUri);
      if (collected.length === 0) {
        vscode.window.showWarningMessage('The selected folder has no files to pack.');
        return;
      }

      const folderName = path.posix.basename(folderUri.path) || 'archive';
      // The Document/Project mode + entry-point decision (only shown when the
      // folder has more than one .md file) is @mdzip/editor's own built-in
      // dialog — packFilesAsWorkspace lives on the webview side, so it's run
      // in a throwaway panel rather than reimplemented as a native QuickPick,
      // per mdzip-editor#34's whole point: don't build this UI twice.
      const packed = await runPackFilesDialog(
        context,
        collected.map((file) => ({ path: file.relativePath, bytes: file.bytes })),
        { title: folderName, fileName: `${folderName}.mdz` }
      );
      if (!packed) {
        return; // Cancelled in the built-in dialog — nothing written.
      }

      const targetUri = vscode.Uri.joinPath(parentUri(folderUri), `${folderName}.mdz`);
      if (!(await confirmOverwriteIfNeeded(targetUri))) {
        return;
      }

      await vscode.workspace.fs.writeFile(targetUri, packed.archiveBytes);
      MdzEditorProvider.markNextOpenInSplit(targetUri);
      await vscode.commands.executeCommand('vscode.openWith', targetUri, 'mdzip.mdzEditor');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mdzip.addAgentsGuide', async (resource?: unknown) => {
      const fileUri = await resolveMdzFileForCommand(resource, 'Select .mdz file to add AGENTS.md to');
      if (!fileUri) { return; }

      if (isMdzUriDirtyInTab(fileUri)) {
        const saveLabel = 'Save and Continue';
        const selection = await vscode.window.showWarningMessage(
          `${path.posix.basename(fileUri.path)} has unsaved changes. Save before adding AGENTS.md?`,
          { modal: true },
          saveLabel
        );
        if (selection !== saveLabel) { return; }
        await vscode.commands.executeCommand('workbench.action.files.saveFiles', [fileUri]);
      }

      const bytes = await vscode.workspace.fs.readFile(fileUri);
      const archive = await openMdzArchive(bytes);
      const alreadyHasGuide = archive.paths.some((entry) => entry.path.toLowerCase() === 'agents.md');

      if (alreadyHasGuide) {
        const replaceLabel = 'Replace';
        const selection = await vscode.window.showWarningMessage(
          `${path.posix.basename(fileUri.path)} already has an AGENTS.md. Replace it with the current version?`,
          { modal: true },
          replaceLabel
        );
        if (selection !== replaceLabel) { return; }
      }

      const asset = await agentsMdAsset(context);
      const nextBytes = await updateBinaryInArchive(bytes, asset.archivePath, asset.fileBytes);
      await vscode.workspace.fs.writeFile(fileUri, nextBytes);

      vscode.window.showInformationMessage(
        `${alreadyHasGuide ? 'Replaced' : 'Added'} AGENTS.md in ${path.posix.basename(fileUri.path)}.`
      );
    })
  );

  return {
    hasDocument(uri) { return MdzEditorProvider.hasDocumentForUri(uri); },
    simulateWebviewChange(uri, bytes) { MdzEditorProvider.simulateWebviewChange(uri, bytes); },
    getUserMcpConfigPath() { return getUserMcpConfigUri(context).fsPath; },
    runClaudeMcpRepairCheck() { return maybeRepairClaudeMcpConfig(context); },
  };
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

export function deactivate(): void {
  // nothing to do
}

async function maybePromptAiToolMcpSetup(context: vscode.ExtensionContext): Promise<void> {
  const key = 'mdzip.aiToolMcpSetupPrompt.state.v1';
  const state = context.globalState.get<string>(key);
  if (state === 'enabled' || state === 'dismissed') {
    return;
  }

  const enableLabel = 'Enable';
  const notNowLabel = 'Not Now';
  const dontAskLabel = "Don't Ask Again";
  const selection = await vscode.window.showInformationMessage(
    'Enable the MDZip MCP server so AI tools can inspect .mdz files directly?',
    enableLabel,
    notNowLabel,
    dontAskLabel
  );

  if (selection === dontAskLabel) {
    await context.globalState.update(key, 'dismissed');
    return;
  }

  if (selection !== enableLabel) {
    return;
  }

  const target = await vscode.window.showQuickPick(
    [
      {
        label: 'Codex',
        description: 'Write ~/.codex/config.toml or workspace .codex/config.toml',
      },
      {
        label: 'Claude Code',
        description: 'Write project .mcp.json (mcpServers)',
      },
      {
        label: 'VS Code / Copilot',
        description: 'Use VS Code MCP server status or mcp.json setup',
      },
    ],
    {
      title: 'Enable MDZip MCP Server',
      placeHolder: 'Choose an AI tool',
    }
  );

  if (!target) {
    return;
  }

  if (target.label === 'Codex') {
    await vscode.commands.executeCommand('mdzip.enableCodexMcp');
    return;
  }

  if (target.label === 'Claude Code') {
    await vscode.commands.executeCommand('mdzip.enableClaudeMcp');
    return;
  }

  const openStatusLabel = 'Open MCP Status';
  const workspaceLabel = 'Write Workspace mcp.json';
  const userLabel = 'Write User MCP Config';
  const vscodeSelection = await vscode.window.showQuickPick(
    [
      {
        label: openStatusLabel,
        description: 'Inspect the bundled VS Code MCP server',
      },
      {
        label: workspaceLabel,
        description: 'Create or update .vscode/mcp.json',
      },
      {
        label: userLabel,
        description: 'Open or update user MCP configuration',
      },
    ],
    {
      title: 'Enable MDZip MCP Server for VS Code / Copilot',
      placeHolder: 'Choose a VS Code MCP setup action',
    }
  );

  if (vscodeSelection?.label === openStatusLabel) {
    await vscode.commands.executeCommand('mdzip.openMcpServerStatus');
  } else if (vscodeSelection?.label === workspaceLabel) {
    await vscode.commands.executeCommand('mdzip.enableWorkspaceMcp');
  } else if (vscodeSelection?.label === userLabel) {
    await vscode.commands.executeCommand('mdzip.enableUserMcp');
  } else {
    return;
  }
  await context.globalState.update(key, 'enabled');
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

function findCommandId(commands: readonly string[], terms: string[]): string | undefined {
  const loweredTerms = terms.map((term) => term.toLowerCase());
  return commands.find((command) => {
    const lower = command.toLowerCase();
    return loweredTerms.every((term) => lower.includes(term));
  });
}

function upsertBundledMcpServer(
  servers: Record<string, unknown>,
  serverConfig: { type: 'stdio'; command: string; args: string[] }
): void {
  delete servers[LEGACY_BUNDLED_MCP_SERVER_KEY];
  servers[BUNDLED_MCP_SERVER_KEY] = serverConfig;
}

/**
 * The user-profile mcp.json lives alongside settings.json at `<UserDataDir>/User/mcp.json`.
 * `context.globalStorageUri` is `<UserDataDir>/User/globalStorage/<extension-id>/`, so its
 * grandparent is `<UserDataDir>/User/` — this derives the path from the running environment
 * instead of hardcoding OS-specific locations, so it works for stable/Insiders/remote/portable.
 */
function getUserMcpConfigUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, '..', '..', 'mcp.json');
}

function getUserCodexConfigUri(): vscode.Uri {
  return vscode.Uri.file(path.join(os.homedir(), '.codex', 'config.toml'));
}

function getWorkspaceCodexConfigUri(): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, '.codex', 'config.toml');
}

/**
 * Claude Code reads project-scoped MCP servers from `.mcp.json` at the workspace root,
 * under an `mcpServers` key (not VS Code's `servers`, and not `.vscode/`).
 */
function getWorkspaceClaudeMcpConfigUri(): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, '.mcp.json');
}

/**
 * Detects and repairs a workspace `.mcp.json` whose `MDZip`/`mdzip` entry was hand-written
 * (or written by an older build) pointing at a specific installed extension version's `dist/`
 * folder — that path is orphaned by every extension update. Only touches the file when the
 * referenced path genuinely no longer resolves; a working config (launcher-based or otherwise)
 * is left untouched.
 */
async function maybeRepairClaudeMcpConfig(context: vscode.ExtensionContext): Promise<void> {
  const configUri = getWorkspaceClaudeMcpConfigUri();
  if (!configUri) {
    return;
  }

  let existingText: string;
  try {
    const existing = await vscode.workspace.fs.readFile(configUri);
    existingText = new TextDecoder('utf-8').decode(existing);
  } catch {
    return; // No .mcp.json — nothing to repair.
  }

  let config: { mcpServers?: Record<string, { args?: unknown[] }> };
  try {
    config = JSON.parse(existingText);
  } catch {
    return; // Malformed JSON — don't touch it.
  }

  const entry = config?.mcpServers?.[BUNDLED_MCP_SERVER_KEY] ?? config?.mcpServers?.[LEGACY_BUNDLED_MCP_SERVER_KEY];
  const entryPath = Array.isArray(entry?.args) ? entry.args[0] : undefined;
  // Real installed extension folders are named `<publisher>.<name>-<version>`, e.g.
  // `mdzip-project.mdzip-vscode-1.3.42` — build the pattern from the actual package name
  // rather than hardcoding a fragment of it.
  const escapedPackageName = MDZIP_EXTENSION_PACKAGE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const versionedPathPattern = new RegExp(`[\\\\/]${escapedPackageName}-[^\\\\/]+[\\\\/]`);
  if (typeof entryPath !== 'string' || !versionedPathPattern.test(entryPath)) {
    return; // Not a version-pinned extension path — either already the launcher, or unrelated.
  }

  try {
    await fs.access(entryPath);
    return; // Still resolves — not actually broken, leave it alone.
  } catch {
    // Falls through — the referenced version's dist/ is gone, repair it below.
  }

  const launcherConfig = await getGlobalLauncherMcpServerConfig(context);
  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    config.mcpServers = {};
  }
  upsertBundledMcpServer(config.mcpServers, launcherConfig);
  await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`));
  logInfo('Repaired stale version-pinned MDZip entry in .mcp.json', entryPath);
  vscode.window.showInformationMessage(
    'Repaired the MDZip MCP server entry in .mcp.json — it pointed at a since-removed extension version, now uses a version-independent launcher.'
  );
}

function parentUri(uri: vscode.Uri): vscode.Uri {
  if (uri.scheme === 'file') {
    return vscode.Uri.file(path.dirname(uri.fsPath));
  }
  return uri.with({ path: path.posix.dirname(uri.path) });
}

async function getGlobalLauncherMcpServerConfig(context: vscode.ExtensionContext): Promise<{ type: 'stdio'; command: string; args: string[] }> {
  const launcherUri = vscode.Uri.joinPath(context.globalStorageUri, MCP_LAUNCHER_FILENAME);
  await ensureMcpLauncherScript(launcherUri);
  return {
    type: 'stdio',
    command: 'node',
    args: [launcherUri.fsPath],
  };
}

async function getWorkspaceLauncherMcpServerConfig(context: vscode.ExtensionContext): Promise<{ type: 'stdio'; command: string; args: string[] }> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('Open a workspace folder to enable workspace MCP configuration.');
  }

  const launcherUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', MCP_LAUNCHER_FILENAME);
  await ensureMcpLauncherScript(launcherUri);
  return {
    type: 'stdio',
    command: 'node',
    args: [launcherUri.fsPath],
  };
}

async function ensureMcpLauncherScript(launcherUri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(parentUri(launcherUri));
  const existing = await readTextFile(launcherUri);
  const next = buildMcpLauncherScript();
  if (existing === next) {
    return;
  }
  await vscode.workspace.fs.writeFile(launcherUri, new TextEncoder().encode(next));
}

function buildMcpLauncherScript(): string {
  return [
    '#!/usr/bin/env node',
    "'use strict';",
    '',
    "const fs = require('fs');",
    "const path = require('path');",
    "const os = require('os');",
    "const { spawn } = require('child_process');",
    '',
    `const EXTENSION_PACKAGE_NAME = ${JSON.stringify(MDZIP_EXTENSION_PACKAGE_NAME)};`,
    'const CANDIDATE_ROOTS = [',
    "  path.join(os.homedir(), '.vscode', 'extensions'),",
    "  path.join(os.homedir(), '.vscode-insiders', 'extensions'),",
    "  path.join(os.homedir(), '.vscode-server', 'extensions'),",
    "  path.join(os.homedir(), '.vscode-server-insiders', 'extensions'),",
    '];',
    '',
    'function parseVersion(version) {',
    "  return version.split(/[.-]/).map((segment) => (segment === '' ? 0 : Number(segment)));",
    '}',
    '',
    'function compareVersions(left, right) {',
    '  const maxLength = Math.max(left.length, right.length);',
    '  for (let index = 0; index < maxLength; index += 1) {',
    '    const leftPart = left[index] ?? 0;',
    '    const rightPart = right[index] ?? 0;',
    '    if (leftPart === rightPart) {',
    '      continue;',
    '    }',
    '    if (Number.isNaN(leftPart) || Number.isNaN(rightPart)) {',
    '      return String(leftPart).localeCompare(String(rightPart));',
    '    }',
    '    return leftPart - rightPart;',
    '  }',
    '  return 0;',
    '}',
    '',
    'function findInstalledExtensionRoot() {',
    '  let bestMatch = null;',
    '  for (const root of CANDIDATE_ROOTS) {',
    '    let entries = [];',
    '    try {',
    "      entries = fs.readdirSync(root, { withFileTypes: true });",
    '    } catch {',
    '      continue;',
    '    }',
    '',
    '    for (const entry of entries) {',
    '      if (!entry.isDirectory()) {',
    '        continue;',
    '      }',
    '      if (!entry.name.startsWith(`${EXTENSION_PACKAGE_NAME}-`)) {',
    '        continue;',
    '      }',
    '      const version = entry.name.slice(EXTENSION_PACKAGE_NAME.length + 1);',
    '      const candidateRoot = path.join(root, entry.name);',
    "      const serverPath = path.join(candidateRoot, 'dist', 'mdz-mcp-server.js');",
    '      if (!fs.existsSync(serverPath)) {',
    '        continue;',
    '      }',
    '      if (!bestMatch) {',
    '        bestMatch = { candidateRoot, version };',
    '        continue;',
    '      }',
    '      const comparison = compareVersions(parseVersion(version), parseVersion(bestMatch.version));',
    '      if (comparison > 0) {',
    '        bestMatch = { candidateRoot, version };',
    '      }',
    '    }',
    '  }',
    '  return bestMatch?.candidateRoot ?? null;',
    '}',
    '',
    'const extensionRoot = findInstalledExtensionRoot();',
    'if (!extensionRoot) {',
    "  console.error('Unable to locate an installed MDZip VS Code extension.');",
    '  process.exit(1);',
    '}',
    '',
    "const serverPath = path.join(extensionRoot, 'dist', 'mdz-mcp-server.js');",
    'const child = spawn(process.execPath, [serverPath, ...process.argv.slice(2)], {',
    "  stdio: 'inherit',",
    '  env: process.env,',
    '});',
    '',
    "child.on('error', (error) => {",
    "  console.error(`Failed to start MDZip MCP server: ${error instanceof Error ? error.message : String(error)}`);",
    '  process.exit(1);',
    '});',
    '',
    "child.on('exit', (code, signal) => {",
    '  if (signal) {',
    '    process.kill(process.pid, signal);',
    '    return;',
    '  }',
    '  process.exit(code ?? 0);',
    '});',
    '',
  ].join('\n');
}

async function readTextFile(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return undefined;
  }
}

async function canUseNodeCommand(): Promise<boolean> {
  return new Promise(resolve => {
    execFile('node', ['--version'], { windowsHide: true }, error => {
      resolve(!error);
    });
  });
}

function upsertCodexMcpServerConfig(
  existingText: string,
  serverName: string,
  serverConfig: { command: string; args: readonly string[] }
): string {
  const withoutExistingServer = removeCodexMcpServerTables(existingText, serverName).replace(/\s*$/, '');
  const nextBlock = [
    `[mcp_servers.${serverName}]`,
    `command = ${tomlString(serverConfig.command)}`,
    `args = [${serverConfig.args.map(tomlString).join(', ')}]`,
  ].join('\n');

  if (!withoutExistingServer) {
    return `${nextBlock}\n`;
  }
  return `${withoutExistingServer}\n\n${nextBlock}\n`;
}

function removeCodexMcpServerTables(existingText: string, serverName: string): string {
  const lines = existingText.split(/\r?\n/);
  const newline = existingText.includes('\r\n') ? '\r\n' : '\n';
  const target = `mcp_servers.${serverName}`;
  const keptLines: string[] = [];
  let removing = false;

  for (const line of lines) {
    const tableName = tomlTableName(line);
    if (tableName) {
      removing = tableName === target || tableName.startsWith(`${target}.`);
    }

    if (!removing) {
      keptLines.push(line);
    }
  }

  return keptLines.join(newline);
}

function tomlTableName(line: string): string | undefined {
  const match = line.match(/^\s*\[([^\[\]]+)\]\s*(?:#.*)?$/);
  return match?.[1].trim();
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function buildWorkspaceAgentInstructionsBlock(): string {
  return [
    '## Working with `.mdz` Files',
    '',
    'This workspace may contain `.mdz` files — MDZip archives: ZIP-based containers that package a Markdown document, its assets, and optional metadata into one portable file.',
    '',
    'Before reading or editing a `.mdz`, actively check whether an MDZip MCP server is already available among your tools (for example, tool names beginning `mdz_`, or `upsert_canonical_document`). Do not assume one is unavailable just because it was not mentioned — check first. If one is available, skip to "MDZip MCP Review Guidance" below.',
    '',
    'If no MDZip MCP server is available:',
    '',
    '- Ask the user to run `MDZip: Enable Workspace MCP Server` or `MDZip: Enable User MCP Server` (from the MDZip VS Code extension) to make one available, or `MDZip: Copy MCP Server Config Snippet` for a manual/remote setup.',
    '- If the MDZip extension is not installed, ask the user to install it — or, as an immediate fallback, read the archive directly: `.mdz` is a standard ZIP file, so any unzip tool can extract it.',
    '- To find a `.mdz`\'s entry point without a manifest reader: check `manifest.json`\'s `entryPoint` field first; otherwise look for `index.md` in the archive root; otherwise, if there is exactly one Markdown file in the archive root, use that. Ignore support files (`AGENTS.md`, `README.md`, `LICENSE.md`, `CHANGELOG.md`) when guessing.',
    '- Reading this way (manual ZIP inspection) is fine — it is non-destructive. Writing this way is not: a write performed outside MDZip-aware tooling has no way to detect a conflicting edit made elsewhere (e.g. in an open MDZip editor) and can silently discard it. Ask the user how they would like to proceed before writing to a `.mdz` without MCP or extension support.',
    '',
    '## MDZip MCP Review Guidance',
    '',
    'When reviewing, summarizing, or editing `.mdz` files with an MDZip MCP server available:',
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

    if (!isImagePath(imageTarget)) {
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

// MdzArchiveCore.extractImageReferences is the one canonical scan for both
// markdown ![]() syntax and raw HTML <img src> tags — this used to keep its
// own ![]()-only copy of the same regex, missing images embedded via raw
// <img> tags (used for sizing/alignment control markdown can't express).
function extractMarkdownImageTargets(markdown: string): string[] {
  return [...new Set(MdzArchiveCore.extractImageReferences(markdown))];
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

/** Result of a completed pack-files dialog — matches @mdzip/editor's
 * MdzipPackFilesResult, with archiveBytes decoded back from the wire. */
interface PackFilesDialogResult {
  mode: 'document' | 'project';
  entryPoint: string;
  archiveBytes: Uint8Array;
  opened: boolean;
}

/**
 * Runs the folder→.mdz Document/Project mode + entry-point decision — @mdzip/editor's
 * own built-in dialog (`packFilesAsWorkspace`), which lives on the webview side, not
 * something this extension reimplements as a native QuickPick (see mdzip-editor#34:
 * the whole point of that shared API was for hosts *not* to build this UI twice).
 * Opens a throwaway webview panel purely as a UI surface for that one decision — never
 * a real document (no CustomEditorProvider, no save/dirty tracking) — collects the
 * result, and disposes the panel. Resolves `null` if the user cancels the dialog.
 */
async function runPackFilesDialog(
  context: vscode.ExtensionContext,
  files: readonly { path: string; bytes: Uint8Array }[],
  options: { title: string; fileName: string }
): Promise<PackFilesDialogResult | null> {
  const panel = vscode.window.createWebviewPanel(
    'mdzip.packFilesDialog',
    `Convert "${options.title}" to .mdz`,
    vscode.ViewColumn.Active,
    // true, not the usual false: this is a short-lived one-shot dialog session, not a
    // real document — if the user switches tabs mid-decision, `retainContextWhenHidden:
    // false` would tear down its page state, and the extension host's one-shot 'ready'
    // guard would then never resend `packFiles` to the reloaded page, stranding the
    // promise. Keeping context alive costs a little memory for a panel that's disposed
    // within seconds either way.
    { enableScripts: true, retainContextWhenHidden: true }
  );

  try {
    panel.webview.html = buildPackFilesWebviewHtml(context, panel.webview);

    return await new Promise<PackFilesDialogResult | null>((resolve) => {
      let settled = false;
      let sentFiles = false;
      const finish = (value: PackFilesDialogResult | null) => {
        if (settled) { return; }
        settled = true;
        resolve(value);
      };

      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (!message || typeof message !== 'object') { return; }
        const type = (message as { type?: unknown }).type;

        if (type === 'ready') {
          // The webview re-pings 'ready' every 250ms until it recognizes a message
          // (see postReadyUntilOpened in webviewEditor.ts) — only act on the first.
          if (sentFiles) { return; }
          sentFiles = true;
          void postToWebviewSafely(panel, {
            type: 'packFiles',
            files: files.map((file) => ({ path: file.path, bytesBase64: bytesToBase64(file.bytes) })),
            title: options.title,
            fileName: options.fileName,
          });
          return;
        }

        if (type === 'packFilesResult') {
          const payload = message as {
            result?: { mode: 'document' | 'project'; entryPoint: string; archiveBytesBase64: string; opened: boolean } | null;
            errorMessage?: string;
          };
          if (payload.errorMessage) {
            logError('packFilesAsWorkspace failed in webview', payload.errorMessage);
            vscode.window.showErrorMessage(`Could not convert the folder to .mdz: ${payload.errorMessage}`);
            finish(null);
            return;
          }
          finish(payload.result
            ? {
                mode: payload.result.mode,
                entryPoint: payload.result.entryPoint,
                archiveBytes: base64ToBytes(payload.result.archiveBytesBase64),
                opened: payload.result.opened,
              }
            : null);
        }
      });

      panel.onDidDispose(() => finish(null));
    });
  } finally {
    panel.dispose();
  }
}

function buildPackFilesWebviewHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
  const mediaDir = path.join(context.extensionPath, 'media');
  const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaDir, 'editor.bundle.js')));
  const nonce = getNonce();

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src data: blob: ${webview.cspSource};
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convert Folder to .mdz</title>
  <style>
    html, body { height: 100%; margin: 0; }
    body { position: relative; background: var(--vscode-editor-background, #1e1e1e); }
  </style>
</head>
<body>
  <main id="mdzip-editor-root"></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}
