import * as path from 'path';
import * as vscode from 'vscode';
import {
  buildNewArchiveBytesWithTitle,
  fileBaseNameFromPath,
  openMdzArchive,
  suggestedTitleFromMarkdown,
  updateBinaryInArchive,
  updateManifestTitleInArchive,
  updateMarkdownInArchive,
  type NewArchiveAsset,
} from '@mdzip/editor';
import { MdzEditorProvider } from './mdzEditorProvider';

type TemplateKind = 'builtin' | 'markdown' | 'mdz' | 'folder';

interface TemplateParameter {
  name?: string;
  variable?: string;
  description?: string;
  pattern?: string;
}

interface TemplateConfig {
  title?: string;
  description?: string;
  entryPoint?: string;
  suggestedFileName?: string;
  parameters?: TemplateParameter[];
  openAfterGeneration?: string[];
}

interface TemplateDefinition {
  kind: TemplateKind;
  label: string;
  description?: string;
  uri?: vscode.Uri;
  markdown?: string;
  config?: TemplateConfig;
}

type TemplateQuickPickItem = vscode.QuickPickItem & {
  template?: TemplateDefinition;
  action?: 'configure';
};

const TEXT_DECODER = new TextDecoder('utf-8');
const DEFAULT_DOCUMENT_TEMPLATE_LABEL = 'Default document';

const BUILT_IN_TEMPLATES: readonly TemplateDefinition[] = [
  {
    kind: 'builtin',
    label: DEFAULT_DOCUMENT_TEMPLATE_LABEL,
    description: 'Create the default MDZip document',
    markdown: '# {title}\n\nStart writing here.\n',
    config: {
      suggestedFileName: '{filename}.mdz',
    },
  },
  {
    kind: 'builtin',
    label: 'Agile Story',
    description: 'Description, acceptance criteria, and plan',
    markdown: [
      '# {title}',
      '',
      '## Description',
      '',
      'As a ...',
      'I want ...',
      'So that ...',
      '',
      '## Acceptance Criteria',
      '',
      '- [ ] Given ...',
      '  When ...',
      '  Then ...',
      '',
      '## Plan',
      '',
      '-',
      '',
    ].join('\n'),
    config: {
      suggestedFileName: '{filename}.mdz',
    },
  },
];

export async function createMdzFromTemplate(
  context: vscode.ExtensionContext,
  resource?: unknown
): Promise<void> {
  const targetFolder = await resolveTargetFolder(resource);
  if (!targetFolder) {
    return;
  }

  const template = await pickTemplate(context);
  if (!template) {
    return;
  }

  const values = await promptTemplateValues(template);
  if (!values) {
    return;
  }

  const targetUri = vscode.Uri.joinPath(targetFolder, ensureMdzExtension(values.filename));

  const bytes = await renderTemplateToMdzBytes(context, template, values);
  if (!(await confirmOverwriteIfNeeded(targetUri))) {
    return;
  }

  await vscode.workspace.fs.writeFile(targetUri, bytes);
  MdzEditorProvider.markNextOpenInSplit(targetUri);
  await vscode.commands.executeCommand('vscode.openWith', targetUri, 'mdzip.mdzEditor');
}

export async function configureTemplateFolder(): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select MDZip Templates Folder',
  });

  const folder = selected?.[0];
  if (!folder) {
    return;
  }

  const config = vscode.workspace.getConfiguration('mdzip.templates');
  const currentPath = config.get<string>('path')?.trim();
  const hasWorkspace = Boolean(vscode.workspace.workspaceFolders?.length);
  const scope = await pickConfigurationScope();
  if (!scope) {
    return;
  }

  if (currentPath && currentPath !== folder.fsPath) {
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'Replace Primary Folder', description: currentPath },
        { label: 'Add as Additional Folder', description: folder.fsPath },
      ],
      {
        title: 'Configure MDZip Templates',
        placeHolder: 'Choose how to save this templates folder',
      }
    );

    if (!choice) {
      return;
    }

    if (choice.label === 'Add as Additional Folder') {
      const additional = config.get<string[]>('additionalPaths') || [];
      if (!additional.includes(folder.fsPath)) {
        await config.update('additionalPaths', [...additional, folder.fsPath], scope);
      }
      vscode.window.showInformationMessage('Added MDZip templates folder.');
      return;
    }
  }

  await config.update('path', folder.fsPath, hasWorkspace ? scope : vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage('Configured MDZip templates folder.');
}

export async function openTemplatesFolder(): Promise<void> {
  const roots = configuredTemplateRootUris();
  if (roots.length === 0) {
    const choice = await vscode.window.showInformationMessage(
      'No MDZip templates folder is configured yet.',
      'Configure Template Folder'
    );
    if (choice === 'Configure Template Folder') {
      await configureTemplateFolder();
    }
    return;
  }

  await vscode.commands.executeCommand('revealFileInOS', roots[0]);
}

async function pickTemplate(context: vscode.ExtensionContext): Promise<TemplateDefinition | undefined> {
  const templates = await discoverTemplates(context);
  const items: TemplateQuickPickItem[] = templates.map((template) => ({
    label: template.label,
    description: template.description,
    detail: template.uri?.fsPath,
    template,
  }));

  items.push({
    label: 'Configure Template Folder...',
    description: 'Choose where custom MDZip templates live',
    action: 'configure',
  });

  const picked = await vscode.window.showQuickPick(items, {
    title: 'MDZip: New .mdz file',
    placeHolder: 'Choose a template',
  });

  if (!picked) {
    return undefined;
  }

  if (picked.action === 'configure') {
    await configureTemplateFolder();
    return pickTemplate(context);
  }

  return picked.template;
}

async function discoverTemplates(context: vscode.ExtensionContext): Promise<TemplateDefinition[]> {
  const templates = [...BUILT_IN_TEMPLATES];
  for (const root of configuredTemplateRootUris()) {
    try {
      const stat = await vscode.workspace.fs.stat(root);
      if (stat.type !== vscode.FileType.Directory) {
        continue;
      }

      const entries = await vscode.workspace.fs.readDirectory(root);
      for (const [name, type] of entries.sort(([left], [right]) => left.localeCompare(right))) {
        const uri = vscode.Uri.joinPath(root, name);
        try {
          if (type === vscode.FileType.Directory) {
            templates.push(await folderTemplateDefinition(uri));
          } else if (/\.md$/i.test(name)) {
            templates.push({
              kind: 'markdown',
              label: fileLabel(name),
              description: 'Markdown template',
              uri,
            });
          } else if (/\.mdz$/i.test(name)) {
            templates.push({
              kind: 'mdz',
              label: fileLabel(name),
              description: 'MDZip template',
              uri,
            });
          }
        } catch (error) {
          console.warn(`[MDZip] Skipping template ${uri.fsPath}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[MDZip] Could not read templates folder ${root.fsPath}:`, error);
    }
  }

  return disambiguateTemplateLabels(templates);
}

async function folderTemplateDefinition(uri: vscode.Uri): Promise<TemplateDefinition> {
  const config = await readTemplateConfig(uri);
  return {
    kind: 'folder',
    label: config?.title || fileLabel(path.basename(uri.fsPath)),
    description: config?.description || 'Folder template',
    uri,
    config,
  };
}

function configuredTemplateRootUris(): vscode.Uri[] {
  const config = vscode.workspace.getConfiguration('mdzip.templates');
  const values = [
    config.get<string>('path') || '',
    ...(config.get<string[]>('additionalPaths') || []),
  ];

  const uris: vscode.Uri[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const uri = resolveTemplatePath(value);
    if (!uri) {
      continue;
    }
    const key = uri.toString();
    if (!seen.has(key)) {
      seen.add(key);
      uris.push(uri);
    }
  }
  return uris;
}

function resolveTemplatePath(rawValue: string): vscode.Uri | undefined {
  const value = rawValue.trim();
  if (!value) {
    return undefined;
  }

  if ((value.startsWith('./') || value.startsWith('../')) && vscode.workspace.workspaceFolders?.[0]) {
    return vscode.Uri.file(path.resolve(vscode.workspace.workspaceFolders[0].uri.fsPath, value));
  }

  return vscode.Uri.file(value);
}

async function promptTemplateValues(
  template: TemplateDefinition
): Promise<Record<string, string> | undefined> {
  const title = await vscode.window.showInputBox({
    title: 'New MDZip Document',
    prompt: 'Document title',
    value: template.label === DEFAULT_DOCUMENT_TEMPLATE_LABEL ? 'Untitled' : template.label,
    validateInput: (value) => value.trim() ? null : 'Title is required.',
  });

  if (!title) {
    return undefined;
  }

  const values: Record<string, string> = {
    title: title.trim(),
    filename: slugifyFileName(title.trim()) || 'untitled',
    date: formatLocalDate(new Date()),
    datetime: formatLocalDateTime(new Date()),
  };

  for (const parameter of template.config?.parameters || []) {
    const variable = parameter.variable?.trim();
    if (!variable) {
      continue;
    }

    const pattern = parameter.pattern ? new RegExp(parameter.pattern) : undefined;
    const value = await vscode.window.showInputBox({
      title: template.label,
      prompt: parameter.name || variable,
      placeHolder: parameter.description,
      validateInput: (input) => {
        if (!input.trim()) {
          return `${parameter.name || variable} is required.`;
        }
        if (pattern && !pattern.test(input.trim())) {
          return `Value must match ${parameter.pattern}.`;
        }
        return null;
      },
    });

    if (value === undefined) {
      return undefined;
    }
    values[variable] = value.trim();
  }

  return values;
}

async function renderTemplateToMdzBytes(
  context: vscode.ExtensionContext,
  template: TemplateDefinition,
  values: Record<string, string>
): Promise<Uint8Array> {
  if (template.kind === 'builtin') {
    const markdown = renderTemplateString(template.markdown || '', values);
    return buildNewArchiveBytesWithTitle(markdown, values.title, [await agentsMdAsset(context)]);
  }

  if (!template.uri) {
    throw new Error('Template URI is missing.');
  }

  if (template.kind === 'markdown') {
    const source = TEXT_DECODER.decode(await vscode.workspace.fs.readFile(template.uri));
    const markdown = renderTemplateString(source, values);
    const title = suggestedTitleFromMarkdown(markdown, values.title);
    return buildNewArchiveBytesWithTitle(markdown, title, [await agentsMdAsset(context)]);
  }

  if (template.kind === 'mdz') {
    let bytes = await vscode.workspace.fs.readFile(template.uri);
    const archive = await openMdzArchive(bytes);
    const markdown = renderTemplateString(archive.markdownText, values);
    bytes = await updateMarkdownInArchive(bytes, archive.entryPoint, markdown);
    try {
      bytes = await updateManifestTitleInArchive(bytes, values.title);
    } catch {
      // Templates without a manifest are still valid archives to clone.
    }
    // Respect a template that already ships its own AGENTS.md; only add the
    // default one if the cloned archive doesn't have one.
    if (!archive.paths.some((entry) => entry.path.toLowerCase() === 'agents.md')) {
      const asset = await agentsMdAsset(context);
      bytes = await updateBinaryInArchive(bytes, asset.archivePath, asset.fileBytes);
    }
    return bytes;
  }

  return renderFolderTemplate(context, template.uri, values);
}

/** The default `AGENTS.md` bundled into every newly created .mdz archive, telling
 * agents without native MDZip support how to consume this file safely — in
 * particular, to prefer the MDZip MCP server (for reads and writes, not just
 * writes) over extracting the archive or hand-editing it with generic ZIP tools. */
export async function agentsMdAsset(context: vscode.ExtensionContext): Promise<NewArchiveAsset> {
  const uri = vscode.Uri.joinPath(context.extensionUri, 'media', 'templates', 'embedded-agent-guide.md');
  const fileBytes = await vscode.workspace.fs.readFile(uri);
  return { archivePath: 'AGENTS.md', fileBytes };
}

async function renderFolderTemplate(
  context: vscode.ExtensionContext,
  folderUri: vscode.Uri,
  values: Record<string, string>
): Promise<Uint8Array> {
  const config = await readTemplateConfig(folderUri);
  const allFiles = await readFolderFiles(folderUri);
  const manifest = await readFolderManifest(folderUri);
  const entryPoint = config?.entryPoint || manifest?.entryPoint || firstMarkdownPath(allFiles);

  if (!entryPoint) {
    throw new Error('Folder template must contain at least one Markdown file.');
  }

  const entryFile = allFiles.find((file) => normaliseArchivePath(file.relativePath) === normaliseArchivePath(entryPoint));
  if (!entryFile) {
    throw new Error(`Template entry point was not found: ${entryPoint}`);
  }

  const markdown = renderTemplateString(TEXT_DECODER.decode(entryFile.bytes), values);
  const title = values.title || manifest?.title || suggestedTitleFromMarkdown(markdown, fileLabel(entryPoint));
  const assets = allFiles
    .filter((file) => file !== entryFile)
    .filter((file) => !isTemplateMetadataPath(file.relativePath))
    .map((file) => ({
      archivePath: renderTemplateString(normaliseArchivePath(file.relativePath), values),
      fileBytes: file.bytes,
    }));

  // Respect a folder template that already ships its own AGENTS.md.
  if (!assets.some((asset) => asset.archivePath.toLowerCase() === 'agents.md')) {
    assets.push(await agentsMdAsset(context));
  }

  return buildNewArchiveBytesWithTitle(markdown, title, assets);
}

async function readFolderFiles(
  folderUri: vscode.Uri,
  currentUri = folderUri,
  prefix = ''
): Promise<Array<{ relativePath: string; bytes: Uint8Array }>> {
  const files: Array<{ relativePath: string; bytes: Uint8Array }> = [];
  const entries = await vscode.workspace.fs.readDirectory(currentUri);
  for (const [name, type] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const uri = vscode.Uri.joinPath(currentUri, name);
    if (type === vscode.FileType.Directory) {
      files.push(...await readFolderFiles(folderUri, uri, relativePath));
    } else if (type === vscode.FileType.File) {
      files.push({ relativePath, bytes: await vscode.workspace.fs.readFile(uri) });
    }
  }
  return files;
}

async function readTemplateConfig(folderUri: vscode.Uri): Promise<TemplateConfig | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folderUri, 'template.config.json'));
    return JSON.parse(TEXT_DECODER.decode(bytes)) as TemplateConfig;
  } catch {
    return undefined;
  }
}

async function readFolderManifest(folderUri: vscode.Uri): Promise<{ title?: string; entryPoint?: string } | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folderUri, 'manifest.json'));
    const parsed = JSON.parse(TEXT_DECODER.decode(bytes)) as { title?: string; entryPoint?: string };
    return parsed;
  } catch {
    return undefined;
  }
}

async function resolveTargetFolder(resource?: unknown): Promise<vscode.Uri | undefined> {
  const uri = resourceUriFromCommandArg(resource);
  if (uri) {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.Directory) {
        return uri;
      }
      return parentUri(uri);
    } catch {
      return parentUri(uri);
    }
  }

  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  if (workspaceFolders.length === 1) {
    return workspaceFolders[0].uri;
  }

  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Select Folder for New MDZip Document',
  });
  return selected?.[0];
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

function parentUri(uri: vscode.Uri): vscode.Uri {
  if (uri.scheme === 'file') {
    return vscode.Uri.file(path.dirname(uri.fsPath));
  }
  return uri.with({ path: path.posix.dirname(uri.path) });
}

async function pickConfigurationScope(): Promise<vscode.ConfigurationTarget | undefined> {
  const options = [
    {
      label: 'User Settings',
      description: 'Available in all workspaces',
      target: vscode.ConfigurationTarget.Global,
    },
  ];

  if (vscode.workspace.workspaceFolders?.length) {
    options.unshift({
      label: 'Workspace Settings',
      description: 'Available only in this workspace',
      target: vscode.ConfigurationTarget.Workspace,
    });
  }

  const picked = await vscode.window.showQuickPick(options, {
    title: 'Configure MDZip Templates',
    placeHolder: 'Choose where to save the templates setting',
  });
  return picked?.target;
}

async function confirmOverwriteIfNeeded(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    return true;
  }

  const choice = await vscode.window.showWarningMessage(
    `${path.basename(uri.fsPath)} already exists. Overwrite it?`,
    { modal: true },
    'Overwrite'
  );
  return choice === 'Overwrite';
}

function renderTemplateString(source: string, values: Record<string, string>): string {
  return source.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key: string) => values[key] ?? match);
}

function disambiguateTemplateLabels(templates: TemplateDefinition[]): TemplateDefinition[] {
  const counts = new Map<string, number>();
  for (const template of templates) {
    counts.set(template.label, (counts.get(template.label) || 0) + 1);
  }

  return templates.map((template) => {
    if ((counts.get(template.label) || 0) <= 1 || !template.uri) {
      return template;
    }
    return {
      ...template,
      label: `${template.label} (${path.basename(path.dirname(template.uri.fsPath))})`,
    };
  });
}

function firstMarkdownPath(files: readonly { relativePath: string }[]): string | undefined {
  return files
    .map((file) => normaliseArchivePath(file.relativePath))
    .filter((filePath) => /\.md$/i.test(filePath))
    .sort((left, right) => {
      if (left.toLowerCase() === 'index.md') {
        return -1;
      }
      if (right.toLowerCase() === 'index.md') {
        return 1;
      }
      return left.localeCompare(right);
    })[0];
}

function isTemplateMetadataPath(filePath: string): boolean {
  const normalised = normaliseArchivePath(filePath).toLowerCase();
  return normalised === 'template.config.json' || normalised === 'manifest.json';
}

function normaliseArchivePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function ensureMdzExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith('.mdz') ? fileName : `${fileName}.mdz`;
}

function fileLabel(fileName: string): string {
  return fileBaseNameFromPath(fileName)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Template';
}

function slugifyFileName(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 80);
}

function formatLocalDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatLocalDateTime(date: Date): string {
  return `${formatLocalDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
