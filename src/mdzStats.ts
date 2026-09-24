// Document statistics shown in the status bar (mdzip-vscode#12). Pure and
// vscode-free: the webview builds a report from the editor's snapshot, the
// extension host validates and formats it.

export interface MdzDocumentStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  lines: number;
  readingTimeMinutes: number;
}

/**
 * What the webview says about the document it's showing:
 * - `stats`: numbers for the current Markdown document
 * - `too-large`: skipped, so typing stays responsive (see MAX_STATS_CHARS)
 * - `none`: nothing to count (e.g. an image or binary archive entry is selected)
 *
 * `entry` is the archive path of the Markdown file being counted (e.g.
 * `docs/chapter1.md`) — only the webview knows it, and an .mdz can hold many.
 * Omitted for a plain .md, where the file itself is the document.
 */
export type MdzStatsReport =
  | { kind: 'stats'; stats: MdzDocumentStats; entry?: string }
  | { kind: 'too-large'; entry?: string }
  | { kind: 'none' };

/** Counting splits the whole text; past this, skip rather than stall typing. */
export const MAX_STATS_CHARS = 3_000_000;

const STATS_FIELDS: readonly (keyof MdzDocumentStats)[] = [
  'words',
  'characters',
  'charactersNoSpaces',
  'lines',
  'readingTimeMinutes',
];

/**
 * Builds the report for what the editor is showing. `computeStats` is injected
 * (the webview passes @mdzip/editor's computeDocumentStats) so this stays
 * importable, and testable, without the editor.
 */
export function buildStatsReport(
  snapshot: { currentPathType: string; currentPath: string; currentText: string; sourceFormat: string },
  computeStats: (text: string) => MdzDocumentStats
): MdzStatsReport {
  if (snapshot.currentPathType !== 'markdown') {
    return { kind: 'none' };
  }
  // In an .mdz the counted file is one of possibly many entries; a plain .md
  // is its own document, and its synthetic entry name would only confuse.
  const entry = snapshot.sourceFormat === 'mdz' ? snapshot.currentPath : undefined;
  if (snapshot.currentText.length > MAX_STATS_CHARS) {
    return { kind: 'too-large', entry };
  }
  return { kind: 'stats', stats: computeStats(snapshot.currentText), entry };
}

const MAX_ENTRY_LENGTH = 1024;

/** Validates an untrusted webview message payload. Returns null if malformed. */
export function parseStatsReport(value: unknown): MdzStatsReport | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const report = value as { kind?: unknown; stats?: unknown; entry?: unknown };
  if (report.entry !== undefined && (typeof report.entry !== 'string' || report.entry.length > MAX_ENTRY_LENGTH)) {
    return null;
  }
  const entry = typeof report.entry === 'string' && report.entry !== '' ? { entry: report.entry } : {};
  if (report.kind === 'none') {
    return { kind: 'none' };
  }
  if (report.kind === 'too-large') {
    return { kind: 'too-large', ...entry };
  }
  if (report.kind !== 'stats' || typeof report.stats !== 'object' || report.stats === null) {
    return null;
  }
  const raw = report.stats as Record<string, unknown>;
  const stats = {} as MdzDocumentStats;
  for (const field of STATS_FIELDS) {
    const number = raw[field];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) {
      return null;
    }
    stats[field] = number;
  }
  return { kind: 'stats', stats, ...entry };
}

const formatNumber = (value: number): string => Math.round(value).toLocaleString('en-US');

/**
 * Icon ids contributed under `contributes.icons` in package.json; the glyphs
 * live in media/icons/mdzip-icons.woff (built from the mdzip-mark repo's font/).
 * A test keeps this list and package.json in step.
 */
export const MDZ_ICON_ID = 'mdzip-logo';
export const MARKDOWN_ICON_ID = 'mdzip-markdown';
export const CONTRIBUTED_ICON_IDS = [MDZ_ICON_ID, 'mdzip-logo-open', MARKDOWN_ICON_ID] as const;

/** Compact status bar text, e.g. `$(mdzip-logo) 1,234 words` (the icon stands in for the product name). */
export function formatStatsText(report: MdzStatsReport, iconId: string = MDZ_ICON_ID): string {
  if (report.kind === 'stats') {
    const { words } = report.stats;
    return `$(${iconId}) ${formatNumber(words)} ${words === 1 ? 'word' : 'words'}`;
  }
  return `$(${iconId}) large document`;
}

/** Escapes the characters Markdown would otherwise interpret in a file name. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}

/** Tooltip body (Markdown), one fact per line. */
export function formatStatsTooltip(report: MdzStatsReport, documentName: string): string {
  // Which file is counted: the file on disk, then (for an .mdz) the Markdown
  // entry inside it — the numbers are for that entry, not the whole archive.
  const heading = [`**${escapeMarkdown(documentName)}**`];
  if (report.kind !== 'none' && report.entry) {
    heading.push(`Document: ${escapeMarkdown(report.entry)}`);
  }
  if (report.kind !== 'stats') {
    return [
      ...heading,
      `Statistics are skipped above ${formatNumber(MAX_STATS_CHARS)} characters to keep typing responsive.`,
    ].join('  \n');
  }
  const s = report.stats;
  return [
    ...heading,
    `${formatNumber(s.words)} words`,
    `${formatNumber(s.characters)} characters (${formatNumber(s.charactersNoSpaces)} without spaces)`,
    `${formatNumber(s.lines)} lines`,
    `~${Math.max(1, Math.round(s.readingTimeMinutes))} min read at 200 wpm`,
  ].join('  \n');
}

/** Plain-text label for screen readers. */
export function formatStatsAccessibleLabel(report: MdzStatsReport): string {
  if (report.kind === 'stats') {
    const { words, lines } = report.stats;
    const name = report.entry ? ` ${report.entry}` : '';
    return `MDZip document${name}: ${formatNumber(words)} words, ${formatNumber(lines)} lines`;
  }
  return 'MDZip document statistics unavailable for a large document';
}
