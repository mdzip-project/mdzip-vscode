import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { MdzArchiveCore, MDZ_IMAGE_MIME_TYPES } from 'mdzip-core-js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

type ToolArgs = Record<string, unknown> | undefined;

const server = new Server(
  {
    name: 'mdzip-mcp',
    version: '0.1.0',
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
          'Preferred first call for review/analyze/summarize requests on an .mdz file. Returns markdown text and referenced images together as MCP content (no extraction).',
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
                'Optional archive-relative markdown path. When omitted, the server resolves the archive entry point.',
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
        name: 'mdz_list_entries',
        description: 'List all non-directory entries inside an .mdz archive.',
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
        name: 'mdz_read_text',
        description: 'Read a UTF-8 text entry from an .mdz archive by archive-relative path.',
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
          'Read an image entry from an .mdz archive and return it directly as MCP image content (no extraction required).',
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
                'Optional archive-relative markdown path. When omitted, the server resolves the archive entry point.',
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

  switch (name) {
    case 'mdz_review_document': {
      const archivePath = stringArg(args, 'archivePath');
      const bytes = await fs.readFile(archivePath);
      const zip = await JSZip.loadAsync(bytes);

      const requestedEntryPath = optionalStringArg(args, 'entryPath');
      const markdownPath = requestedEntryPath || (await resolveEntryPoint(bytes));
      const markdownEntry = findEntry(zip, markdownPath);

      if (!markdownEntry) {
        throw new Error(`Markdown entry not found: ${markdownPath}`);
      }

      const markdown = await markdownEntry.async('text');
      const maxImages = clampInteger(optionalNumberArg(args, 'maxImages') ?? 12, 1, 50);
      const referencedImages = await collectReferencedImages(zip, markdownPath, markdown, maxImages);

      const imageSummary = referencedImages.map((image) => ({
        path: image.path,
        mimeType: image.mimeType,
        bytes: image.bytes.byteLength,
        altText: image.alt,
      }));

      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
        {
          type: 'text',
          text: JSON.stringify(
            {
              archivePath,
              markdownEntryPath: MdzArchiveCore.normalizePath(markdownEntry.name),
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

    case 'mdz_list_entries': {
      const archivePath = stringArg(args, 'archivePath');
      const zip = await loadArchive(archivePath);

      const entries = Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => {
          const path = MdzArchiveCore.normalizePath(entry.name);
          const ext = path.split('.').pop()?.toLowerCase() ?? '';
          return {
            path,
            isMarkdown: MdzArchiveCore.isMarkdownFile(path),
            isImage: ext in MDZ_IMAGE_MIME_TYPES,
          };
        })
        .sort((a, b) => a.path.localeCompare(b.path));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(entries, null, 2),
          },
        ],
      };
    }

    case 'mdz_read_text': {
      const archivePath = stringArg(args, 'archivePath');
      const entryPath = stringArg(args, 'entryPath');
      const zip = await loadArchive(archivePath);
      const entry = findEntry(zip, entryPath);

      if (!entry) {
        throw new Error(`Entry not found: ${entryPath}`);
      }

      const text = await entry.async('text');
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
      const zip = await loadArchive(archivePath);
      const entry = findEntry(zip, entryPath);

      if (!entry) {
        throw new Error(`Entry not found: ${entryPath}`);
      }

      const normalizedEntryPath = MdzArchiveCore.normalizePath(entry.name);
      const ext = normalizedEntryPath.split('.').pop()?.toLowerCase() ?? '';
      const mimeType = MDZ_IMAGE_MIME_TYPES[ext];
      if (!mimeType) {
        throw new Error(`Entry is not a recognized image type: ${entryPath}`);
      }

      const bytes = await entry.async('uint8array');
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
      const zip = await JSZip.loadAsync(bytes);

      const requestedEntryPath = optionalStringArg(args, 'entryPath');
      const markdownPath = requestedEntryPath || (await resolveEntryPoint(bytes));
      const markdownEntry = findEntry(zip, markdownPath);

      if (!markdownEntry) {
        throw new Error(`Markdown entry not found: ${markdownPath}`);
      }

      const markdown = await markdownEntry.async('text');
      const rewritten = await rewriteMarkdownImagePathsToDataUrls(zip, markdownPath, markdown);

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
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function loadArchive(archivePath: string): Promise<JSZip> {
  const bytes = await fs.readFile(archivePath);
  return JSZip.loadAsync(bytes);
}

function findEntry(zip: JSZip, archivePath: string): JSZip.JSZipObject | undefined {
  const normalized = MdzArchiveCore.normalizePath(archivePath);

  const direct = zip.files[normalized];
  if (direct && !direct.dir) {
    return direct;
  }

  return Object.values(zip.files).find(
    (entry) => !entry.dir && MdzArchiveCore.normalizePath(entry.name).toLowerCase() === normalized.toLowerCase()
  );
}

function stringArg(args: ToolArgs, key: string): string {
  const value = args?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required string argument: ${key}`);
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

async function resolveEntryPoint(bytes: Uint8Array): Promise<string> {
  const archive = await MdzArchiveCore.open(bytes);
  return archive.resolveEntryPoint();
}

async function rewriteMarkdownImagePathsToDataUrls(
  zip: JSZip,
  markdownPath: string,
  markdown: string
): Promise<string> {
  const markdownDir = directoryName(markdownPath);
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
    const candidates = resolveArchivePathCandidates(markdownDir, cleanTarget);
    const imageEntry = candidates
      .map((candidate) => findEntry(zip, candidate))
      .find((entry): entry is JSZip.JSZipObject => Boolean(entry));

    if (!imageEntry) {
      continue;
    }

    const normalizedImagePath = MdzArchiveCore.normalizePath(imageEntry.name);
    const ext = normalizedImagePath.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = MDZ_IMAGE_MIME_TYPES[ext];
    if (!mimeType) {
      continue;
    }

    const base64 = await imageEntry.async('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    replacements.set(fullMatch, `![${alt}](${dataUrl})`);
  }

  let rewritten = markdown;
  for (const [from, to] of replacements) {
    rewritten = rewritten.split(from).join(to);
  }
  return rewritten;
}

type ReferencedImage = {
  path: string;
  mimeType: string;
  bytes: Uint8Array;
  alt: string;
};

async function collectReferencedImages(
  zip: JSZip,
  markdownPath: string,
  markdown: string,
  maxImages: number
): Promise<ReferencedImage[]> {
  const markdownDir = directoryName(markdownPath);
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
    const candidates = resolveArchivePathCandidates(markdownDir, cleanTarget);
    const imageEntry = candidates
      .map((candidate) => findEntry(zip, candidate))
      .find((entry): entry is JSZip.JSZipObject => Boolean(entry));

    if (!imageEntry) {
      continue;
    }

    const normalizedPath = MdzArchiveCore.normalizePath(imageEntry.name);
    if (seen.has(normalizedPath)) {
      continue;
    }

    const ext = normalizedPath.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = MDZ_IMAGE_MIME_TYPES[ext];
    if (!mimeType) {
      continue;
    }

    const bytes = await imageEntry.async('uint8array');
    results.push({ path: normalizedPath, mimeType, bytes, alt });
    seen.add(normalizedPath);
  }

  return results;
}

function directoryName(archivePath: string): string {
  const normalized = MdzArchiveCore.normalizePath(archivePath);
  const index = normalized.lastIndexOf('/');
  if (index < 0) {
    return '';
  }
  return normalized.slice(0, index + 1);
}

function resolveArchivePathCandidates(baseDir: string, target: string): string[] {
  const normalizedTarget = target.replace(/\\/g, '/').replace(/^\.\//, '');
  const direct = MdzArchiveCore.normalizePath(normalizedTarget);
  const relative = MdzArchiveCore.normalizePath(path.posix.normalize(path.posix.join(baseDir || '', normalizedTarget)));
  return [direct, relative].filter((value, index, self) => Boolean(value) && self.indexOf(value) === index);
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`mdzip-mcp failed to start: ${detail}\n`);
  process.exit(1);
});
