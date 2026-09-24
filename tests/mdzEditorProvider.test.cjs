'use strict';
// Tests for mdzEditorProvider.ts's pure helpers.
// Runs in Node with a mocked vscode API — no Extension Development Host needed.
// The bundle at dist/test/mdzEditorProvider.cjs is built by: npm run bundle:test-editor-provider

const { test } = require('node:test');
const assert = require('node:assert/strict');

global.__vscodeMockFiles = new Map();

const { decodeWorkspaceLinkHref } = require('../dist/test/mdzEditorProvider.cjs');

// ── decodeWorkspaceLinkHref ─────────────────────────────────────────────────
// Feeds mdzip-vscode#13's 'openExternalLink' message handler: the href comes
// straight from @mdzip/editor's onUnresolvedLinkClick (see its own tests for
// which hrefs reach that hook at all — this only covers cleaning one up
// before it's joined against the document's on-disk directory).

test('strips a #fragment suffix', () => {
  assert.equal(decodeWorkspaceLinkHref('../README.md#install'), '../README.md');
});

test('strips a ?query suffix', () => {
  assert.equal(decodeWorkspaceLinkHref('./docs/guide.md?utm_source=x'), './docs/guide.md');
});

test('strips both, hash first', () => {
  assert.equal(decodeWorkspaceLinkHref('notes.md?x=1#section'), 'notes.md');
});

test('percent-decodes the path', () => {
  assert.equal(decodeWorkspaceLinkHref('My%20Notes/chapter%201.md'), 'My Notes/chapter 1.md');
});

test('a malformed percent-escape falls back to the undecoded string instead of throwing', () => {
  assert.equal(decodeWorkspaceLinkHref('bad%escape.md'), 'bad%escape.md');
});

test('returns null for an empty href', () => {
  assert.equal(decodeWorkspaceLinkHref(''), null);
});

test('returns null when only a fragment/query remains', () => {
  assert.equal(decodeWorkspaceLinkHref('#section'), null);
  assert.equal(decodeWorkspaceLinkHref('?x=1'), null);
});

test('preserves a trailing slash (folder-shaped links resolve by stat, not by this)', () => {
  assert.equal(decodeWorkspaceLinkHref('./docs/'), './docs/');
});
