const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildNewArchiveBytesWithTitle,
  findOrphanedAssetPathsInArchive,
  isImagePath,
  openMdzArchive,
  readBinaryFileFromArchive,
  readTextFileFromArchive,
  removeFilesFromArchive,
  updateBinaryInArchive,
  updateManifestTitleInArchive,
  updateMarkdownInArchive,
} = require('../dist/test/mdzArchiveUtils.js');
const {
  displayTitleFromManifest,
  fileBaseNameFromPath,
  firstMarkdownHeading,
  suggestedTitleFromMarkdown,
} = require('../dist/test/shared/editorMetadata.js');

const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64'
  )
);

test('builds and opens archives with manifest metadata, markdown, and referenced assets', async () => {
  const bytes = await buildNewArchiveBytesWithTitle(
    '# Archive Title\n\n![Logo](images/logo.png)\n',
    'Fixture Title',
    [{ archivePath: 'images/logo.png', fileBytes: PNG_1X1 }]
  );

  const archive = await openMdzArchive(bytes);

  assert.equal(archive.entryPoint, 'index.md');
  assert.equal(archive.manifest.title, 'Fixture Title');
  assert.equal(archive.markdownText, '# Archive Title\n\n![Logo](images/logo.png)\n');
  assert.deepEqual(
    archive.paths.map((entry) => entry.path).sort(),
    ['images/logo.png', 'index.md', 'manifest.json']
  );
  assert.equal(archive.images.get('images/logo.png').startsWith('data:image/png;base64,'), true);
  assert.deepEqual(archive.orphanedAssetPaths, []);
});

test('updates text, binary assets, manifest title, and orphaned assets without corrupting the archive', async () => {
  const initialBytes = await buildNewArchiveBytesWithTitle('# Original\n', 'Original Title');
  const updatedMarkdownBytes = await updateMarkdownInArchive(initialBytes, 'index.md', '# Updated\n');

  assert.equal(await readTextFileFromArchive(updatedMarkdownBytes, 'index.md'), '# Updated\n');

  const withAssetBytes = await updateBinaryInArchive(
    updatedMarkdownBytes,
    'images/unused.png',
    PNG_1X1
  );
  assert.deepEqual(await readBinaryFileFromArchive(withAssetBytes, 'images/unused.png'), PNG_1X1);
  assert.deepEqual(await findOrphanedAssetPathsInArchive(withAssetBytes, 'index.md'), [
    'images/unused.png',
  ]);

  const titledBytes = await updateManifestTitleInArchive(withAssetBytes, 'Renamed Title');
  assert.equal((await openMdzArchive(titledBytes)).manifest.title, 'Renamed Title');

  const withoutAssetBytes = await removeFilesFromArchive(titledBytes, ['images/unused.png']);
  await assert.rejects(
    () => readBinaryFileFromArchive(withoutAssetBytes, 'images/unused.png'),
    /Archive file "images\/unused\.png" not found/
  );
});

test('classifies image paths and derives editor metadata', () => {
  assert.equal(isImagePath('diagram.PNG'), true);
  assert.equal(isImagePath('notes.md'), false);

  assert.equal(firstMarkdownHeading('intro\n\n## Real Title ##\n'), 'Real Title');
  assert.equal(fileBaseNameFromPath('/workspace/docs/example.mdz'), 'example');
  assert.equal(suggestedTitleFromMarkdown('# From Heading\n', 'fallback'), 'From Heading');
  assert.equal(suggestedTitleFromMarkdown('No heading\n', 'fallback'), 'fallback');
  assert.equal(displayTitleFromManifest('  Manifest Title  ', 'fallback'), 'Manifest Title');
  assert.equal(displayTitleFromManifest('   ', 'fallback'), 'fallback');
});
