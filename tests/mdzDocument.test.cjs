'use strict';
// Document lifecycle tests for MdzDocument.
// Runs in Node with a mocked vscode API — no Extension Development Host needed.
// The bundle at dist/test/mdzDocument.cjs is built by: npm run bundle:test-document

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

// _statReadOnly reads the real OS permission bit via Node's own fs.stat() on
// uri.fsPath (not vscode.workspace.fs.stat() — confirmed in a real extension
// host that its .permissions comes back undefined for a genuinely read-only
// local file on this vscode build). So these tests need a real file on disk,
// not just an entry in the mocked in-memory fs used elsewhere in this file.

/** Creates a real temp file (auto-cleaned by the OS temp dir; not removed per-test). */
function createRealFile(basename, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdzip-test-'));
  const filePath = path.join(dir, basename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function setRealReadOnly(filePath, readOnly) {
  fs.chmodSync(filePath, readOnly ? 0o444 : 0o666);
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

test('serialized .mdz workspace identifies packaged images missing from markdown', async () => {
  const { buildNewArchiveBytesWithTitle } = await import('@mdzip/editor');
  const markdown = [
    '# Images',
    '',
    '![One](images/one.png)',
    '![Two](images/two.png)',
    '![Three](images/three.png)',
    '',
  ].join('\n');
  const imageBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
  const archiveBytes = await buildNewArchiveBytesWithTitle(markdown, 'images', [
    { archivePath: 'images/one.png', fileBytes: imageBytes },
    { archivePath: 'images/two.png', fileBytes: imageBytes },
    { archivePath: 'images/three.png', fileBytes: imageBytes },
    { archivePath: 'images/unused-four.png', fileBytes: imageBytes },
    { archivePath: 'images/unused-five.png', fileBytes: imageBytes },
  ]);
  seedFs({ '/doc.mdz': archiveBytes });

  const doc = await MdzDocument.create(fakeUri('/doc.mdz'));
  const workspace = await doc.getSerializedWorkspace();

  assert.deepEqual(
    workspace.orphanedAssets.orphanedAssetPaths,
    ['images/unused-five.png', 'images/unused-four.png']
  );
  doc.dispose();
});

test('readOnly reflects the file system permission bit at open', async () => {
  const writablePath = createRealFile('writable.md', '# Hello\n');
  const lockedPath = createRealFile('locked.md', '# Hello\n');
  setRealReadOnly(lockedPath, true);
  seedFs({ [writablePath]: '# Hello\n', [lockedPath]: '# Hello\n' });

  const writable = await MdzDocument.create(fakeUri(writablePath));
  const locked = await MdzDocument.create(fakeUri(lockedPath));

  assert.equal(writable.readOnly, false);
  assert.equal(locked.readOnly, true);

  writable.dispose();
  locked.dispose();
  setRealReadOnly(lockedPath, false); // so the OS temp-dir cleanup can remove it
});

test('readOnly is refreshed on revert (attribute cleared while open)', async () => {
  const filePath = createRealFile('was-locked.md', '# Hello\n');
  setRealReadOnly(filePath, true);
  seedFs({ [filePath]: '# Hello\n' });

  const doc = await MdzDocument.create(fakeUri(filePath));
  assert.equal(doc.readOnly, true, 'should start read-only');

  setRealReadOnly(filePath, false);
  await doc.revert();
  assert.equal(doc.readOnly, false, 'revert should re-check and pick up the cleared attribute');

  doc.dispose();
});

test('readOnly clears after a successful save to the same path (proves current writability)', async () => {
  const { buildNewArchiveBytesWithTitle } = await import('@mdzip/editor');
  const archiveBytes = await buildNewArchiveBytesWithTitle('# Hello\n', 'hello');
  const filePath = createRealFile('stale-flag.mdz', archiveBytes);
  setRealReadOnly(filePath, true);
  seedFs({ [filePath]: archiveBytes }); // the mock's writeFile doesn't enforce real OS permissions

  const doc = await MdzDocument.create(fakeUri(filePath));
  assert.equal(doc.readOnly, true);

  await doc.save(); // succeeds against the mock regardless of the real read-only attribute
  assert.equal(doc.readOnly, false, 'a successful write is stronger evidence than a stale stat() result');

  doc.dispose();
  setRealReadOnly(filePath, false);
});
