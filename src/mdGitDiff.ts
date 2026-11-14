// Opens a comparison of a plain .md file with a git version. Against the
// working tree it opens the "Compare with Git" editor, where the working side
// is the file itself and can be edited and saved. Between two git versions
// (staged changes: HEAD vs the index) it opens a read-only diff panel.
import * as path from 'path';
import * as vscode from 'vscode';
import { MdCompareEditorProvider } from './mdCompareEditor';
import { MdzDiffPanel } from './mdzDiffPanel';
import { markdownVersionSource, refLabel } from './mdGitSource';

export { getGitRepoInfo, isMarkdownUri } from './mdGitSource';

export interface MarkdownGitDiffOptions {
  /** Absolute path of the file in the working tree. */
  readonly filePath: string;
  /** Path of the "before" version when it differs (a rename); defaults to `filePath`. */
  readonly beforeFilePath?: string;
  /** Git ref of the "before" side: a commit-ish, or '' / '~' for the index. Default HEAD. */
  readonly beforeRef?: string;
  /** Git ref of the "after" side; undefined means the working tree. */
  readonly afterRef?: string;
}

export async function openMarkdownGitDiff(
  extensionUri: vscode.Uri,
  options: MarkdownGitDiffOptions
): Promise<void> {
  const workingUri = vscode.Uri.file(options.filePath);
  const beforeRef = options.beforeRef ?? 'HEAD';
  const afterRef = options.afterRef;

  if (afterRef === undefined) {
    const source = await markdownVersionSource(workingUri);
    if (!source.git) throw new Error('File is not inside a git repository');
    await MdCompareEditorProvider.open(workingUri, {
      beforeRef,
      beforeFilePath: options.beforeFilePath,
      rendered: true,
    });
    return;
  }

  // Two git versions: nothing to edit, so a read-only panel.
  const source = await markdownVersionSource(workingUri);
  if (!source.git) throw new Error('File is not inside a git repository');
  const beforePath = options.beforeFilePath ?? options.filePath;
  const loadBefore = () => source.loadText(beforeRef, beforePath);
  const loadAfter = () => source.loadText(afterRef, options.filePath);
  const [beforeText, afterText] = await Promise.all([loadBefore(), loadAfter()]);
  if (beforeText === undefined && afterText === undefined) {
    throw new Error(`No readable version of ${path.basename(options.filePath)} to compare`);
  }

  const beforeLabel = refLabel(beforeRef);
  const afterLabel = refLabel(afterRef);
  await MdzDiffPanel.open({
    title: `${path.basename(options.filePath)}: ${beforeLabel} to ${afterLabel}`,
    resourceUri: workingUri,
    rendered: true,
    before: {
      label: beforeLabel,
      uri: vscode.Uri.file(beforePath),
      markdown: beforeText,
      loadMarkdown: loadBefore,
      readResource: source.imageReader(beforeRef, beforePath),
      missingMessage: `This file has no ${beforeLabel} version. It may be new, untracked, or renamed.`,
    },
    after: {
      label: afterLabel,
      uri: workingUri,
      markdown: afterText,
      loadMarkdown: loadAfter,
      readResource: source.imageReader(afterRef, options.filePath),
      missingMessage: `This file has no ${afterLabel} version.`,
    },
  }, extensionUri);
}
