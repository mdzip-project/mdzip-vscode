'use strict';
// Document lifecycle tests for MdzDocument.
// Runs in Node with a mocked vscode API — no Extension Development Host needed.
// The bundle at dist/test/mdzDocument.cjs is built by: npm run bundle:test-document

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ── Bootstrap ──────────────────────────────────────────────────────────────
// Global file map must exist before the bundle loads (the mock reads it at call time,
// but initialising it here keeps the intent clear and avoids any lazy-init surprises).
global.__vscodeMockFiles = new Map();

const { MdzDocument } = require('../dist/test/mdzDocument.cjs');

// ── Helpers ────────────────────────────────────────────────────────────────

const enc = (text) => new TextEncoder().encode(text);

/** Replace the in-memory file system. Values may be strings (→ UTF-8) or Uint8Array. */
function seedFs(entries) {
  const map = new Map();
  for (const [k, v] of Object.entries(entries)) {
    map.set(k, typeof v === 'string' ? enc(v) : v);
  }
  global.__vscodeMockFiles = map;
  return map;
}

/** Current bytes on disk for the given path. */
function diskRead(posixPath) {
  return global.__vscodeMockFiles.get(posixPath);
}

/** Minimal Uri-like object the bundle will accept (scheme, path, fsPath, toString, with). */
function fakeUri(posixPath) {
  return {
    scheme: 'file',
    path: posixPath,
    fsPath: posixPath,
    toString() { return `file://${posixPath}`; },
    with(changes) { return fakeUri(changes.path ?? posixPath); },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('open .md file — starts clean (not dirty)', async () => {
  seedFs({ '/doc.md': '# Hello\n' });
  const doc = await MdzDocument.create(fakeUri('/doc.md'));
  assert.equal(doc.isDirty, false);
  doc.dispose();
});

test('markDirty makes isDirty true', async () => {
  seedFs({ '/doc.md': '# Hello\n' });
  const doc = await MdzDocument.create(fakeUri('/doc.md'));
  doc.markDirty();
  assert.equal(doc.isDirty, true);
  doc.dispose();
});

test('save without webview bytes writes something non-empty to disk', async () => {
  seedFs({ '/doc.md': '# Hello\n' });
  const doc = await MdzDocument.create(fakeUri('/doc.md'));
  await doc.save();
  const saved = diskRead('/doc.md');
  assert.ok(saved && saved.length > 0, 'should write non-empty bytes');
  doc.dispose();
});

test('save writes webview bytes, not the original service bytes', async () => {
  // This is the regression test for the save bug: edits were lost because
  // saveAs() called _service.saveToBytes() (original) instead of webview bytes.
  const original = enc('# Original\n\nBefore edits.\n');
  const edited   = enc('# Edited\n\nAfter edits.\n');
  seedFs({ '/doc.md': original });

  const doc = await MdzDocument.create(fakeUri('/doc.md'));
  assert.equal(doc.isDirty, false);

  doc.updateFromWebview(edited);
  doc.markDirty();
  assert.equal(doc.isDirty, true);

  await doc.save();
  assert.equal(doc.isDirty, false);

  const saved = diskRead('/doc.md');
  assert.deepEqual(saved, edited, 'save must write the webview bytes, not the original');
  doc.dispose();
});

test('save writes to a different target (saveAs)', async () => {
  const original = enc('# Source\n');
  const edited   = enc('# Destination\n');
  seedFs({ '/src.md': original, '/dst.md': new Uint8Array(0) });

  const doc = await MdzDocument.create(fakeUri('/src.md'));
  doc.updateFromWebview(edited);
  doc.markDirty();

  // saveAs to a different path: only the target should be written with webview bytes
  await doc.saveAs(fakeUri('/dst.md'));

  const dstBytes = diskRead('/dst.md');
  assert.deepEqual(dstBytes, edited, 'saveAs must write webview bytes to the target');
  doc.dispose();
});

test('revert clears pending webview bytes so next save uses service bytes', async () => {
  const original = enc('# Original\n');
  const edited   = enc('# Edited content that should be discarded on revert\n');
  seedFs({ '/doc.md': original });

  const doc = await MdzDocument.create(fakeUri('/doc.md'));
  doc.updateFromWebview(edited);
  doc.markDirty();
  assert.equal(doc.isDirty, true);

  await doc.revert();
  assert.equal(doc.isDirty, false, 'isDirty must be false after revert');

  await doc.save();

  // After revert, save must NOT write the stale pre-revert webview bytes.
  const saved = diskRead('/doc.md');
  assert.notDeepEqual(saved, edited, 'post-revert save must not use stale webview bytes');
  doc.dispose();
});

test('open .mdz file — starts clean', async () => {
  // Build a real .mdz archive in-process so the parser accepts it.
  const { buildNewArchiveBytesWithTitle } = await import('@mdzip/editor');
  const archiveBytes = await buildNewArchiveBytesWithTitle('# Hello\n', 'hello');
  seedFs({ '/doc.mdz': archiveBytes });

  const doc = await MdzDocument.create(fakeUri('/doc.mdz'));
  assert.equal(doc.isDirty, false);
  doc.dispose();
});

test('.mdz save writes webview bytes, not original archive', async () => {
  const { buildNewArchiveBytesWithTitle } = await import('@mdzip/editor');
  const originalBytes = await buildNewArchiveBytesWithTitle('# Original\n', 'orig');
  const editedBytes   = await buildNewArchiveBytesWithTitle('# Edited\n',   'edit');
  seedFs({ '/doc.mdz': originalBytes });

  const doc = await MdzDocument.create(fakeUri('/doc.mdz'));
  assert.equal(doc.isDirty, false);

  doc.updateFromWebview(editedBytes);
  doc.markDirty();

  await doc.save();
  assert.equal(doc.isDirty, false);

  const saved = diskRead('/doc.mdz');
  assert.deepEqual(saved, editedBytes, '.mdz save must write the webview bytes');
  doc.dispose();
});
