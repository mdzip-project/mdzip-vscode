const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../dist/test/mdLinkedImage.cjs');

test('validateImageSubfolder accepts a single folder name only', () => {
  assert.equal(m.validateImageSubfolder('images'), undefined);
  assert.equal(m.validateImageSubfolder(' assets '), undefined);
  for (const bad of ['', '   ', '.', '..', 'a/b', 'a\\b', 'a:b', 'a*', '../up']) {
    assert.ok(m.validateImageSubfolder(bad), `should reject ${JSON.stringify(bad)}`);
  }
});

test('sanitizeImageFileName keeps the base name and replaces invalid characters', () => {
  assert.equal(m.sanitizeImageFileName('photo.png'), 'photo.png');
  assert.equal(m.sanitizeImageFileName('C:\\temp\\photo.png'), 'photo.png');
  assert.equal(m.sanitizeImageFileName('../../etc/passwd.png'), 'passwd.png');
  assert.equal(m.sanitizeImageFileName('a<b>c?.png'), 'a-b-c-.png');
  assert.equal(m.sanitizeImageFileName('..'), 'image');
  assert.equal(m.sanitizeImageFileName(''), 'image');
});

test('isImageFileName / imageMimeType', () => {
  assert.equal(m.isImageFileName('a.PNG'), true);
  assert.equal(m.isImageFileName('a.jpeg'), true);
  assert.equal(m.isImageFileName('a.txt'), false);
  assert.equal(m.isImageFileName('png'), false);
  assert.equal(m.imageMimeType('x.svg'), 'image/svg+xml');
  assert.equal(m.imageMimeType('x.JPG'), 'image/jpeg');
  assert.equal(m.imageMimeType('x.bin'), 'application/octet-stream');
});

test('uniqueImageFileName numbers collisions before the extension', async () => {
  const taken = new Set(['image.png', 'image-2.png']);
  assert.equal(await m.uniqueImageFileName('image.png', async (c) => taken.has(c)), 'image-3.png');
  assert.equal(await m.uniqueImageFileName('other.png', async (c) => taken.has(c)), 'other.png');
});

test('markdownImageReference builds an escaped, URL-encoded reference', () => {
  assert.equal(m.markdownImageReference('my-pic.png', 'images/my-pic.png'), '![my pic](images/my-pic.png)');
  assert.equal(m.markdownImageReference('a b (1).png', 'images/a b (1).png'), '![a b (1)](images/a%20b%20%281%29.png)');
  assert.equal(m.markdownImageReference('x[1].png', 'x[1].png'), '![x\\[1\\]](x%5B1%5D.png)');
});

test('parseMarkdownImageRequest validates the untrusted payload', () => {
  assert.deepEqual(m.parseMarkdownImageRequest({ requestId: 1, kind: 'image-picker' }), { requestId: 1, kind: 'image-picker' });
  assert.deepEqual(
    m.parseMarkdownImageRequest({ requestId: 2, kind: 'image-file', fileName: 'a.png', base64Data: 'AAAA' }),
    { requestId: 2, kind: 'image-file', fileName: 'a.png', base64Data: 'AAAA' }
  );
  for (const bad of [
    null, 'x', {}, { kind: 'image-picker' }, { requestId: NaN, kind: 'image-picker' },
    { requestId: 1, kind: 'other' },
    { requestId: 1, kind: 'image-file', fileName: 'a.png' },
    { requestId: 1, kind: 'image-file', fileName: 'a.png', base64Data: '' },
    { requestId: 1, kind: 'image-file', fileName: 5, base64Data: 'AAAA' },
    { requestId: 1, kind: 'image-file', fileName: 'x'.repeat(300), base64Data: 'AAAA' },
    { requestId: 1, kind: 'image-file', fileName: 'a.png', base64Data: 'A'.repeat(m.MAX_LINKED_IMAGE_BYTES * 2) },
  ]) {
    assert.equal(m.parseMarkdownImageRequest(bad), undefined, JSON.stringify(bad)?.slice(0, 60));
  }
});

test('relativeImagePath links only images inside the document folder', () => {
  assert.equal(m.relativeImagePath('/proj/docs', '/proj/docs/images/a.png'), 'images/a.png');
  assert.equal(m.relativeImagePath('/proj/docs/', '/proj/docs/a.png'), 'a.png');
  assert.equal(m.relativeImagePath('/proj/docs', '/proj/other/a.png'), undefined);
  assert.equal(m.relativeImagePath('/proj/docs', '/proj/docs-old/a.png'), undefined);
  assert.equal(m.relativeImagePath('/proj/docs', '/proj/docs'), undefined);
  assert.equal(m.relativeImagePath('/proj/docs', '/proj/docs/../x/a.png'), undefined);
  // Windows drive letters differ in case between VS Code URIs.
  assert.equal(m.relativeImagePath('/f:/proj/docs', '/F:/proj/docs/images/a.png'), 'images/a.png');
  assert.equal(m.relativeImagePath('/proj/docs', '/PROJ/docs/a.png'), undefined);
});

test('imageAltText / encodeImageSrc are the pieces markdownImageReference is built from', () => {
  assert.equal(m.imageAltText('my-pic_2.png'), 'my pic 2');
  assert.equal(m.encodeImageSrc('images/a b (1).png'), 'images/a%20b%20%281%29.png');
  assert.equal(m.markdownImageReference('my-pic.png', 'images/my pic.png'), '![my pic](images/my%20pic.png)');
});

test('parseMarkdownImageCommit validates the untrusted payload', () => {
  assert.deepEqual(m.parseMarkdownImageCommit({ requestId: 3, commit: true }), { requestId: 3, commit: true });
  assert.deepEqual(m.parseMarkdownImageCommit({ requestId: 3, commit: false }), { requestId: 3, commit: false });
  for (const bad of [null, 'x', {}, { requestId: 3 }, { commit: true }, { requestId: '3', commit: true }, { requestId: 3, commit: 'yes' }, { requestId: NaN, commit: true }]) {
    assert.equal(m.parseMarkdownImageCommit(bad), undefined, JSON.stringify(bad));
  }
});
