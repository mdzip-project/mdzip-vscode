import * as path from 'path';
import * as vscode from 'vscode';
import {
  createArchiveInventory,
  diffArchiveInventories,
  readCanonicalMarkdown,
  type ArchiveInventoryDiff,
  type CanonicalMarkdownReadResult,
} from 'mdzip-editor';

export interface MdzDiffSideInput {
  readonly label: string;
  readonly uri: vscode.Uri;
  readonly bytes?: Uint8Array;
  readonly missingMessage?: string;
}

export interface MdzDiffInput {
  readonly title: string;
  readonly before: MdzDiffSideInput;
  readonly after: MdzDiffSideInput;
}

interface MdzDiffSideModel {
  readonly label: string;
  readonly fileName: string;
  readonly state: 'ready' | 'missing' | 'error';
  readonly missingMessage?: string;
  readonly error?: string;
  readonly markdown?: CanonicalMarkdownReadResult;
}

interface MdzDiffModel {
  readonly title: string;
  readonly before: MdzDiffSideModel;
  readonly after: MdzDiffSideModel;
  readonly inventoryDiff?: ArchiveInventoryDiff;
  readonly markdownRows: MarkdownDiffRow[];
}

interface MarkdownDiffRow {
  readonly kind: 'unchanged' | 'added' | 'removed' | 'changed';
  readonly beforeLine?: number;
  readonly afterLine?: number;
  readonly beforeText?: string;
  readonly afterText?: string;
}

interface LoadedSide {
  readonly side: MdzDiffSideModel;
  readonly inventory?: Awaited<ReturnType<typeof createArchiveInventory>>;
}

/**
 * Read-only semantic diff panel for comparing two MDZip archives.
 */
export class MdzDiffPanel {
  public static async open(input: MdzDiffInput): Promise<void> {
    const model = await buildDiffModel(input);
    const panel = vscode.window.createWebviewPanel(
      'mdzip.diff',
      input.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = buildDiffHtml(model);
  }
}

async function buildDiffModel(input: MdzDiffInput): Promise<MdzDiffModel> {
  const [before, after] = await Promise.all([
    loadSide(input.before),
    loadSide(input.after),
  ]);

  const inventoryDiff = before.inventory && after.inventory
    ? diffArchiveInventories(before.inventory, after.inventory)
    : undefined;

  const beforeMarkdown = before.side.markdown?.markdown ?? '';
  const afterMarkdown = after.side.markdown?.markdown ?? '';
  const markdownRows = before.side.state === 'ready' && after.side.state === 'ready'
    ? diffMarkdownLines(beforeMarkdown, afterMarkdown)
    : [];

  return {
    title: input.title,
    before: before.side,
    after: after.side,
    inventoryDiff,
    markdownRows,
  };
}

async function loadSide(input: MdzDiffSideInput): Promise<LoadedSide> {
  const fileName = path.posix.basename(input.uri.path) || path.basename(input.uri.fsPath || input.label);
  const base = {
    label: input.label,
    fileName,
  };

  if (!input.bytes) {
    return {
      side: {
        ...base,
        state: 'missing',
        missingMessage: input.missingMessage ?? 'This side of the comparison is not available.',
      },
    };
  }

  try {
    const [markdown, inventory] = await Promise.all([
      readCanonicalMarkdown(input.bytes),
      createArchiveInventory(input.bytes),
    ]);

    return {
      side: {
        ...base,
        state: 'ready',
        markdown,
      },
      inventory,
    };
  } catch (error) {
    return {
      side: {
        ...base,
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function diffMarkdownLines(beforeText: string, afterText: string): MarkdownDiffRow[] {
  const beforeLines = splitLines(beforeText);
  const afterLines = splitLines(afterText);
  const table = buildLcsTable(beforeLines, afterLines);
  const operations: MarkdownDiffRow[] = [];

  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      operations.push({
        kind: 'unchanged',
        beforeLine: beforeIndex + 1,
        afterLine: afterIndex + 1,
        beforeText: beforeLines[beforeIndex],
        afterText: afterLines[afterIndex],
      });
      beforeIndex++;
      afterIndex++;
    } else if (table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1]) {
      operations.push({
        kind: 'removed',
        beforeLine: beforeIndex + 1,
        beforeText: beforeLines[beforeIndex],
      });
      beforeIndex++;
    } else {
      operations.push({
        kind: 'added',
        afterLine: afterIndex + 1,
        afterText: afterLines[afterIndex],
      });
      afterIndex++;
    }
  }

  while (beforeIndex < beforeLines.length) {
    operations.push({
      kind: 'removed',
      beforeLine: beforeIndex + 1,
      beforeText: beforeLines[beforeIndex],
    });
    beforeIndex++;
  }

  while (afterIndex < afterLines.length) {
    operations.push({
      kind: 'added',
      afterLine: afterIndex + 1,
      afterText: afterLines[afterIndex],
    });
    afterIndex++;
  }

  return pairChangedRows(operations);
}

function splitLines(text: string): string[] {
  if (!text) {
    return [];
  }
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function buildLcsTable(beforeLines: readonly string[], afterLines: readonly string[]): number[][] {
  const table = Array.from({ length: beforeLines.length + 1 }, () =>
    Array.from({ length: afterLines.length + 1 }, () => 0)
  );

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex--) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex--) {
      table[beforeIndex][afterIndex] = beforeLines[beforeIndex] === afterLines[afterIndex]
        ? table[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(table[beforeIndex + 1][afterIndex], table[beforeIndex][afterIndex + 1]);
    }
  }

  return table;
}

function pairChangedRows(rows: readonly MarkdownDiffRow[]): MarkdownDiffRow[] {
  const paired: MarkdownDiffRow[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const next = rows[index + 1];
    if (row.kind === 'removed' && next?.kind === 'added') {
      paired.push({
        kind: 'changed',
        beforeLine: row.beforeLine,
        afterLine: next.afterLine,
        beforeText: row.beforeText,
        afterText: next.afterText,
      });
      index++;
      continue;
    }

    paired.push(row);
  }

  return paired;
}

function buildDiffHtml(model: MdzDiffModel): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(model.title)}</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 20px;
    }

    h1,
    h2,
    h3 {
      margin: 0;
      font-weight: 600;
    }

    h1 {
      font-size: 20px;
      margin-bottom: 16px;
    }

    h2 {
      font-size: 15px;
      margin: 24px 0 10px;
    }

    h3 {
      font-size: 13px;
      margin-bottom: 8px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }

    .side,
    .stat,
    .state {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      background: var(--vscode-editorWidget-background);
    }

    .side-label,
    .muted {
      color: var(--vscode-descriptionForeground);
    }

    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .stat {
      min-width: 94px;
    }

    .stat strong {
      display: block;
      font-size: 18px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      border: 1px solid var(--vscode-panel-border);
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }

    th {
      color: var(--vscode-descriptionForeground);
      font-weight: 600;
      background: var(--vscode-editorWidget-background);
    }

    .status {
      display: inline-block;
      min-width: 72px;
      border-radius: 999px;
      padding: 2px 8px;
      text-align: center;
      font-size: 12px;
      text-transform: capitalize;
    }

    .status-added,
    .line-added {
      background: var(--vscode-diffEditor-insertedTextBackground);
    }

    .status-removed,
    .line-removed {
      background: var(--vscode-diffEditor-removedTextBackground);
    }

    .status-changed,
    .line-changed {
      background: var(--vscode-editorWarning-background);
    }

    .status-unchanged {
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
    }

    .markdown-diff {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
    }

    .diff-row {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) 64px minmax(0, 1fr);
      border-top: 1px solid var(--vscode-panel-border);
    }

    .diff-row:first-child {
      border-top: 0;
    }

    .line-number {
      padding: 5px 8px;
      color: var(--vscode-editorLineNumber-foreground);
      background: var(--vscode-editorGutter-background);
      text-align: right;
      user-select: none;
    }

    pre {
      margin: 0;
      padding: 5px 8px;
      min-height: 18px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
    }

    .state {
      margin-top: 10px;
      border-color: var(--vscode-inputValidation-warningBorder);
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(model.title)}</h1>
    ${renderSummary(model)}
    ${renderSideStates(model)}
    ${renderMarkdownDiff(model)}
    ${renderInventoryDiff(model.inventoryDiff)}
  </main>
</body>
</html>`;
}

function renderSummary(model: MdzDiffModel): string {
  const inventoryDiff = model.inventoryDiff;
  return /* html */ `<section>
  <div class="summary">
    ${renderSide(model.before)}
    ${renderSide(model.after)}
  </div>
  <div class="stats">
    <div class="stat"><strong>${inventoryDiff?.addedCount ?? 0}</strong><span class="muted">Added</span></div>
    <div class="stat"><strong>${inventoryDiff?.removedCount ?? 0}</strong><span class="muted">Removed</span></div>
    <div class="stat"><strong>${inventoryDiff?.changedCount ?? 0}</strong><span class="muted">Changed</span></div>
  </div>
</section>`;
}

function renderSide(side: MdzDiffSideModel): string {
  const entryPoint = side.markdown?.entryPoint;
  return /* html */ `<div class="side">
  <div class="side-label">${escapeHtml(side.label)}</div>
  <h3>${escapeHtml(side.fileName)}</h3>
  ${entryPoint ? `<div class="muted">Entry point: ${escapeHtml(entryPoint)}</div>` : ''}
</div>`;
}

function renderSideStates(model: MdzDiffModel): string {
  const states = [model.before, model.after]
    .filter((side) => side.state !== 'ready')
    .map((side) => {
      const message = side.state === 'missing'
        ? side.missingMessage ?? 'This side of the comparison is not available.'
        : `Unable to parse this side as MDZip: ${side.error ?? 'Unknown error'}`;
      return `<div class="state"><strong>${escapeHtml(side.label)}:</strong> ${escapeHtml(message)}</div>`;
    });

  return states.length > 0 ? states.join('\n') : '';
}

function renderMarkdownDiff(model: MdzDiffModel): string {
  if (model.before.state !== 'ready' || model.after.state !== 'ready') {
    return /* html */ `<section>
  <h2>Canonical Markdown</h2>
  <p class="muted">Markdown diff is available when both sides contain readable MDZip archives.</p>
</section>`;
  }

  if (model.markdownRows.length === 0) {
    return /* html */ `<section>
  <h2>Canonical Markdown</h2>
  <p class="muted">No canonical markdown changes.</p>
</section>`;
  }

  return /* html */ `<section>
  <h2>Canonical Markdown</h2>
  <div class="markdown-diff">
    ${model.markdownRows.map(renderMarkdownDiffRow).join('\n')}
  </div>
</section>`;
}

function renderMarkdownDiffRow(row: MarkdownDiffRow): string {
  const beforeClass = row.kind === 'added' ? '' : ` line-${row.kind}`;
  const afterClass = row.kind === 'removed' ? '' : ` line-${row.kind}`;

  return /* html */ `<div class="diff-row">
  <div class="line-number">${row.beforeLine ?? ''}</div>
  <pre class="${beforeClass.trim()}">${escapeHtml(row.beforeText ?? '')}</pre>
  <div class="line-number">${row.afterLine ?? ''}</div>
  <pre class="${afterClass.trim()}">${escapeHtml(row.afterText ?? '')}</pre>
</div>`;
}

function renderInventoryDiff(inventoryDiff: ArchiveInventoryDiff | undefined): string {
  if (!inventoryDiff) {
    return /* html */ `<section>
  <h2>Archive Inventory</h2>
  <p class="muted">Inventory diff is available when both sides contain readable MDZip archives.</p>
</section>`;
  }

  if (inventoryDiff.entries.length === 0) {
    return /* html */ `<section>
  <h2>Archive Inventory</h2>
  <p class="muted">No archive entries.</p>
</section>`;
  }

  return /* html */ `<section>
  <h2>Archive Inventory</h2>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Path</th>
        <th>Kind</th>
        <th>Before</th>
        <th>After</th>
      </tr>
    </thead>
    <tbody>
      ${inventoryDiff.entries.map((entry) => /* html */ `<tr>
        <td><span class="status status-${entry.status}">${escapeHtml(entry.status)}</span></td>
        <td>${escapeHtml(entry.path)}</td>
        <td>${escapeHtml(entry.kind)}</td>
        <td>${entry.before ? `${entry.before.size} bytes` : ''}</td>
        <td>${entry.after ? `${entry.after.size} bytes` : ''}</td>
      </tr>`).join('\n')}
    </tbody>
  </table>
</section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
