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
      await testCanonicalWriteMissingEntrypoint(client, fixtures.fallbackSingleMarkdown);
      await testCanonicalWriteAmbiguousEntrypoint(client, fixtures.ambiguousMultiMarkdown);
      await testCanonicalWriteNoMarkdownEntries(client, fixtures.noMarkdown);
      await testErrorPayloadConsistency(client, fixtures.canonicalSingle);
      console.log('MCP smoke tests passed: T1, T2, T4, T5, T6, T7, T8, T9');
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

  return {
    canonicalSingle,
    fallbackSingleMarkdown,
    ambiguousMultiMarkdown,
    noMarkdown,
  };
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

async function stripManifestEntrypoint(archiveBytes) {
  const { MdzArchiveCore } = await getMdzipCore();
  const archive = await MdzArchiveCore.open(archiveBytes);
  const manifest = JSON.parse(await archive.readText('manifest.json'));
  delete manifest.entryPoint;

  const result = await MdzArchiveCore.addFile(archiveBytes, 'manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return Buffer.from(await result.blob.arrayBuffer());
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

  const writeResult = await client.callTool({
    name: 'upsert_canonical_document',
    arguments: {
      archivePath: canonicalArchivePath,
      content: nextMarkdown,
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
