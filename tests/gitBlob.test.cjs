const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isZipBytes, parseGitUriQuery, blobObjectName, readGitBlob } = require('../dist/test/gitBlob.cjs');

// A small "archive": the ZIP signature plus bytes that aren't valid UTF-8, so
// any text conversion along the way would change them.
const committed = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x0d, 0x0a, 0x80, 0x01]);
const staged = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x02, 0xfe, 0x0a]);

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd });
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdzip-git-blob-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.org');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'core.autocrlf', 'false');
  // Stands in for `mdz textconv`: prints something that isn't the archive.
  git(root, 'config', 'diff.mdz.textconv', 'node -e "process.stdout.write(\'===== manifest.json =====\\n\')"');
  fs.writeFileSync(path.join(root, '.gitattributes'), '*.mdz diff=mdz\n');
  fs.mkdirSync(path.join(root, 'docs sub'));
  fs.writeFileSync(path.join(root, 'docs sub', 'guide.mdz'), committed);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'one');
  return root;
}

test('isZipBytes', () => {
  assert.equal(isZipBytes(committed), true);
  assert.equal(isZipBytes(Buffer.from([0x50, 0x4b, 0x05, 0x06])), true);
  assert.equal(isZipBytes(Buffer.from('===== manifest.json =====\n')), false);
  assert.equal(isZipBytes(new Uint8Array(0)), false);
});

test('parseGitUriQuery', () => {
  assert.deepEqual(parseGitUriQuery('{"path":"C:\\\\r\\\\a.mdz","ref":"HEAD"}'), { path: 'C:\\r\\a.mdz', ref: 'HEAD' });
  assert.deepEqual(parseGitUriQuery('{"path":"/r/a.mdz","ref":"~"}'), { path: '/r/a.mdz', ref: '~' });
  assert.deepEqual(parseGitUriQuery('{"path":"/r/a.mdz"}'), { path: '/r/a.mdz', ref: 'HEAD' });
  assert.equal(parseGitUriQuery(''), undefined);
  assert.equal(parseGitUriQuery('{"ref":"HEAD"}'), undefined);
});

test('blobObjectName', () => {
  assert.equal(blobObjectName('HEAD', path.join('r', 'docs', 'a.mdz')), 'HEAD:./a.mdz');
  assert.equal(blobObjectName('abc123', path.join('r', 'a.mdz')), 'abc123:./a.mdz');
  assert.equal(blobObjectName('~', path.join('r', 'a.mdz')), ':./a.mdz');
  assert.equal(blobObjectName('', path.join('r', 'a.mdz')), ':./a.mdz');
});

test('readGitBlob returns the raw archive where git show --textconv returns text', async () => {
  const root = makeRepo();
  const file = path.join(root, 'docs sub', 'guide.mdz');
  try {
    // What VS Code's Git extension reads: the textconv output, not the archive.
    const viaShow = git(root, 'show', '--textconv', 'HEAD:docs sub/guide.mdz');
    assert.equal(isZipBytes(viaShow), false);

    assert.deepEqual(await readGitBlob('git', 'HEAD', file), committed);

    fs.writeFileSync(file, staged);
    git(root, 'add', '-A');
    assert.deepEqual(await readGitBlob('git', '~', file), staged);
    assert.deepEqual(await readGitBlob('git', '', file), staged);
    assert.deepEqual(await readGitBlob('git', 'HEAD', file), committed);

    await assert.rejects(readGitBlob('git', 'HEAD', path.join(root, 'docs sub', 'missing.mdz')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
