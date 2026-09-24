'use strict';
// Tests for the status bar document statistics (mdzip-vscode#12): the pure
// report parsing/formatting, the status bar item's visibility rules, and the
// contributed icon font its text depends on.
// Runs in Node with a mocked vscode API — no Extension Development Host needed.
// Bundles built by: npm run bundle:test-stats

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MAX_STATS_CHARS,
  buildStatsReport,
  MDZ_ICON_ID,
  MARKDOWN_ICON_ID,
  CONTRIBUTED_ICON_IDS,
  parseStatsReport,
  formatStatsText,
  formatStatsTooltip,
  formatStatsAccessibleLabel,
} = require('../dist/test/mdzStats.cjs');
const { MdzStatsStatusBar } = require('../dist/test/mdzStatsStatusBar.cjs');
const vscode = require('../tests/vscode-mock.cjs');

const STATS = { words: 1234, characters: 6890, charactersNoSpaces: 5600, lines: 88, readingTimeMinutes: 6.17 };
const REPORT = { kind: 'stats', stats: STATS };

// ── parseStatsReport ────────────────────────────────────────────────────────

test('parseStatsReport accepts a well-formed stats report', () => {
  assert.deepEqual(parseStatsReport({ kind: 'stats', stats: STATS }), REPORT);
});

test('parseStatsReport accepts the marker kinds', () => {
  assert.deepEqual(parseStatsReport({ kind: 'none' }), { kind: 'none' });
  assert.deepEqual(parseStatsReport({ kind: 'too-large' }), { kind: 'too-large' });
});

test('parseStatsReport drops unexpected extra fields instead of passing them through', () => {
  const parsed = parseStatsReport({ kind: 'stats', stats: { ...STATS, evil: 'x' }, extra: 1 });
  assert.deepEqual(parsed, REPORT);
});

test('parseStatsReport carries the archive entry being counted', () => {
  assert.deepEqual(parseStatsReport({ kind: 'stats', stats: STATS, entry: 'docs/chapter1.md' }), {
    kind: 'stats',
    stats: STATS,
    entry: 'docs/chapter1.md',
  });
  assert.deepEqual(parseStatsReport({ kind: 'too-large', entry: 'big.md' }), { kind: 'too-large', entry: 'big.md' });
  // An empty entry means "no entry", and a none report has nothing to name.
  assert.deepEqual(parseStatsReport({ kind: 'stats', stats: STATS, entry: '' }), REPORT);
  assert.deepEqual(parseStatsReport({ kind: 'none', entry: 'x.md' }), { kind: 'none' });
});

test('parseStatsReport rejects a malformed or oversized entry', () => {
  assert.equal(parseStatsReport({ kind: 'stats', stats: STATS, entry: 42 }), null);
  assert.equal(parseStatsReport({ kind: 'stats', stats: STATS, entry: { path: 'a.md' } }), null);
  assert.equal(parseStatsReport({ kind: 'stats', stats: STATS, entry: 'a'.repeat(1025) }), null);
  assert.notEqual(parseStatsReport({ kind: 'stats', stats: STATS, entry: 'a'.repeat(1024) }), null);
});

test('parseStatsReport rejects malformed payloads (the webview is untrusted input)', () => {
  for (const bad of [
    undefined,
    null,
    'stats',
    42,
    {},
    { kind: 'stats' },
    { kind: 'stats', stats: null },
    { kind: 'stats', stats: { ...STATS, words: '12' } },
    { kind: 'stats', stats: { ...STATS, words: -1 } },
    { kind: 'stats', stats: { ...STATS, lines: NaN } },
    { kind: 'stats', stats: { ...STATS, readingTimeMinutes: Infinity } },
    { kind: 'stats', stats: { words: 1 } },
    { kind: 'other' },
  ]) {
    assert.equal(parseStatsReport(bad), null, JSON.stringify(bad));
  }
});

// ── buildStatsReport (what the webview reports for the current snapshot) ────

const fakeStats = (text) => ({ ...STATS, words: text.split(/\s+/).filter(Boolean).length });
const snap = (over) => ({
  currentPathType: 'markdown',
  currentPath: 'docs/chapter1.md',
  currentText: 'one two three',
  sourceFormat: 'mdz',
  ...over,
});

test('buildStatsReport names the archive entry for an .mdz', () => {
  const report = buildStatsReport(snap({}), fakeStats);
  assert.equal(report.kind, 'stats');
  assert.equal(report.entry, 'docs/chapter1.md');
  assert.equal(report.stats.words, 3);
});

test('buildStatsReport leaves the entry off for a plain .md, whose entry name is synthetic', () => {
  const report = buildStatsReport(snap({ sourceFormat: 'markdown', currentPath: 'index.md' }), fakeStats);
  assert.equal(report.kind, 'stats');
  assert.equal(report.entry, undefined);
});

test('buildStatsReport reports nothing to count when a non-Markdown entry is selected', () => {
  assert.deepEqual(buildStatsReport(snap({ currentPathType: 'image', currentPath: 'logo.png' }), fakeStats), { kind: 'none' });
});

test('buildStatsReport skips counting a huge document but still names its entry', () => {
  let counted = false;
  const report = buildStatsReport(snap({ currentText: 'x'.repeat(MAX_STATS_CHARS + 1) }), () => {
    counted = true;
    return STATS;
  });
  assert.deepEqual(report, { kind: 'too-large', entry: 'docs/chapter1.md' });
  assert.equal(counted, false, 'the expensive count never ran');
});

test('buildStatsReport output survives the host-side validation unchanged', () => {
  for (const s of [snap({}), snap({ sourceFormat: 'markdown' }), snap({ currentPathType: 'binary' })]) {
    const sent = JSON.parse(JSON.stringify(buildStatsReport(s, fakeStats))); // what postMessage delivers
    assert.deepEqual(parseStatsReport(sent), sent, JSON.stringify(sent));
  }
});

// ── formatting ─────────────────────────────────────────────────────────────

test('formatStatsText leads with the icon (not the product name) and pluralizes', () => {
  assert.equal(formatStatsText(REPORT), '$(mdzip-logo) 1,234 words');
  assert.equal(formatStatsText({ kind: 'stats', stats: { ...STATS, words: 1 } }), '$(mdzip-logo) 1 word');
  assert.equal(formatStatsText({ kind: 'stats', stats: { ...STATS, words: 0 } }), '$(mdzip-logo) 0 words');
  assert.equal(formatStatsText({ kind: 'too-large' }), '$(mdzip-logo) large document');
});

test('formatStatsText takes the icon id, so .md documents can show the Markdown mark', () => {
  assert.equal(formatStatsText(REPORT, MARKDOWN_ICON_ID), '$(mdzip-markdown) 1,234 words');
  assert.equal(formatStatsText({ kind: 'too-large' }, MARKDOWN_ICON_ID), '$(mdzip-markdown) large document');
});

test('formatStatsTooltip lists every statistic and names the document', () => {
  const tooltip = formatStatsTooltip(REPORT, 'notes.mdz');
  assert.ok(tooltip.includes('**notes\\.mdz**'), tooltip);
  assert.match(tooltip, /1,234 words/);
  assert.match(tooltip, /6,890 characters \(5,600 without spaces\)/);
  assert.match(tooltip, /88 lines/);
  assert.match(tooltip, /~6 min read at 200 wpm/);
});

test('formatStatsTooltip names the archive entry being counted, under the archive name', () => {
  const tooltip = formatStatsTooltip({ ...REPORT, entry: 'docs/chapter_1.md' }, 'book.mdz');
  const lines = tooltip.split('  \n');
  assert.equal(lines[0], '**book\\.mdz**');
  assert.equal(lines[1], 'Document: docs/chapter\\_1\\.md');
  assert.equal(lines[2], '1,234 words');
});

test('formatStatsTooltip has no Document line for a plain .md (no entry)', () => {
  assert.ok(!formatStatsTooltip(REPORT, 'readme.md').includes('Document:'));
});

test('a skipped large document still says which entry it was', () => {
  const tooltip = formatStatsTooltip({ kind: 'too-large', entry: 'chat/2024.md' }, 'export.mdz');
  assert.ok(tooltip.includes('Document: chat/2024\\.md'), tooltip);
});

test('formatStatsTooltip escapes Markdown in the file name', () => {
  const tooltip = formatStatsTooltip(REPORT, 'a_b*c[1].md');
  assert.ok(tooltip.includes('a\\_b\\*c\\[1\\]\\.md'), tooltip);
});

test('formatStatsTooltip explains a skipped large document', () => {
  const tooltip = formatStatsTooltip({ kind: 'too-large' }, 'big.mdz');
  assert.match(tooltip, /skipped above 3,000,000 characters/);
  assert.equal(MAX_STATS_CHARS, 3_000_000);
});

test('formatStatsAccessibleLabel is plain text, and names the entry when there is one', () => {
  assert.equal(formatStatsAccessibleLabel(REPORT), 'MDZip document: 1,234 words, 88 lines');
  assert.equal(
    formatStatsAccessibleLabel({ ...REPORT, entry: 'docs/chapter1.md' }),
    'MDZip document docs/chapter1.md: 1,234 words, 88 lines'
  );
});

// ── the contributed icon font ───────────────────────────────────────────────
// The status bar text names icons ($(mdzip-logo)) that only render if
// package.json contributes them and the font file is really there. A typo in
// any of the three would silently show nothing, so pin them together.

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('every icon id the code can use is contributed by package.json', () => {
  for (const id of CONTRIBUTED_ICON_IDS) {
    assert.ok(manifest.contributes.icons[id], `contributes.icons has "${id}"`);
  }
  assert.ok(CONTRIBUTED_ICON_IDS.includes(MDZ_ICON_ID));
  assert.ok(CONTRIBUTED_ICON_IDS.includes(MARKDOWN_ICON_ID));
});

test('contributed icons point at a real WOFF file and valid, distinct codepoints', () => {
  const seen = new Set();
  for (const [id, icon] of Object.entries(manifest.contributes.icons)) {
    const { fontPath, fontCharacter } = icon.default;
    const file = path.join(ROOT, fontPath);
    assert.ok(fs.existsSync(file), `${id}: ${fontPath} exists`);
    assert.equal(fs.readFileSync(file).subarray(0, 4).toString('latin1'), 'wOFF', `${id}: is a WOFF file`);
    assert.match(fontCharacter, /^\\E[0-9A-F]{3}$/, `${id}: fontCharacter is a Private Use Area escape`);
    assert.ok(!seen.has(fontCharacter), `${id}: codepoint not reused`);
    seen.add(fontCharacter);
  }
});

test('the font file is not excluded from the VSIX by .vscodeignore', () => {
  const rules = fs
    .readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));
  // vsce ignores by glob; the ones that could swallow media/icons/*.woff:
  const swallowing = rules.filter((rule) => ['media/**', 'media/icons/**', '**/*.woff', '*.woff', 'media/icons/*.woff'].includes(rule));
  assert.deepEqual(swallowing, []);
});

// ── MdzStatsStatusBar ───────────────────────────────────────────────────────

const MDZ = 'mdzip.mdzEditor';
const MD = 'mdzip.mdEditor';
const uriOf = (p) => vscode.Uri.file(p);
const keyOf = (p) => uriOf(p).toString();

let bar;
let item;

function activate(input) {
  global.__vscodeMockActiveTab = input === undefined ? undefined : { input };
  global.__vscodeMockFireTabChange();
}

beforeEach(() => {
  global.__vscodeMockStatusBarItems.length = 0;
  global.__vscodeMockActiveTab = undefined;
  bar = new MdzStatsStatusBar([
    { viewType: MDZ, iconId: MDZ_ICON_ID },
    { viewType: MD, iconId: MARKDOWN_ICON_ID },
  ]);
  item = global.__vscodeMockStatusBarItems.at(-1);
});

test('the item is created hidden, right-aligned, and named for the status bar menu', () => {
  assert.equal(item.visible, false);
  assert.equal(item.alignment, vscode.StatusBarAlignment.Right);
  assert.equal(item.name, 'MDZip Document Statistics');
  assert.equal(item.id, 'mdzip.documentStats');
});

test('shows for the active MDZip custom editor tab once its stats are known', () => {
  activate(new vscode.TabInputCustom(uriOf('/docs/notes.mdz'), MDZ));
  assert.equal(item.visible, false, 'no report yet, so nothing to show');

  bar.update(keyOf('/docs/notes.mdz'), REPORT);
  assert.equal(item.visible, true);
  assert.equal(item.text, '$(mdzip-logo) 1,234 words');
  assert.ok(item.tooltip.value.includes('notes\\.mdz'), item.tooltip.value);
  assert.equal(item.accessibilityInformation.label, 'MDZip document: 1,234 words, 88 lines');
});

test('the tooltip follows the archive entry as it changes within the same .mdz', () => {
  activate(new vscode.TabInputCustom(uriOf('/docs/book.mdz'), MDZ));
  bar.update(keyOf('/docs/book.mdz'), { ...REPORT, entry: 'ch1.md' });
  assert.ok(item.tooltip.value.includes('Document: ch1\\.md'), item.tooltip.value);

  bar.update(keyOf('/docs/book.mdz'), { kind: 'stats', stats: { ...STATS, words: 9 }, entry: 'ch2.md' });
  assert.ok(item.tooltip.value.includes('Document: ch2\\.md'), item.tooltip.value);
  assert.ok(!item.tooltip.value.includes('ch1'), 'the previous entry is gone');
  assert.equal(item.text, '$(mdzip-logo) 9 words');
});

test('a .md opened in the MDZip editor shows the Markdown mark instead of the MDZip one', () => {
  activate(new vscode.TabInputCustom(uriOf('/docs/readme.md'), MD));
  bar.update(keyOf('/docs/readme.md'), REPORT);
  assert.equal(item.visible, true);
  assert.equal(item.text, '$(mdzip-markdown) 1,234 words');
});

test('hides when the active tab is anything else (text editor, webview, diff, nothing)', () => {
  activate(new vscode.TabInputCustom(uriOf('/docs/notes.mdz'), MDZ));
  bar.update(keyOf('/docs/notes.mdz'), REPORT);
  assert.equal(item.visible, true);

  activate({ uri: uriOf('/src/index.ts') }); // TabInputText-like: not a custom editor
  assert.equal(item.visible, false);

  activate(new vscode.TabInputCustom(uriOf('/docs/notes.mdz'), MDZ));
  assert.equal(item.visible, true);

  activate({ original: uriOf('/a.md'), modified: uriOf('/b.md') }); // TabInputTextDiff-like
  assert.equal(item.visible, false);

  activate(new vscode.TabInputCustom(uriOf('/docs/notes.mdz'), MDZ));
  activate(undefined); // no open editors at all
  assert.equal(item.visible, false);
});

test('ignores custom editors that belong to other extensions', () => {
  activate(new vscode.TabInputCustom(uriOf('/docs/notes.mdz'), 'someone.elseEditor'));
  bar.update(keyOf('/docs/notes.mdz'), REPORT);
  assert.equal(item.visible, false);
});

test('never shows one document\'s numbers while another is in front', () => {
  bar.update(keyOf('/a.mdz'), REPORT);
  bar.update(keyOf('/b.mdz'), { kind: 'stats', stats: { ...STATS, words: 7 } });

  activate(new vscode.TabInputCustom(uriOf('/a.mdz'), MDZ));
  assert.equal(item.text, '$(mdzip-logo) 1,234 words');

  activate(new vscode.TabInputCustom(uriOf('/b.mdz'), MDZ));
  assert.equal(item.text, '$(mdzip-logo) 7 words');
});

test('a document with no report of its own hides the item rather than keeping the previous one\'s', () => {
  bar.update(keyOf('/a.mdz'), REPORT);
  activate(new vscode.TabInputCustom(uriOf('/a.mdz'), MDZ));
  assert.equal(item.visible, true);

  activate(new vscode.TabInputCustom(uriOf('/fresh.mdz'), MDZ));
  assert.equal(item.visible, false);
});

test('forget() hides the item for a closed document, even if its tab still reads as active', () => {
  activate(new vscode.TabInputCustom(uriOf('/a.mdz'), MDZ));
  bar.update(keyOf('/a.mdz'), REPORT);
  assert.equal(item.visible, true);

  bar.forget(keyOf('/a.mdz'));
  assert.equal(item.visible, false);
});

test('a "none" report (e.g. an image entry selected) hides the item', () => {
  activate(new vscode.TabInputCustom(uriOf('/a.mdz'), MDZ));
  bar.update(keyOf('/a.mdz'), REPORT);
  assert.equal(item.visible, true);

  bar.update(keyOf('/a.mdz'), { kind: 'none' });
  assert.equal(item.visible, false);
});

test('a too-large report shows the explanatory text instead of numbers', () => {
  activate(new vscode.TabInputCustom(uriOf('/big.mdz'), MDZ));
  bar.update(keyOf('/big.mdz'), { kind: 'too-large' });
  assert.equal(item.visible, true);
  assert.equal(item.text, '$(mdzip-logo) large document');
});

test('dispose() removes the item and stops reacting to tab changes', () => {
  activate(new vscode.TabInputCustom(uriOf('/a.mdz'), MDZ));
  bar.update(keyOf('/a.mdz'), REPORT);
  assert.equal(item.visible, true);

  bar.dispose();
  assert.equal(item.disposed, true);
  assert.equal(item.visible, false);

  // Nothing may touch the disposed item afterwards.
  item.visible = 'sentinel';
  activate(new vscode.TabInputCustom(uriOf('/a.mdz'), MDZ));
  assert.equal(item.visible, 'sentinel');
});
