const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let mdzipCorePromise;

function getMdzipCore() {
  mdzipCorePromise ||= import('@mdzip/core-js');
  return mdzipCorePromise;
}

async function main() {
  const root = process.cwd();
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mdzip-mcp-smoke-'));

  try {
    const fixtures = await createFixtures(fixtureRoot);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, 'dist', 'mdz-mcp-server.js')],
      cwd: root,
      stderr: 'pipe',
    });

    if (transport.stderr) {
      transport.stderr.on('data', () => {
        // Keep stderr drained; test output focuses on assertions.
      });
    }

    const client = new Client(
      {
        name: 'mdzip-mcp-smoke',
        version: '0.1.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);

    try {
      await testCanonicalManifestRead(client, fixtures.canonicalSingle);
      await testArchiveTextSearch(client, fixtures.canonicalSingle);
      await testAmbiguousReadError(client, fixtures.ambiguousMultiMarkdown);
      await testCanonicalWriteSuccess(client, fixtures.canonicalSingle);
      await testCanonicalWriteConflict(client, fixtures.canonicalSingle);
      await testCanonicalWriteMissingEntrypoint(client, fixtures.fallbackSingleMarkdown);
      await testCanonicalWriteAmbiguousEntrypoint(client, fixtures.ambiguousMultiMarkdown);
      await testCanonicalWriteNoMarkdownEntries(client, fixtures.noMarkdown);
      await testErrorPayloadConsistency(client, fixtures.canonicalSingle);
      await testHtmlImgTagReferencedImages(client, fixtures.htmlImageOnly);
      await testWriteEntry(client, fixtureRoot);
      await testWriteEntryGuards(client, fixtureRoot);
      await testWriteEntryKeepsImpliedEntryPoint(client, fixtures.fallbackSingleMarkdown);
      await testRemoveEntry(client, fixtureRoot);
      console.log('MCP smoke tests passed: T1, T2, T4, T5, T6, T7, T8, T9, T10, T-img, T-write, T-write-guards, T-write-entrypoint, T-remove');
    } finally {
      await client.close();
    }
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
}

async function createFixtures(fixtureRoot) {
  const canonicalSingle = path.join(fixtureRoot, 'canonical-single.mdz');
  const fallbackSingleMarkdown = path.join(fixtureRoot, 'fallback-single-markdown.mdz');
  const ambiguousMultiMarkdown = path.join(fixtureRoot, 'ambiguous-multi-markdown.mdz');
  const noMarkdown = path.join(fixtureRoot, 'no-markdown.mdz');

  const canonicalBytes = await buildCanonicalArchive('# Canonical\n\nHello canonical.\n');
  await fs.writeFile(canonicalSingle, canonicalBytes);

  const fallbackBytes = await stripManifestEntrypoint(canonicalBytes);
  await fs.writeFile(fallbackSingleMarkdown, fallbackBytes);

  const ambiguousBytes = await addMarkdownAndStripEntrypoint(canonicalBytes, 'notes/chapter.md', '# Chapter\n\nAlt');
  await fs.writeFile(ambiguousMultiMarkdown, ambiguousBytes);

  const noMarkdownBytes = await removeAllMarkdownAndEntrypoint(canonicalBytes);
  await fs.writeFile(noMarkdown, noMarkdownBytes);

  const htmlImageOnly = path.join(fixtureRoot, 'html-image-only.mdz');
  const htmlImageOnlyBytes = await buildHtmlImageOnlyArchive();
  await fs.writeFile(htmlImageOnly, htmlImageOnlyBytes);

  return {
    canonicalSingle,
    fallbackSingleMarkdown,
    ambiguousMultiMarkdown,
    noMarkdown,
    htmlImageOnly,
  };
}

async function buildHtmlImageOnlyArchive() {
  const { MdzPackagerCore, MdzArchiveCore } = await getMdzipCore();
  const result = await MdzPackagerCore.buildArchive(
    [
      {
        path: 'index.md',
        text: '# HTML image\n\n<img src="assets/diagram.png" width="200">\n',
      },
      { path: 'assets/diagram.png', bytes: new Uint8Array([1, 2, 3, 4]) },
    ],
    'document',
    {
      createIndex: false,
      mapFiles: false,
      filters: MdzPackagerCore.DEFAULT_FILTERS,
      mode: 'document',
      entryPoint: 'index.md',
      title: 'html-image-only',
    }
  );

  const bytes = Buffer.from(await result.blob.arrayBuffer());
  // Sanity check the fixture itself carries the asset before it's used to
  // exercise the MCP tool.
  const archive = await MdzArchiveCore.open(bytes);
  assert.ok(archive.hasEntry('assets/diagram.png'), 'fixture should include the image asset');
  return bytes;
}

async function buildCanonicalArchive(markdown) {
  const { MdzPackagerCore } = await getMdzipCore();
  const result = await MdzPackagerCore.buildArchive(
    [{ path: 'index.md', text: markdown }],
    'document',
    {
      createIndex: false,
      mapFiles: false,
      filters: MdzPackagerCore.DEFAULT_FILTERS,
      mode: 'document',
      entryPoint: 'index.md',
      title: 'canonical-single',
    }
  );

  return Buffer.from(await result.blob.arrayBuffer());
}

// Rewrites manifest.json without entryPoint at the ZIP level. @mdzip/core-js 2.0.1+ won't save
// such a manifest: a conforming producer records the entry point (spec 1.2.0 section 14.1).
async function stripManifestEntrypoint(archiveBytes) {
  const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate');
  const entries = unzipSync(new Uint8Array(archiveBytes));
  const manifest = JSON.parse(strFromU8(entries['manifest.json']));
  delete manifest.entryPoint;
  entries['manifest.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  return Buffer.from(zipSync(entries));
}

async function addMarkdownAndStripEntrypoint(archiveBytes, markdownPath, markdownText) {
  const { MdzArchiveCore } = await getMdzipCore();
  const withMarkdown = await MdzArchiveCore.addFile(archiveBytes, markdownPath, markdownText);
  const bytes = Buffer.from(await withMarkdown.blob.arrayBuffer());

  return stripManifestEntrypoint(bytes);
}

async function removeAllMarkdownAndEntrypoint() {
  const { MdzPackagerCore } = await getMdzipCore();
  const result = await MdzPackagerCore.buildArchive(
    [{ path: 'notes.txt', text: 'This archive intentionally has no markdown entries.\n' }],
    'no-markdown',
    {
      createIndex: false,
      mapFiles: false,
      filters: ['*.txt'],
      mode: 'document',
      entryPoint: null,
      title: 'no-markdown',
    }
  );

  return Buffer.from(await result.blob.arrayBuffer());
}

async function testCanonicalManifestRead(client, archivePath) {
  const result = await client.callTool({
    name: 'mdz_review_document',
    arguments: { archivePath },
  });

  assert.ok(!result.isError, 'mdz_review_document should succeed for canonical archive');
  const metadata = parseFirstTextJson(result);

  assert.equal(metadata.entrypointSource, 'manifest');
  assert.equal(metadata.isCanonicalRead, true);
  assert.equal(metadata.isAmbiguous, false);
  assert.equal(metadata.resolvedMarkdownPath, metadata.canonicalEntrypointPath);
  assert.equal(typeof metadata.canonicalContentHash, 'string');
  assert.ok(metadata.canonicalContentHash.length > 0, 'canonicalContentHash should be non-empty');
  assert.ok(
    String(metadata.recommendedNextAction || '').includes('upsert_canonical_document'),
    'recommendedNextAction should mention upsert_canonical_document'
  );
}

async function testAmbiguousReadError(client, archivePath) {
  const result = await client.callTool({
    name: 'mdz_review_document',
    arguments: { archivePath },
  });

  assert.equal(result.isError, true, 'ambiguous archive should return structured error');
  const payload = parseErrorPayload(result);

  assert.equal(payload.code, 'AMBIGUOUS_MARKDOWN_ENTRYPOINT');
  assert.ok(Array.isArray(payload.candidatePaths), 'candidatePaths should be present for ambiguity');
  assert.ok(String(payload.nextAction || '').includes('manifest.entryPoint'));
}

async function testArchiveTextSearch(client, archivePath) {
  const result = await client.callTool({
    name: 'mdz_search_text',
    arguments: {
      archivePath,
      query: 'hello canonical',
    },
  });

  assert.ok(!result.isError, 'mdz_search_text should succeed for canonical archive');
  const payload = parseFirstTextJson(result);

  assert.equal(payload.matchCount, 1);
  assert.equal(payload.matches[0].path, 'index.md');
  assert.equal(payload.matches[0].lineNumber, 3);
  assert.ok(payload.matches[0].snippet.includes('Hello canonical.'));

  const regexResult = await client.callTool({
    name: 'mdz_search_text',
    arguments: {
      archivePath,
      query: 'canonical\\.$',
      regex: true,
      caseSensitive: false,
    },
  });

  assert.ok(!regexResult.isError, 'mdz_search_text regex search should succeed');
  const regexPayload = parseFirstTextJson(regexResult);
  assert.equal(regexPayload.matchCount, 1);
}

async function testCanonicalWriteSuccess(client, canonicalArchivePath) {
  const nextMarkdown = '# Canonical\n\nUpdated by smoke test.\n';

  const preRead = await client.callTool({
    name: 'mdz_review_document',
    arguments: { archivePath: canonicalArchivePath },
  });
  assert.ok(!preRead.isError);
  const { canonicalContentHash } = parseFirstTextJson(preRead);

  const writeResult = await client.callTool({
    name: 'upsert_canonical_document',
    arguments: {
      archivePath: canonicalArchivePath,
      content: nextMarkdown,
      expectedContentHash: canonicalContentHash,
    },
  });

  assert.ok(!writeResult.isError, 'upsert_canonical_document should succeed for canonical archive');
  const writePayload = parseFirstTextJson(writeResult);

  assert.equal(writePayload.canonicalEntrypointPath, 'index.md');
  assert.deepEqual(writePayload.changedPaths, ['index.md']);
  assert.equal(typeof writePayload.postWriteValidation?.isValid, 'boolean');

  const reread = await client.callTool({
    name: 'mdz_review_document',
    arguments: { archivePath: canonicalArchivePath },
  });
  assert.ok(!reread.isError);
  const allText = extractAllTextContent(reread);
  assert.ok(
    allText.some((value) => value.includes('Updated by smoke test.')),
    'updated markdown must be readable after canonical write'
  );
}

async function testCanonicalWriteConflict(client, canonicalArchivePath) {
  const preRead = await client.callTool({
    name: 'mdz_review_document',
    arguments: { archivePath: canonicalArchivePath },
  });
  assert.ok(!preRead.isError);
  const { canonicalContentHash: staleHash } = parseFirstTextJson(preRead);

  // Simulate an edit landing from elsewhere (e.g. the VS Code editor) between
  // the read above and the write below.
  const outOfBand = await client.callTool({
    name: 'upsert_canonical_document',
    arguments: {
      archivePath: canonicalArchivePath,
      content: '# Canonical\n\nChanged out of band.\n',
      expectedContentHash: staleHash,
    },
  });
  assert.ok(!outOfBand.isError, 'setup write for conflict test should succeed');

  const staleWrite = await client.callTool({
    name: 'upsert_canonical_document',
    arguments: {
      archivePath: canonicalArchivePath,
      content: '# Canonical\n\nThis should not land.\n',
      expectedContentHash: staleHash,
    },
  });

  assert.equal(staleWrite.isError, true, 'write with a stale content hash must be rejected');
  const payload = parseErrorPayload(staleWrite);
  assert.equal(payload.code, 'CONTENT_CONFLICT');
  assert.ok(String(payload.nextAction || '').includes('mdz_review_document'));

  const reread = await client.callTool({
    name: 'mdz_review_document',
    arguments: { archivePath: canonicalArchivePath },
  });
  assert.ok(!reread.isError);
  const allText = extractAllTextContent(reread);
  assert.ok(
    allText.some((value) => value.includes('Changed out of band.')),
    'out-of-band content must survive a rejected stale write'
  );
  assert.ok(
    !allText.some((value) => value.includes('This should not land.')),
    'rejected write must not be applied'
  );

  const missingHash = await client.callTool({
    name: 'upsert_canonical_document',
    arguments: {
      archivePath: canonicalArchivePath,
      content: '# Canonical\n\nNo hash supplied.\n',
    },
  });
  assert.equal(missingHash.isError, true, 'write without expectedContentHash must be rejected');
  const missingHashPayload = parseErrorPayload(missingHash);
  assert.equal(missingHashPayload.code, 'MISSING_EXPECTED_CONTENT_HASH');
}

async function testCanonicalWriteMissingEntrypoint(client, archivePath) {
  const result = await client.callTool({
    name: 'upsert_canonical_document',
    arguments: {
      archivePath,
      content: '# New content',
    },
  });

  assert.equal(result.isError, true, 'missing canonical entrypoint should return structured error');
  const payload = parseErrorPayload(result);
  assert.equal(payload.code, 'MISSING_CANONICAL_ENTRYPOINT');
  assert.ok(String(payload.nextAction || '').includes('manifest.entryPoint'));
  assert.ok(Array.isArray(payload.candidatePaths));
  assert.equal(payload.candidatePaths.length, 1);
}

async function testCanonicalWriteAmbiguousEntrypoint(client, archivePath) {
  const result = await client.callTool({
    name: 'upsert_canonical_document',
    arguments: {
      archivePath,
      content: '# New content',
    },
  });

  assert.equal(result.isError, true, 'ambiguous canonical entrypoint should return structured error');
  const payload = parseErrorPayload(result);
  assert.equal(payload.code, 'AMBIGUOUS_CANONICAL_ENTRYPOINT');
  assert.ok(String(payload.nextAction || '').includes('manifest.entryPoint'));
  assert.ok(Array.isArray(payload.candidatePaths));
  assert.ok(payload.candidatePaths.length >= 2);
}

async function testCanonicalWriteNoMarkdownEntries(client, archivePath) {
  const result = await client.callTool({
    name: 'upsert_canonical_document',
    arguments: {
      archivePath,
      content: '# New content',
    },
  });

  assert.equal(result.isError, true, 'no-markdown archive should return structured error');
  const payload = parseErrorPayload(result);
  assert.equal(payload.code, 'NO_MARKDOWN_ENTRIES');
  assert.ok(String(payload.nextAction || '').includes('Add a markdown entry'));
}

async function testErrorPayloadConsistency(client, archivePath) {
  const missingText = await client.callTool({
    name: 'mdz_read_text',
    arguments: {
      archivePath,
      entryPath: 'missing-file.md',
    },
  });
  assert.equal(missingText.isError, true);
  assertHasStandardErrorShape(parseErrorPayload(missingText));

  const nonImage = await client.callTool({
    name: 'mdz_read_image',
    arguments: {
      archivePath,
      entryPath: 'index.md',
    },
  });
  assert.equal(nonImage.isError, true);
  assertHasStandardErrorShape(parseErrorPayload(nonImage));

  const invalidRequestedPath = await client.callTool({
    name: 'mdz_read_markdown_embedded_images',
    arguments: {
      archivePath,
      entryPath: 'does-not-exist.md',
    },
  });
  assert.equal(invalidRequestedPath.isError, true);
  assertHasStandardErrorShape(parseErrorPayload(invalidRequestedPath));
}

async function testHtmlImgTagReferencedImages(client, archivePath) {
  const result = await client.callTool({
    name: 'mdz_review_document',
    arguments: { archivePath },
  });

  assert.ok(!result.isError, 'mdz_review_document should succeed for the html-image-only fixture');
  const payload = parseFirstTextJson(result);

  assert.equal(
    payload.imageCount,
    1,
    'an image referenced only via a raw HTML <img> tag should still be picked up'
  );
  assert.equal(payload.images[0].path, 'assets/diagram.png');
}

// ── mdz_write_entry / mdz_remove_entry (mdzip-vscode#16) ──────────────────

async function freshArchive(fixtureRoot, name, markdown = '# Doc\n\nSee ![chart](images/chart.png).\n') {
  const archivePath = path.join(fixtureRoot, name);
  await fs.writeFile(archivePath, await buildCanonicalArchive(markdown));
  return archivePath;
}

async function call(client, name, args) {
  return client.callTool({ name, arguments: args });
}

async function entryHashes(client, archivePath) {
  const result = await call(client, 'mdz_list_entries', { archivePath, includeHashes: true });
  assert.ok(!result.isError);
  return Object.fromEntries(parseFirstTextJson(result).map((entry) => [entry.path, entry.entryHash]));
}

async function testWriteEntry(client, fixtureRoot) {
  const archivePath = await freshArchive(fixtureRoot, 'write-entry.mdz');
  const before = await entryHashes(client, archivePath);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  // Add an image inline (base64): the reference in index.md now resolves.
  const added = await call(client, 'mdz_write_entry', { archivePath, entryPath: 'images/chart.png', contentBase64: png.toString('base64') });
  assert.ok(!added.isError, extractTextContent(added));
  const addedPayload = parseFirstTextJson(added);
  assert.equal(addedPayload.created, true);
  assert.equal(addedPayload.bytes, png.length);
  assert.ok(addedPayload.changedPaths.includes('images/chart.png'));
  assert.equal(addedPayload.postWriteValidation.isValid, true);
  assert.deepEqual(addedPayload.postWriteValidation.orphanedAssetPaths, []);

  // The image reads back, reporting the same entryHash.
  const image = await call(client, 'mdz_read_image', { archivePath, entryPath: 'images/chart.png' });
  assert.ok(!image.isError);
  assert.ok(extractTextContent(image).includes(addedPayload.entryHash));

  // Add a second document from a file on disk, and an unreferenced image (reported as orphaned).
  const sourcePath = path.join(fixtureRoot, 'chapter-source.md');
  await fs.writeFile(sourcePath, '# Chapter 2\r\n\r\nFrom disk.\r\n');
  const chapter = await call(client, 'mdz_write_entry', { archivePath, entryPath: 'chapters/02.md', sourcePath });
  assert.ok(!chapter.isError, extractTextContent(chapter));
  const orphan = parseFirstTextJson(await call(client, 'mdz_write_entry', { archivePath, entryPath: 'images/unused.png', contentBase64: png.toString('base64') }));
  assert.deepEqual(orphan.postWriteValidation.orphanedAssetPaths, ['images/unused.png']);

  // Replace the chapter as text, using the hash from mdz_read_text.
  const read = await call(client, 'mdz_read_text', { archivePath, entryPath: 'chapters/02.md' });
  const { entryHash } = JSON.parse(extractAllTextContent(read)[1]);
  const replaced = await call(client, 'mdz_write_entry', { archivePath, entryPath: 'chapters/02.md', content: '# Chapter 2\n\nReplaced.\n', expectedEntryHash: entryHash });
  assert.ok(!replaced.isError, extractTextContent(replaced));
  assert.equal(parseFirstTextJson(replaced).created, false);
  const reread = await call(client, 'mdz_read_text', { archivePath, entryPath: 'chapters/02.md' });
  assert.equal(extractTextContent(reread), '# Chapter 2\n\nReplaced.\n');

  // An image used only by the second document (here with a title) is in use, not orphaned.
  const rereadHash = JSON.parse(extractAllTextContent(reread)[1]).entryHash;
  const usesImage = await call(client, 'mdz_write_entry', {
    archivePath, entryPath: 'chapters/02.md', expectedEntryHash: rereadHash,
    content: '# Chapter 2\n\n![Unused no more](../images/unused.png "A tooltip")\n'
  });
  assert.ok(!usesImage.isError, extractTextContent(usesImage));
  assert.deepEqual(parseFirstTextJson(usesImage).postWriteValidation.orphanedAssetPaths, []);

  // Every entry the tool didn't write is unchanged.
  const after = await entryHashes(client, archivePath);
  assert.equal(after['index.md'], before['index.md'], 'index.md must be kept byte-for-byte');
}

async function testWriteEntryGuards(client, fixtureRoot) {
  const archivePath = await freshArchive(fixtureRoot, 'write-guards.mdz');
  const code = async (args) => {
    const result = await call(client, 'mdz_write_entry', { archivePath, ...args });
    assert.equal(result.isError, true, `expected an error for ${JSON.stringify(args)}`);
    const payload = parseErrorPayload(result);
    assertHasStandardErrorShape(payload);
    return payload.code;
  };
  const indexHash = (await entryHashes(client, archivePath))['index.md'];

  assert.equal(await code({ entryPath: 'index.md', content: 'x' }), 'ENTRY_EXISTS');
  assert.equal(await code({ entryPath: 'index.md', content: 'x', expectedEntryHash: 'stale' }), 'CONTENT_CONFLICT');
  assert.equal(await code({ entryPath: 'new.md', content: 'x', expectedEntryHash: indexHash }), 'ENTRY_NOT_FOUND');
  assert.equal(await code({ entryPath: '../outside.png', content: 'x' }), 'INVALID_ENTRY_PATH');
  // A leading slash means the archive root; the result reports the normalized path.
  const rooted = await call(client, 'mdz_write_entry', { archivePath, entryPath: '/rooted.txt', content: 'x' });
  assert.equal(parseFirstTextJson(rooted).entryPath, 'rooted.txt');
  assert.equal(await code({ entryPath: 'manifest.json', content: '{}' }), 'MANIFEST_NOT_WRITABLE');
  assert.equal(await code({ entryPath: 'Index.md', content: 'x' }), 'ENTRY_PATH_CASE_MISMATCH');
  assert.equal(await code({ entryPath: 'a.md' }), 'MISSING_CONTENT');
  assert.equal(await code({ entryPath: 'a.md', content: 'x', contentBase64: 'eA==' }), 'AMBIGUOUS_CONTENT');
  assert.equal(await code({ entryPath: 'a.png', sourcePath: path.join(fixtureRoot, 'does-not-exist.png') }), 'SOURCE_NOT_READABLE');

  // The canonicalContentHash from mdz_review_document is accepted for the main document too.
  const review = parseFirstTextJson(await call(client, 'mdz_review_document', { archivePath }));
  const viaReviewHash = await call(client, 'mdz_write_entry', { archivePath, entryPath: 'index.md', content: '# Doc\n\nRewritten.\n', expectedEntryHash: review.canonicalContentHash });
  assert.ok(!viaReviewHash.isError, extractTextContent(viaReviewHash));
}

async function testWriteEntryKeepsImpliedEntryPoint(client, archivePath) {
  // This archive's manifest doesn't name its entry point (only index.md implies it).
  // Adding another root-level Markdown file must not change which file is the main document.
  const result = await call(client, 'mdz_write_entry', { archivePath, entryPath: 'aaa-first.md', content: '# Another root file\n' });
  assert.ok(!result.isError, extractTextContent(result));
  assert.equal(parseFirstTextJson(result).entryPoint, 'index.md');
  const review = parseFirstTextJson(await call(client, 'mdz_review_document', { archivePath }));
  assert.equal(review.resolvedMarkdownPath, 'index.md');
}

async function testRemoveEntry(client, fixtureRoot) {
  const archivePath = await freshArchive(fixtureRoot, 'remove-entry.mdz');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64');
  const added = parseFirstTextJson(await call(client, 'mdz_write_entry', { archivePath, entryPath: 'images/chart.png', contentBase64: png }));

  const missingHash = await call(client, 'mdz_remove_entry', { archivePath, entryPath: 'images/chart.png' });
  assert.equal(parseErrorPayload(missingHash).code, 'MISSING_EXPECTED_ENTRY_HASH');
  const stale = await call(client, 'mdz_remove_entry', { archivePath, entryPath: 'images/chart.png', expectedEntryHash: 'stale' });
  assert.equal(parseErrorPayload(stale).code, 'CONTENT_CONFLICT');
  const indexHash = (await entryHashes(client, archivePath))['index.md'];
  const entryPoint = await call(client, 'mdz_remove_entry', { archivePath, entryPath: 'index.md', expectedEntryHash: indexHash });
  assert.equal(parseErrorPayload(entryPoint).code, 'ENTRY_IS_ENTRY_POINT');
  const missing = await call(client, 'mdz_remove_entry', { archivePath, entryPath: 'images/nope.png', expectedEntryHash: 'x' });
  assert.equal(parseErrorPayload(missing).code, 'ENTRY_NOT_FOUND');

  const removed = await call(client, 'mdz_remove_entry', { archivePath, entryPath: 'images/chart.png', expectedEntryHash: added.entryHash });
  assert.ok(!removed.isError, extractTextContent(removed));
  const payload = parseFirstTextJson(removed);
  assert.equal(payload.removedPath, 'images/chart.png');
  // index.md still points at the removed image, and the result says so.
  assert.ok(
    JSON.stringify(payload.postWriteValidation.unresolvedReferences).includes('chart.png'),
    'the dangling image reference must be reported'
  );
  assert.equal((await entryHashes(client, archivePath))['images/chart.png'], undefined);
}

function parseFirstTextJson(result) {
  const text = extractTextContent(result).trim();
  return JSON.parse(text);
}

function extractTextContent(result) {
  const firstText = (result.content || []).find((item) => item && item.type === 'text');
  if (!firstText || typeof firstText.text !== 'string') {
    throw new Error('Expected at least one text content item in tool result');
  }
  return firstText.text;
}

function extractAllTextContent(result) {
  const values = (result.content || [])
    .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text);
  if (values.length === 0) {
    throw new Error('Expected at least one text content item in tool result');
  }
  return values;
}

function parseErrorPayload(result) {
  const text = extractTextContent(result).trim();
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== 'object' || !payload.error) {
    throw new Error('Expected JSON payload with root error object');
  }
  return payload.error;
}

function assertHasStandardErrorShape(payload) {
  assert.equal(typeof payload.code, 'string');
  assert.equal(typeof payload.message, 'string');
  assert.equal(typeof payload.nextAction, 'string');
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  console.error(detail);
  process.exit(1);
});
