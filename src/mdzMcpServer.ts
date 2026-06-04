import { promises as fs } from 'fs';
import { MdzArchiveCore, MDZ_IMAGE_MIME_TYPES } from 'mdzip-core-js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

type ToolArgs = Record<string, unknown> | undefined;
type EntryPointSource = 'requested' | 'manifest' | 'fallback-single-markdown';
type ToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
type ToolResult = {
  content: ToolContent[];
  isError?: boolean;
};

type ToolErrorPayload = {
  code: string;
  message: string;
  nextAction: string;
  candidatePaths?: string[];
};

type SearchMatch = {
  path: string;
  lineNumber: number;
  columnNumber: number;
  snippet: string;
};

type ResolveContext = {
  requestedEntryPath: string | null;
  resolvedMarkdownPath: string;
  canonicalEntrypointPath: string | null;
  entrypointSource: EntryPointSource;
  isCanonicalRead: boolean;
  isAmbiguous: boolean;
  recommendedNextAction: string;
};

type ReferencedImage = {
  path: string;
  mimeType: string;
  bytes: Uint8Array;
  alt: string;
};

class MdzToolError extends Error {
  public readonly payload: ToolErrorPayload;

  public constructor(payload: ToolErrorPayload) {
    super(payload.message);
    this.payload = payload;
  }
}

const server = new Server(
  {
    name: 'mdzip-mcp',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'mdz_review_document',
        description:
          'Preferred first call for review/analyze/summarize requests on an .mdz file. Returns markdown text and referenced images plus canonical/entrypoint resolution metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            archivePath: {
              type: 'string',
              description: 'Absolute or workspace-relative path to the .mdz file.',
            },
            entryPath: {
              type: 'string',
              description:
                'Optional archive-relative markdown path. When omitted, the server resolves manifest-first canonical markdown.',
            },
            maxImages: {
              type: 'number',
              description:
                'Optional cap for returned images to control payload size. Defaults to 12 and is clamped to 1..50.',
            },
          },
          required: ['archivePath'],
        },
      },
      {
        name: 'upsert_canonical_document',
        description:
          'Preferred write path for markdown updates. Updates manifest-first canonical markdown and returns changed paths plus post-write validation.',
        inputSchema: {
          type: 'object',
          properties: {
            archivePath: {
              type: 'string',
              description: 'Absolute or workspace-relative path to the .mdz file.',
            },
            content: {
              type: 'string',
              description: 'New markdown content for the canonical entrypoint document.',
            },
          },
          required: ['archivePath', 'content'],
        },
      },
      {
        name: 'mdz_list_entries',
        description:
          'List all non-directory entries inside an .mdz archive. Advanced inspection tool; start with mdz_review_document for default agent workflows.',
        inputSchema: {
          type: 'object',
          properties: {
            archivePath: {
              type: 'string',
              description: 'Absolute or workspace-relative path to the .mdz file.',
            },
          },
          required: ['archivePath'],
        },
      },
      {
        name: 'mdz_search_text',
        description:
          'Search UTF-8 text entries inside an .mdz archive. Use this directly for grep/find/search requests instead of asking whether to inspect the archive another way.',
        inputSchema: {
          type: 'object',
          properties: {
            archivePath: {
              type: 'string',
              description: 'Absolute or workspace-relative path to the .mdz file.',
            },
            query: {
              type: 'string',
              description: 'Text or regular expression to search for inside archive text entries.',
            },
            caseSensitive: {
              type: 'boolean',
              description: 'Whether matching is case-sensitive. Defaults to false.',
            },
            regex: {
              type: 'boolean',
              description: 'Interpret query as a JavaScript regular expression. Defaults to false.',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of matching lines to return. Defaults to 100 and is clamped to 1..1000.',
            },
          },
          required: ['archivePath', 'query'],
        },
      },
      {
        name: 'mdz_read_text',
        description:
          'Read a UTF-8 text entry from an .mdz archive by archive-relative path. Advanced inspection tool; prefer mdz_review_document for first read.',
        inputSchema: {
          type: 'object',
          properties: {
            archivePath: {
              type: 'string',
              description: 'Absolute or workspace-relative path to the .mdz file.',
            },
            entryPath: {
              type: 'string',
              description: 'Archive-relative path (for example: manifest.json or index.md).',
            },
          },
          required: ['archivePath', 'entryPath'],
        },
      },
      {
        name: 'mdz_read_image',
        description:
          'Read an image entry from an .mdz archive and return it directly as MCP image content (no extraction required). Advanced inspection tool.',
        inputSchema: {
          type: 'object',
          properties: {
            archivePath: {
              type: 'string',
              description: 'Absolute or workspace-relative path to the .mdz file.',
            },
            entryPath: {
              type: 'string',
              description: 'Archive-relative image path (for example: images/diagram.png).',
            },
          },
          required: ['archivePath', 'entryPath'],
        },
      },
      {
        name: 'mdz_read_markdown_embedded_images',
        description:
          'Read markdown from an .mdz entry and embed archive images as data URLs directly in the markdown text. Prefer mdz_review_document for general review tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            archivePath: {
              type: 'string',
              description: 'Absolute or workspace-relative path to the .mdz file.',
            },
            entryPath: {
              type: 'string',
              description:
                'Optional archive-relative markdown path. When omitted, the server resolves manifest-first canonical markdown.',
            },
          },
          required: ['archivePath'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    return await handleToolCall(name, args);
  } catch (error) {
    return toToolErrorResult(name, error);
  }
});

async function handleToolCall(name: string, args: ToolArgs): Promise<ToolResult> {
  switch (name) {
    case 'mdz_review_document': {
      const archivePath = stringArg(args, 'archivePath');
      const bytes = await fs.readFile(archivePath);
      const archive = await MdzArchiveCore.open(bytes);

      const requestedEntryPath = optionalStringArg(args, 'entryPath');
      const context = await resolveReadContext(archive, requestedEntryPath);
      if (!archive.hasEntry(context.resolvedMarkdownPath)) {
        throw toolError(
          'ENTRY_NOT_FOUND',
          `Markdown entry not found: ${context.resolvedMarkdownPath}`,
          'Call mdz_list_entries to inspect archive paths, then retry mdz_review_document with a valid markdown entry path.',
          listMarkdownPaths(archive)
        );
      }

      const markdown = await archive.readText(context.resolvedMarkdownPath);
      const maxImages = clampInteger(optionalNumberArg(args, 'maxImages') ?? 12, 1, 50);
      const referencedImages = await collectReferencedImages(
        archive,
        context.resolvedMarkdownPath,
        markdown,
        maxImages
      );

      const imageSummary = referencedImages.map((image) => ({
        path: image.path,
        mimeType: image.mimeType,
        bytes: image.bytes.byteLength,
        altText: image.alt,
      }));

      const content: ToolContent[] = [
        {
          type: 'text',
          text: JSON.stringify(
            {
              archivePath,
              requestedEntryPath: context.requestedEntryPath,
              resolvedMarkdownPath: context.resolvedMarkdownPath,
              canonicalEntrypointPath: context.canonicalEntrypointPath,
              entrypointSource: context.entrypointSource,
              isCanonicalRead: context.isCanonicalRead,
              isAmbiguous: context.isAmbiguous,
              recommendedNextAction: context.recommendedNextAction,
              imageCount: referencedImages.length,
              maxImages,
              images: imageSummary,
            },
            null,
            2
          ),
        },
        {
          type: 'text',
          text: markdown,
        },
      ];

      for (const image of referencedImages) {
        content.push({
          type: 'image',
          data: Buffer.from(image.bytes).toString('base64'),
          mimeType: image.mimeType,
        });
      }

      return { content };
    }

    case 'upsert_canonical_document': {
      const archivePath = stringArg(args, 'archivePath');
      const content = stringArg(args, 'content');

      const bytes = await fs.readFile(archivePath);
      const archive = await MdzArchiveCore.open(bytes);
      const canonicalEntrypointPath = await resolveCanonicalEntrypointForWrite(archive);

      const mutation = await MdzArchiveCore.addFile(bytes, canonicalEntrypointPath, content);
      const nextBytes = new Uint8Array(await mutation.blob.arrayBuffer());
      await fs.writeFile(archivePath, nextBytes);

      const validation = await MdzArchiveCore.validate(nextBytes);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                archivePath,
                canonicalEntrypointPath,
                changedPaths: [canonicalEntrypointPath],
                postWriteValidation: {
                  isValid: validation.isValid,
                  errors: validation.errors,
                  warnings: validation.warnings,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'mdz_list_entries': {
      const archivePath = stringArg(args, 'archivePath');
      const archive = await loadArchive(archivePath);

      const entries = archive
        .listEntries()
        .filter((entry) => !entry.isDirectory)
        .map(({ path, isMarkdown, isImage }) => ({ path, isMarkdown, isImage }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(entries, null, 2),
          },
        ],
      };
    }

    case 'mdz_search_text': {
      const archivePath = stringArg(args, 'archivePath');
      const query = stringArg(args, 'query');
      const caseSensitive = optionalBooleanArg(args, 'caseSensitive') ?? false;
      const useRegex = optionalBooleanArg(args, 'regex') ?? false;
      const maxResults = clampInteger(optionalNumberArg(args, 'maxResults') ?? 100, 1, 1000);
      const archive = await loadArchive(archivePath);
      const matches = await searchArchiveText(archive, query, {
        caseSensitive,
        maxResults,
        regex: useRegex,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                archivePath,
                query,
                caseSensitive,
                regex: useRegex,
                maxResults,
                matchCount: matches.length,
                truncated: matches.length >= maxResults,
                matches,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case 'mdz_read_text': {
      const archivePath = stringArg(args, 'archivePath');
      const entryPath = stringArg(args, 'entryPath');
      const archive = await loadArchive(archivePath);
      const resolvedPath = findExistingPath(archive, entryPath);

      if (!resolvedPath) {
        throw toolError(
          'ENTRY_NOT_FOUND',
          `Entry not found: ${entryPath}`,
          'Call mdz_list_entries to inspect valid paths, then retry mdz_read_text with one exact archive path.'
        );
      }

      const text = await archive.readText(resolvedPath);
      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    }

    case 'mdz_read_image': {
      const archivePath = stringArg(args, 'archivePath');
      const entryPath = stringArg(args, 'entryPath');
      const archive = await loadArchive(archivePath);
      const normalizedEntryPath = findExistingPath(archive, entryPath);

      if (!normalizedEntryPath) {
        throw toolError(
          'ENTRY_NOT_FOUND',
          `Entry not found: ${entryPath}`,
          'Call mdz_list_entries to inspect valid paths, then retry mdz_read_image with a valid image path.'
        );
      }

      const ext = normalizedEntryPath.split('.').pop()?.toLowerCase() ?? '';
      const mimeType = MDZ_IMAGE_MIME_TYPES[ext];
      if (!mimeType) {
        throw toolError(
          'ENTRY_NOT_IMAGE',
          `Entry is not a recognized image type: ${entryPath}`,
          'Retry mdz_read_image with a supported image path (png, jpg, jpeg, gif, webp, svg, avif, ico).'
        );
      }

      const bytes = await archive.readBytes(normalizedEntryPath);
      const base64 = Buffer.from(bytes).toString('base64');

      return {
        content: [
          {
            type: 'text',
            text: `Loaded ${normalizedEntryPath} (${mimeType}, ${bytes.byteLength} bytes).`,
          },
          {
            type: 'image',
            data: base64,
            mimeType,
          },
        ],
      };
    }

    case 'mdz_read_markdown_embedded_images': {
      const archivePath = stringArg(args, 'archivePath');
      const bytes = await fs.readFile(archivePath);
      const archive = await MdzArchiveCore.open(bytes);

      const requestedEntryPath = optionalStringArg(args, 'entryPath');
      const context = await resolveReadContext(archive, requestedEntryPath);

      if (!archive.hasEntry(context.resolvedMarkdownPath)) {
        throw toolError(
          'ENTRY_NOT_FOUND',
          `Markdown entry not found: ${context.resolvedMarkdownPath}`,
          'Call mdz_list_entries to inspect archive paths, then retry with a valid markdown entry path.',
          listMarkdownPaths(archive)
        );
      }

      const markdown = await archive.readText(context.resolvedMarkdownPath);
      const rewritten = await rewriteMarkdownImagePathsToDataUrls(archive, context.resolvedMarkdownPath, markdown);

      return {
        content: [
          {
            type: 'text',
            text: rewritten,
          },
        ],
      };
    }

    default:
      throw toolError('UNKNOWN_TOOL', `Unknown tool: ${name}`, 'Retry with one of the advertised mdz_* tools.');
  }
}

async function resolveReadContext(
  archive: MdzArchiveCore,
  requestedEntryPath?: string
): Promise<ResolveContext> {
  const markdownPaths = listMarkdownPaths(archive);
  const canonicalEntrypointPath = await resolveCanonicalEntrypoint(archive);

  if (requestedEntryPath) {
    const requestedNormalized = MdzArchiveCore.normalizePath(requestedEntryPath);
    const requestedPath = findExistingPath(archive, requestedNormalized);
    if (!requestedPath || !MdzArchiveCore.isMarkdownFile(requestedPath)) {
      throw toolError(
        'INVALID_MARKDOWN_ENTRY_PATH',
        `Requested markdown entry is missing or not markdown: ${requestedEntryPath}`,
        'Retry mdz_review_document with a valid markdown path, or omit entryPath to let the server resolve manifest-first canonical markdown.',
        markdownPaths
      );
    }

    return {
      requestedEntryPath: requestedPath,
      resolvedMarkdownPath: requestedPath,
      canonicalEntrypointPath,
      entrypointSource: 'requested',
      isCanonicalRead: canonicalEntrypointPath
        ? requestedPath.toLowerCase() === canonicalEntrypointPath.toLowerCase()
        : false,
      isAmbiguous: false,
      recommendedNextAction:
        'If you need to update canonical markdown, call upsert_canonical_document with archivePath and new content.',
    };
  }

  if (canonicalEntrypointPath) {
    return {
      requestedEntryPath: null,
      resolvedMarkdownPath: canonicalEntrypointPath,
      canonicalEntrypointPath,
      entrypointSource: 'manifest',
      isCanonicalRead: true,
      isAmbiguous: false,
      recommendedNextAction:
        'Call upsert_canonical_document to update canonical markdown, or use mdz_read_text for targeted non-canonical text entries.',
    };
  }

  if (markdownPaths.length === 1) {
    return {
      requestedEntryPath: null,
      resolvedMarkdownPath: markdownPaths[0],
      canonicalEntrypointPath: null,
      entrypointSource: 'fallback-single-markdown',
      isCanonicalRead: false,
      isAmbiguous: false,
      recommendedNextAction:
        'Set manifest.entryPoint to this markdown path for deterministic canonical behavior across tools and agents.',
    };
  }

  if (markdownPaths.length === 0) {
    throw toolError(
      'NO_MARKDOWN_ENTRIES',
      'Archive has no markdown entries to read.',
      'Add a markdown file to the archive (for example index.md), then retry mdz_review_document.',
      []
    );
  }

  throw toolError(
    'AMBIGUOUS_MARKDOWN_ENTRYPOINT',
    'Multiple markdown entries exist and no canonical manifest entrypoint could be resolved.',
    'Specify entryPath explicitly for this read, and set manifest.entryPoint to make future reads deterministic.',
    markdownPaths
  );
}

async function resolveCanonicalEntrypointForWrite(archive: MdzArchiveCore): Promise<string> {
  const markdownPaths = listMarkdownPaths(archive);
  const canonicalEntrypointPath = await resolveCanonicalEntrypoint(archive);

  if (canonicalEntrypointPath) {
    return canonicalEntrypointPath;
  }

  if (markdownPaths.length === 0) {
    throw toolError(
      'NO_MARKDOWN_ENTRIES',
      'Cannot update canonical markdown because the archive has no markdown entries.',
      'Add a markdown entry and set manifest.entryPoint, then retry upsert_canonical_document.'
    );
  }

  if (markdownPaths.length > 1) {
    throw toolError(
      'AMBIGUOUS_CANONICAL_ENTRYPOINT',
      'Cannot update canonical markdown because manifest.entryPoint is missing or invalid and multiple markdown entries exist.',
      'Set manifest.entryPoint to the canonical markdown path, then retry upsert_canonical_document.',
      markdownPaths
    );
  }

  throw toolError(
    'MISSING_CANONICAL_ENTRYPOINT',
    'Cannot update canonical markdown because manifest.entryPoint is missing.',
    `Set manifest.entryPoint to "${markdownPaths[0]}" and retry upsert_canonical_document.`,
    markdownPaths
  );
}

async function resolveCanonicalEntrypoint(archive: MdzArchiveCore): Promise<string | null> {
  const manifest = await archive.readManifest();
  const manifestEntryPoint = typeof manifest?.entryPoint === 'string' ? manifest.entryPoint.trim() : '';
  if (!manifestEntryPoint) {
    return null;
  }

  const normalized = MdzArchiveCore.normalizePath(manifestEntryPoint);
  const resolvedPath = findExistingPath(archive, normalized);
  if (!resolvedPath) {
    return null;
  }
  if (!MdzArchiveCore.isMarkdownFile(resolvedPath)) {
    return null;
  }

  return resolvedPath;
}

async function loadArchive(archivePath: string): Promise<MdzArchiveCore> {
  const bytes = await fs.readFile(archivePath);
  return MdzArchiveCore.open(bytes);
}

function listMarkdownPaths(archive: MdzArchiveCore): string[] {
  return archive
    .listEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.path)
    .filter((entryPath) => MdzArchiveCore.isMarkdownFile(entryPath))
    .filter((entryPath, index, values) => values.indexOf(entryPath) === index)
    .sort((a, b) => a.localeCompare(b));
}

function findExistingPath(archive: MdzArchiveCore, archivePath: string): string | undefined {
  const entry = archive.findEntry(archivePath);
  if (!entry || entry.dir) {
    return undefined;
  }
  return MdzArchiveCore.normalizePath(entry.name);
}

function stringArg(args: ToolArgs, key: string): string {
  const value = args?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw toolError(
      'MISSING_REQUIRED_ARGUMENT',
      `Missing required string argument: ${key}`,
      `Retry the tool call and provide a non-empty string for ${key}.`
    );
  }
  return value;
}

function optionalStringArg(args: ToolArgs, key: string): string | undefined {
  const value = args?.[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumberArg(args: ToolArgs, key: string): number | undefined {
  const value = args?.[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }
  return value;
}

function optionalBooleanArg(args: ToolArgs, key: string): boolean | undefined {
  const value = args?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (rounded < min) {
    return min;
  }
  if (rounded > max) {
    return max;
  }
  return rounded;
}

async function searchArchiveText(
  archive: MdzArchiveCore,
  query: string,
  options: { caseSensitive: boolean; maxResults: number; regex: boolean }
): Promise<SearchMatch[]> {
  const matcher = createTextMatcher(query, options.caseSensitive, options.regex);
  const matches: SearchMatch[] = [];

  for (const entry of archive.listEntries()) {
    if (matches.length >= options.maxResults) {
      break;
    }
    if (entry.isDirectory) {
      continue;
    }

    const entryPath = MdzArchiveCore.normalizePath(entry.path);
    const text = await readEntryAsUtf8Text(archive, entryPath);
    if (text === undefined) {
      continue;
    }

    const lines = text.split(/\r\n|\r|\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (matches.length >= options.maxResults) {
        break;
      }

      const columnIndex = matcher(lines[index]);
      if (columnIndex === undefined) {
        continue;
      }

      matches.push({
        path: entryPath,
        lineNumber: index + 1,
        columnNumber: columnIndex + 1,
        snippet: truncateSnippet(lines[index]),
      });
    }
  }

  return matches;
}

function createTextMatcher(
  query: string,
  caseSensitive: boolean,
  regex: boolean
): (line: string) => number | undefined {
  if (regex) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(query, caseSensitive ? '' : 'i');
    } catch (error) {
      throw toolError(
        'INVALID_REGEX',
        error instanceof Error ? error.message : String(error),
        'Retry mdz_search_text with a valid JavaScript regular expression, or set regex to false for literal text search.'
      );
    }

    return (line) => {
      const match = pattern.exec(line);
      return match?.index;
    };
  }

  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  return (line) => {
    const haystack = caseSensitive ? line : line.toLocaleLowerCase();
    const index = haystack.indexOf(needle);
    return index >= 0 ? index : undefined;
  };
}

async function readEntryAsUtf8Text(archive: MdzArchiveCore, entryPath: string): Promise<string | undefined> {
  if (mimeTypeForImagePath(entryPath)) {
    return undefined;
  }

  try {
    const bytes = await archive.readBytes(entryPath);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\u0000')) {
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  }
}

function truncateSnippet(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= 240) {
    return trimmed;
  }
  return `${trimmed.slice(0, 237)}...`;
}

async function rewriteMarkdownImagePathsToDataUrls(
  archive: MdzArchiveCore,
  markdownPath: string,
  markdown: string
): Promise<string> {
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;

  const matches = Array.from(markdown.matchAll(imagePattern));
  if (matches.length === 0) {
    return markdown;
  }

  const replacements = new Map<string, string>();
  for (const match of matches) {
    const fullMatch = match[0];
    const alt = match[1];
    const rawTarget = (match[2] || '').trim();
    if (!rawTarget || isExternalTarget(rawTarget)) {
      continue;
    }

    const cleanTarget = stripQueryAndHash(stripAngleBrackets(rawTarget));
    const normalizedImagePath = resolveImageReferencePath(archive, markdownPath, cleanTarget);

    if (!normalizedImagePath) {
      continue;
    }

    const mimeType = mimeTypeForImagePath(normalizedImagePath);
    if (!mimeType) {
      continue;
    }
    const base64 = await archive.readBase64(normalizedImagePath);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    replacements.set(fullMatch, `![${alt}](${dataUrl})`);
  }

  let rewritten = markdown;
  for (const [from, to] of replacements) {
    rewritten = rewritten.split(from).join(to);
  }
  return rewritten;
}

async function collectReferencedImages(
  archive: MdzArchiveCore,
  markdownPath: string,
  markdown: string,
  maxImages: number
): Promise<ReferencedImage[]> {
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const results: ReferencedImage[] = [];
  const seen = new Set<string>();

  for (const match of markdown.matchAll(imagePattern)) {
    if (results.length >= maxImages) {
      break;
    }

    const alt = match[1] || '';
    const rawTarget = (match[2] || '').trim();
    if (!rawTarget || isExternalTarget(rawTarget)) {
      continue;
    }

    const cleanTarget = stripQueryAndHash(stripAngleBrackets(rawTarget));
    const normalizedPath = resolveImageReferencePath(archive, markdownPath, cleanTarget);
    if (!normalizedPath) {
      continue;
    }
    if (seen.has(normalizedPath)) {
      continue;
    }

    const mimeType = mimeTypeForImagePath(normalizedPath);
    if (!mimeType) {
      continue;
    }
    const bytes = await archive.readBytes(normalizedPath);
    results.push({ path: normalizedPath, mimeType, bytes, alt });
    seen.add(normalizedPath);
  }

  return results;
}

function resolveImageReferencePath(
  archive: MdzArchiveCore,
  markdownPath: string,
  target: string
): string | undefined {
  const normalizedTarget = target.replace(/\\/g, '/');
  const candidates = [normalizedTarget.replace(/^\.\//, '')];

  try {
    candidates.push(MdzArchiveCore.resolvePath(markdownPath, normalizedTarget));
  } catch {
    // Invalid relative targets are ignored by the preview/read helpers.
  }

  for (const candidate of candidates) {
    const resolved = findExistingPath(archive, candidate);
    if (!resolved || !mimeTypeForImagePath(resolved)) {
      continue;
    }
    return resolved;
  }

  return undefined;
}

function mimeTypeForImagePath(archivePath: string): string | undefined {
  const ext = archivePath.split('.').pop()?.toLowerCase() ?? '';
  return MDZ_IMAGE_MIME_TYPES[ext];
}

function stripQueryAndHash(target: string): string {
  return target.split('?')[0].split('#')[0];
}

function stripAngleBrackets(target: string): string {
  const match = target.match(/^<(.+)>$/);
  return match ? match[1].trim() : target;
}

function isExternalTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/');
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalized)) {
    return true;
  }
  if (normalized.startsWith('//')) {
    return true;
  }
  if (normalized.startsWith('/')) {
    return true;
  }
  return false;
}

function toolError(
  code: string,
  message: string,
  nextAction: string,
  candidatePaths?: string[]
): MdzToolError {
  return new MdzToolError({
    code,
    message,
    nextAction,
    candidatePaths,
  });
}

function toToolErrorResult(toolName: string, error: unknown): {
  isError: true;
  content: [{ type: 'text'; text: string }];
} {
  const payload: ToolErrorPayload =
    error instanceof MdzToolError
      ? error.payload
      : {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
          nextAction: `Retry ${toolName}. If the error persists, inspect the archive with mdz_list_entries and verify archivePath and entry paths.`,
        };

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: payload }, null, 2),
      },
    ],
  };
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`mdzip-mcp failed to start: ${detail}\n`);
  process.exit(1);
});
