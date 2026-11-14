// Resolving merge conflicts in an .mdz (or .md) inside VS Code.
//
// With the `mdz merge` driver set up (mdzip-cli), a `git merge` that changes
// the same archive on both branches leaves conflict markers inside the
// archive's documents and keeps both versions of an image both sides replaced
// (`chart.png` and `chart.theirs.png`). The panel here shows them with
// @mdzip/editor's MdzipMergeView and writes each resolution to the file; its
// Complete Merge button marks the file resolved (`git add`). Without the
// driver, Git leaves the current archive in place: the panel offers to keep
// one side, compare the two, or set up the driver and merge again.
import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { buildDiffHtml, MdzDiffPanel } from './mdzDiffPanel';
import { getGitRepoInfo, isMarkdownUri } from './mdGitDiff';
import { readGitBlob } from './gitBlob';
import { logError } from './mdzLog';

const CLI_INSTALL_URL = 'https://github.com/mdzip-project/mdzip-cli#installation';
const MERGE_DRIVER = 'mdz merge %O %A %B --marker-size %L --path %P';

interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : -1) : 0;
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

/** Runs git in the file's folder; throws with git's message when it fails. */
async function git(fileUri: vscode.Uri, args: string[]): Promise<string> {
  const { gitPath } = await getGitRepoInfo(fileUri);
  const result = await run(gitPath, args, path.dirname(fileUri.fsPath));
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `git ${args[0]} failed (exit code ${result.code}).`);
  }
  return result.stdout;
}

/** `./name`: a pathspec for the file, relative to its folder (where git runs). */
function pathspec(fileUri: vscode.Uri): string {
  return `./${path.basename(fileUri.fsPath)}`;
}

/**
 * The index stages Git holds for an unmerged file (1 base, 2 yours, 3
 * theirs), or an empty set when it isn't unmerged or not in a repository.
 */
export async function unmergedStages(fileUri: vscode.Uri): Promise<Set<number>> {
  try {
    const output = await git(fileUri, ['ls-files', '-u', '--', pathspec(fileUri)]);
    const stages = new Set<number>();
    for (const line of output.split('\n')) {
      const match = /^\d+ [0-9a-f]+ ([123])\t/.exec(line);
      if (match) stages.add(Number(match[1]));
    }
    return stages;
  } catch {
    return new Set();
  }
}

/** Whether Git would merge this file with the `mdz merge` driver in this clone. */
async function mergeDriverConfigured(fileUri: vscode.Uri): Promise<boolean> {
  try {
    const attr = await git(fileUri, ['check-attr', 'merge', '--', pathspec(fileUri)]);
    if (!/: merge: mdz\s*$/m.test(attr)) return false;
    const driver = await git(fileUri, ['config', '--get', 'merge.mdz.driver']);
    return driver.trim().length > 0;
  } catch {
    return false;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

function panelKey(fileUri: vscode.Uri): string {
  return process.platform === 'win32' ? fileUri.fsPath.toLowerCase() : fileUri.fsPath;
}

export class MdzMergePanel {
  private static readonly panels = new Map<string, MdzMergePanel>();

  /** Opens (or reveals and reloads) the conflict panel for a file. */
  public static async open(fileUri: vscode.Uri, extensionUri: vscode.Uri): Promise<void> {
    const existing = MdzMergePanel.panels.get(panelKey(fileUri));
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      await existing.load(true);
      return;
    }
    MdzMergePanel.panels.set(panelKey(fileUri), new MdzMergePanel(fileUri, extensionUri));
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly markdown: boolean;
  private readonly name: string;
  private ready = false;
  private disposed = false;
  /** What the panel last loaded or wrote, to tell its own writes from changes made elsewhere. */
  private lastContent: Uint8Array | string | undefined;
  /** Writes in order, one at a time. */
  private writes: Promise<void> = Promise.resolve();
  /** The "what next" notification is showing: don't stack another. */
  private prompting = false;

  private constructor(private readonly fileUri: vscode.Uri, private readonly extensionUri: vscode.Uri) {
    this.markdown = isMarkdownUri(fileUri);
    this.name = path.basename(fileUri.fsPath);
    this.panel = vscode.window.createWebviewPanel(
      'mdzip.merge',
      `${this.name} (Merge Conflicts)`,
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, enableFindWidget: true }
    );
    this.panel.webview.html = buildDiffHtml(this.panel.webview, extensionUri, `${this.name} (Merge Conflicts)`, {
      script: 'merge.bundle.js',
      loadingText: 'Loading conflicts...',
    });

    // Reload when the file changes outside the panel (a text editor, `git checkout -m`).
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(path.dirname(fileUri.fsPath)), this.name)
    );
    const onDiskChange = () => { void this.reloadIfChangedElsewhere(); };
    const disposables: vscode.Disposable[] = [
      watcher,
      watcher.onDidChange(onDiskChange),
      watcher.onDidCreate(onDiskChange),
      this.panel.webview.onDidReceiveMessage((message: unknown) => this.onMessage(message)),
    ];
    this.panel.onDidDispose(() => {
      this.disposed = true;
      for (const disposable of disposables) disposable.dispose();
      if (MdzMergePanel.panels.get(panelKey(fileUri)) === this) MdzMergePanel.panels.delete(panelKey(fileUri));
    });
  }

  private async onMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    const event = message as {
      type: unknown; text?: unknown; bytesBase64?: unknown; conflictCount?: unknown;
      id?: unknown; path?: unknown; message?: unknown; remaining?: unknown;
    };
    switch (event.type) {
      case 'ready':
        this.ready = true;
        await this.load(false);
        break;
      case 'changed':
        if (typeof event.bytesBase64 === 'string') {
          this.queueWrite(new Uint8Array(Buffer.from(event.bytesBase64, 'base64')));
        } else if (typeof event.text === 'string') {
          this.queueWrite(event.text);
        }
        break;
      case 'loaded':
        if (event.conflictCount === 0) await this.nothingToResolve();
        break;
      case 'complete':
        await this.writes;
        await this.completeMerge(typeof event.remaining === 'number' ? event.remaining : 0);
        break;
      case 'readResource':
        await this.answerResource(event.id, event.path);
        break;
      case 'failed': {
        const detail = typeof event.message === 'string' ? event.message : 'Unknown error';
        logError('Merge view failed', detail);
        void vscode.window.showErrorMessage(`Couldn't show the conflicts in ${this.name}: ${detail}`);
        break;
      }
    }
  }

  /** Reads the file and shows its conflicts. */
  private async load(keepMode: boolean): Promise<void> {
    if (!this.ready || this.disposed) return;
    try {
      const [versions, labels] = await Promise.all([this.readVersions(), this.readLabels()]);
      if (this.markdown) {
        // The open document's text, so unsaved typing isn't lost.
        const document = await vscode.workspace.openTextDocument(this.fileUri);
        const text = document.getText();
        this.lastContent = text;
        await this.panel.webview.postMessage({
          type: 'loadMerge', fileName: this.name, markdown: text, hasResources: true, keepMode, versions, ...labels,
        });
      } else {
        const bytes = await vscode.workspace.fs.readFile(this.fileUri);
        this.lastContent = bytes;
        await this.panel.webview.postMessage({
          type: 'loadMerge',
          fileName: this.name,
          bytesBase64: Buffer.from(bytes).toString('base64'),
          keepMode,
          versions,
          ...labels,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Couldn't read ${this.name}: ${message}`);
    }
  }

  /**
   * The common ancestor, yours and theirs, from Git's index stages 1-3 while
   * the file is unmerged, so the view can show every change. A side without
   * the file (added or deleted there) is null; undefined when not merging.
   */
  private async readVersions(): Promise<Record<'base' | 'ours' | 'theirs', { bytesBase64?: string; markdown?: string } | null> | undefined> {
    const stages = await unmergedStages(this.fileUri);
    if (stages.size === 0) return undefined;
    let gitPath: string;
    try {
      gitPath = (await getGitRepoInfo(this.fileUri)).gitPath;
    } catch {
      return undefined;
    }
    const read = async (stage: number) => {
      if (!stages.has(stage)) return null;
      try {
        const bytes = await readGitBlob(gitPath, `:${stage}`, this.fileUri.fsPath);
        return this.markdown ? { markdown: bytes.toString('utf8') } : { bytesBase64: bytes.toString('base64') };
      } catch {
        return null;
      }
    };
    const [base, ours, theirs] = await Promise.all([read(1), read(2), read(3)]);
    return { base, ours, theirs };
  }

  /** The branch being merged into (yours) and the one coming in (theirs), for the pane headings. */
  private async readLabels(): Promise<{ oursLabel?: string; theirsLabel?: string }> {
    const name = async (args: string[]) => {
      try {
        const value = (await git(this.fileUri, args)).trim();
        return value && value !== 'HEAD' && value !== 'undefined' ? value : undefined;
      } catch {
        return undefined;
      }
    };
    const [oursLabel, theirsLabel] = await Promise.all([
      name(['rev-parse', '--abbrev-ref', 'HEAD']),
      name(['name-rev', '--name-only', '--exclude=tags/*', 'MERGE_HEAD']),
    ]);
    return { oursLabel, theirsLabel: theirsLabel?.replace(/^remotes\//, '') };
  }

  private async reloadIfChangedElsewhere(): Promise<void> {
    if (this.disposed) return;
    await this.writes;
    try {
      if (this.markdown) {
        const text = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.fileUri));
        if (text === this.lastContent) return;
      } else {
        const bytes = await vscode.workspace.fs.readFile(this.fileUri);
        if (this.lastContent instanceof Uint8Array && sameBytes(bytes, this.lastContent)) return;
      }
    } catch {
      return;
    }
    await this.load(true);
  }

  private queueWrite(content: Uint8Array | string): void {
    this.lastContent = content;
    this.writes = this.writes.then(() => this.write(content)).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Couldn't save ${this.name}: ${message}`);
    });
  }

  private async write(content: Uint8Array | string): Promise<void> {
    if (typeof content !== 'string') {
      await vscode.workspace.fs.writeFile(this.fileUri, content);
      return;
    }
    // A Markdown file goes through its document, so an open text editor follows along.
    const document = await vscode.workspace.openTextDocument(this.fileUri);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(this.fileUri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), content);
    await vscode.workspace.applyEdit(edit);
    await document.save();
  }

  private async answerResource(id: unknown, relativePath: unknown): Promise<void> {
    if (typeof id !== 'number' || typeof relativePath !== 'string') return;
    let bytes: Uint8Array | undefined;
    try {
      const target = vscode.Uri.file(path.resolve(path.dirname(this.fileUri.fsPath), decodeURIComponent(relativePath)));
      bytes = await vscode.workspace.fs.readFile(target);
    } catch {
      bytes = undefined;
    }
    await this.panel.webview.postMessage({
      type: 'resource',
      id,
      bytesBase64: bytes ? Buffer.from(bytes).toString('base64') : undefined,
    });
  }

  /** Complete Merge: tell Git the file is resolved (asking first while conflicts remain). */
  private async completeMerge(remaining: number): Promise<void> {
    if ((await unmergedStages(this.fileUri)).size === 0) {
      void vscode.window.showInformationMessage(`${this.name} is already marked as resolved.`);
      this.panel.dispose();
      return;
    }
    if (remaining > 0) {
      const choice = await vscode.window.showWarningMessage(
        `${remaining} ${remaining === 1 ? 'conflict remains' : 'conflicts remain'} in ${this.name}. Complete the merge anyway?`,
        { modal: true, detail: 'Unresolved conflict markers stay in the file and would be committed.' },
        'Complete Merge'
      );
      if (choice !== 'Complete Merge') return;
    }
    await this.markResolved();
  }

  private async markResolved(): Promise<void> {
    try {
      await git(this.fileUri, ['add', '--', pathspec(this.fileUri)]);
      void vscode.window.showInformationMessage(`${this.name} is marked as resolved. Commit to finish the merge.`);
      this.panel.dispose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Couldn't mark ${this.name} as resolved: ${message}`);
    }
  }

  /**
   * The file has no conflicts to show. If Git still lists it as unmerged,
   * either they were all resolved earlier (the panel's Complete Merge marks
   * it) or Git couldn't merge it at all and left the current version (offer
   * the choices).
   */
  private async nothingToResolve(): Promise<void> {
    if (this.prompting) return;
    const stages = await unmergedStages(this.fileUri);
    if (stages.size === 0) return;
    let untouched = false;
    if (stages.has(2)) {
      try {
        const { gitPath } = await getGitRepoInfo(this.fileUri);
        const ours = await readGitBlob(gitPath, ':2', this.fileUri.fsPath);
        untouched = sameBytes(await vscode.workspace.fs.readFile(this.fileUri), ours);
      } catch {
        untouched = false;
      }
    }
    if (!untouched) return;
    this.prompting = true;
    try {
      await this.wholeFileConflict(stages);
    } finally {
      this.prompting = false;
    }
  }

  /** Git couldn't merge the file: keep one side, compare them, or merge again with the driver. */
  private async wholeFileConflict(stages: Set<number>): Promise<void> {
    const driver = !this.markdown && await mergeDriverConfigured(this.fileUri);
    const both = stages.has(2) && stages.has(3);
    for (;;) {
      const actions = [
        ...(both ? ['Compare Incoming and Current'] : []),
        'Keep Current',
        'Take Incoming',
        ...(this.markdown ? [] : [driver ? 'Merge Again' : 'Set Up Merge Driver']),
      ];
      const detail = this.markdown || driver
        ? 'Git couldn\'t merge it and left the current version in place.'
        : 'Git can\'t merge an archive on its own, so it left the current version in place. Set up the MDZip merge driver to merge the documents inside it.';
      const choice = await vscode.window.showWarningMessage(
        `Both branches changed ${this.name}. ${detail}`,
        ...actions
      );
      try {
        switch (choice) {
          case 'Compare Incoming and Current':
            await this.compareSides();
            continue; // the notification closed: show it again
          case 'Keep Current':
          case 'Take Incoming':
            await this.keepSide(choice === 'Keep Current' ? 2 : 3, stages);
            return;
          case 'Set Up Merge Driver':
            if (!await setUpMergeDriver(this.fileUri)) return;
            await mergeAgain(this.fileUri, false);
            return;
          case 'Merge Again':
            await mergeAgain(this.fileUri, false);
            return;
          default:
            return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`${choice} failed: ${message}`);
        return;
      }
    }
  }

  private async compareSides(): Promise<void> {
    const { gitPath } = await getGitRepoInfo(this.fileUri);
    const [ours, theirs] = await Promise.all([
      readGitBlob(gitPath, ':2', this.fileUri.fsPath),
      readGitBlob(gitPath, ':3', this.fileUri.fsPath),
    ]);
    const side = (label: string, bytes: Buffer) => this.markdown
      ? { label, uri: this.fileUri, markdown: bytes.toString('utf8') }
      : { label, uri: this.fileUri, bytes: new Uint8Array(bytes) };
    await MdzDiffPanel.open({
      title: `${this.name} (Current ↔ Incoming)`,
      resourceUri: this.fileUri.with({ scheme: 'mdzip-merge' }),
      before: side('Current', ours),
      after: side('Incoming', theirs),
    }, this.extensionUri);
  }

  /** Keeps one side's whole file (or its deletion) and marks the file resolved. */
  private async keepSide(stage: 2 | 3, stages: Set<number>): Promise<void> {
    if (stages.has(stage)) {
      await git(this.fileUri, ['checkout', stage === 2 ? '--ours' : '--theirs', '--', pathspec(this.fileUri)]);
      await git(this.fileUri, ['add', '--', pathspec(this.fileUri)]);
    } else {
      // That side deleted the file.
      await git(this.fileUri, ['rm', '--quiet', '--', pathspec(this.fileUri)]);
    }
    void vscode.window.showInformationMessage(
      `Kept the ${stage === 2 ? 'current' : 'incoming'} version of ${this.name} and marked it as resolved. Commit to finish the merge.`
    );
    this.panel.dispose();
  }
}

/**
 * Throws away the resolutions in a conflicted file and merges it again
 * (`git checkout -m`), with the merge driver when it's set up.
 */
export async function mergeAgain(fileUri: vscode.Uri, confirm: boolean): Promise<void> {
  const name = path.basename(fileUri.fsPath);
  if ((await unmergedStages(fileUri)).size === 0) {
    void vscode.window.showInformationMessage(`${name} has no merge in progress. Git can only merge it again while it's unmerged.`);
    return;
  }
  if (confirm) {
    const choice = await vscode.window.showWarningMessage(
      `Merge ${name} again? The conflicts you resolved come back.`,
      { modal: true },
      'Merge Again'
    );
    if (choice !== 'Merge Again') return;
  }
  await git(fileUri, ['checkout', '-m', '--', pathspec(fileUri)]);
  // The open panel reloads from the file watcher; open one if there's none.
  await vscode.commands.executeCommand('mdzip.resolveMergeConflicts', fileUri);
}

/**
 * Sets up `mdz merge` for the repository holding `fileUri`: the driver in
 * this clone's Git config, and `merge=mdz` (with `diff=mdz`) for `*.mdz` in
 * the repository's `.gitattributes`. Returns false when cancelled.
 */
export async function setUpMergeDriver(fileUri: vscode.Uri): Promise<boolean> {
  const { gitPath, root } = await getGitRepoInfo(fileUri);

  const mdz = await run('mdz', ['--version'], root);
  if (mdz.code !== 0) {
    const choice = await vscode.window.showWarningMessage(
      'Git runs the `mdz` command to merge archives, and it isn\'t installed (or isn\'t on the PATH). Install the MDZip CLI, then set up the driver.',
      'Install Instructions',
      'Set Up Anyway'
    );
    if (choice === 'Install Instructions') void vscode.env.openExternal(vscode.Uri.parse(CLI_INSTALL_URL));
    if (choice !== 'Set Up Anyway') return false;
  }

  const config = async (...args: string[]) => {
    const result = await run(gitPath, ['config', ...args], root);
    if (result.code !== 0) throw new Error(result.stderr.trim() || 'git config failed.');
  };
  await config('merge.mdz.name', 'MDZip archive merge');
  await config('merge.mdz.driver', MERGE_DRIVER);

  const attributesPath = path.join(root, '.gitattributes');
  let attributes = '';
  try {
    attributes = await fs.readFile(attributesPath, 'utf8');
  } catch {
    attributes = '';
  }
  const update = addMergeAttribute(attributes);
  if (update.text !== attributes) await fs.writeFile(attributesPath, update.text, 'utf8');
  if (update.addedDiff) {
    // `diff=mdz` without a textconv would make `git diff` fail; set it up too.
    const existing = await run(gitPath, ['config', '--get', 'diff.mdz.textconv'], root);
    if (existing.code !== 0 || !existing.stdout.trim()) {
      await config('diff.mdz.textconv', 'mdz textconv');
      await config('diff.mdz.cachetextconv', 'true');
    }
  }

  const choice = await vscode.window.showInformationMessage(
    update.text !== attributes
      ? 'The MDZip merge driver is set up in this clone. Commit .gitattributes so the repository uses it; other clones turn it on with this command too.'
      : 'The MDZip merge driver is set up in this clone.',
    ...(update.text !== attributes ? ['Open .gitattributes'] : [])
  );
  if (choice === 'Open .gitattributes') {
    await vscode.window.showTextDocument(vscode.Uri.file(attributesPath));
  }
  return true;
}

/**
 * `.gitattributes` text with `merge=mdz` on its `*.mdz` line (adding the
 * line, with `diff=mdz`, when there's none). A line that already names a
 * merge driver is left alone.
 */
export function addMergeAttribute(text: string): { text: string; addedDiff: boolean } {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.length ? text.split(/\r?\n/) : [];
  const index = lines.findIndex((line) => /^\s*\*\.mdz(\s|$)/.test(line));
  if (index >= 0) {
    if (/(^|\s)-?merge(=|\s|$)/.test(lines[index])) return { text, addedDiff: false };
    lines[index] = `${lines[index].replace(/\s+$/, '')} merge=mdz`;
    return { text: lines.join(newline), addedDiff: false };
  }
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push('*.mdz merge=mdz diff=mdz', '');
  return { text: lines.join(newline), addedDiff: true };
}

const MDZ_EDITOR_VIEW_TYPE = 'mdzip.mdzEditor';

/**
 * When an `.mdz` that Git lists as unmerged opens in the MDZip editor,
 * offers to show its conflicts (once per file per session). When one opens
 * in the text editor, swaps that tab for the conflict panel: VS Code's Git
 * extension opens a conflicted file from Merge Changes with the text editor
 * forced (`override: false`), which can't show an archive.
 */
export function registerConflictPrompt(): vscode.Disposable {
  const asked = new Set<string>();
  const check = async (uri: vscode.Uri) => {
    const key = panelKey(uri);
    if (asked.has(key)) return;
    asked.add(key);
    if ((await unmergedStages(uri)).size === 0) {
      asked.delete(key); // ask if it becomes conflicted later
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      `${path.basename(uri.fsPath)} has merge conflicts.`,
      'Resolve Conflicts'
    );
    if (choice === 'Resolve Conflicts') {
      await vscode.commands.executeCommand('mdzip.resolveMergeConflicts', uri);
    }
  };
  const mdzUri = (tab: vscode.Tab) =>
    tab.input instanceof vscode.TabInputCustom && tab.input.viewType === MDZ_EDITOR_VIEW_TYPE && tab.input.uri.scheme === 'file'
      ? tab.input.uri
      : undefined;
  const redirecting = new Set<string>();
  const redirectTextTab = async (tab: vscode.Tab) => {
    const input = tab.input;
    if (!(input instanceof vscode.TabInputText) || input.uri.scheme !== 'file' || !/\.mdz$/i.test(input.uri.fsPath)) return;
    const key = panelKey(input.uri);
    if (redirecting.has(key)) return;
    redirecting.add(key);
    try {
      if ((await unmergedStages(input.uri)).size === 0) return;
      // The tab may have moved or closed meanwhile: close it wherever it is now.
      const current = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((candidate) => candidate.input instanceof vscode.TabInputText && panelKey(candidate.input.uri) === key);
      if (current.length) await vscode.window.tabGroups.close(current);
      await vscode.commands.executeCommand('mdzip.resolveMergeConflicts', input.uri);
    } finally {
      redirecting.delete(key);
    }
  };
  const onTab = (tab: vscode.Tab) => {
    const uri = mdzUri(tab);
    if (uri) void check(uri);
    else void redirectTextTab(tab);
  };
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) onTab(tab);
  }
  return vscode.window.tabGroups.onDidChangeTabs((event) => {
    // A preview tab reused for another file shows up as changed, not opened.
    for (const tab of [...event.opened, ...event.changed]) onTab(tab);
  });
}
