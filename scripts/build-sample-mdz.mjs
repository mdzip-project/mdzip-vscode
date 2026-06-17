// Builds a sample MDZip (.mdz) archive about MDZip itself, including a generated
// banner image and a Mermaid diagram. Run with: node scripts/build-sample-mdz.mjs
import { packDirectory } from '@mdzip/core-js/node';
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// --- Minimal dependency-free PNG encoder (RGBA, 8-bit) -----------------------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10-12 compression/filter/interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Draw a banner -----------------------------------------------------------
function buildBanner() {
  const W = 960;
  const H = 300;
  const px = Buffer.alloc(W * H * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    const ia = a / 255;
    px[i] = Math.round(px[i] * (1 - ia) + r * ia);
    px[i + 1] = Math.round(px[i + 1] * (1 - ia) + g * ia);
    px[i + 2] = Math.round(px[i + 2] * (1 - ia) + b * ia);
    px[i + 3] = 255;
  };
  // Diagonal gradient background (deep indigo -> teal)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2;
      const r = Math.round(36 + t * (16 - 36));
      const g = Math.round(38 + t * (160 - 38));
      const b = Math.round(92 + t * (170 - 92));
      const i = (y * W + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  // A "document + zip" mark on the left: a page with a folded corner and a zipper line.
  const pageX = 90, pageY = 70, pageW = 150, pageH = 180, fold = 42;
  const fillRect = (x0, y0, w, h, r, g, b, a = 255) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, r, g, b, a);
  };
  // page body
  for (let y = pageY; y < pageY + pageH; y++) {
    for (let x = pageX; x < pageX + pageW; x++) {
      // cut the folded top-right corner
      if (x - (pageX + pageW - fold) > (y - pageY)) continue;
      set(x, y, 245, 247, 252);
    }
  }
  // folded corner shadow triangle
  for (let y = pageY; y < pageY + fold; y++) {
    for (let x = pageX + pageW - fold; x < pageX + pageW; x++) {
      if (x - (pageX + pageW - fold) > (y - pageY)) set(x, y, 200, 208, 224);
    }
  }
  // text lines on the page
  for (let l = 0; l < 5; l++) {
    fillRect(pageX + 22, pageY + 60 + l * 22, l === 4 ? 60 : 106, 8, 70, 90, 130);
  }
  // zipper down the middle of the page
  const zx = pageX + pageW / 2;
  for (let y = pageY + 10; y < pageY + pageH - 10; y++) {
    set(zx, y, 24, 30, 60);
    if (y % 10 < 5) { fillRect(zx - 7, y, 5, 3, 24, 30, 60); }
    else { fillRect(zx + 3, y, 5, 3, 24, 30, 60); }
  }
  // pull tab
  fillRect(zx - 6, pageY + pageH - 22, 12, 18, 255, 210, 80);

  return encodePng(W, H, px);
}

// --- Markdown ----------------------------------------------------------------
const markdown = `# MDZip — Markdown, Packaged

![MDZip banner](images/banner.png)

**MDZip** (\`.mdz\`) is a tiny, open document format: a Markdown file plus all the
images it references, bundled together in a single ZIP container with a small
\`manifest.json\`. One file you can email, commit, or drop in a folder — and it
stays self-contained, with no broken image links.

> Think of it as "a Markdown document that brought its assets along."

## Why MDZip?

| Plain Markdown | MDZip (\`.mdz\`) |
| --- | --- |
| Images live in scattered folders | Images travel **inside** the document |
| Links break when files move | Self-contained, portable |
| No metadata | \`manifest.json\` with title, author, mode |
| — | Diff-friendly, Git-aware tooling |

## What's inside a \`.mdz\`

A \`.mdz\` is just a ZIP archive. Crack it open and you'll find:

\`\`\`text
sample.mdz
├── manifest.json      ← title, author, entry point, mode
├── index.md           ← the entry-point document (this file)
└── images/
    └── banner.png     ← packaged assets
\`\`\`

## How it fits together

\`\`\`mermaid
flowchart LR
    A[Author writes Markdown] --> B[Reference images normally]
    B --> C{Package}
    C -->|MDZip editor / core-js| D[(sample.mdz)]
    D --> E[Open anywhere]
    E --> F[Preview + edit]
    E --> G[Git diff]
    E --> H[MCP server / agents]
    D -. extract .-> I[Plain .md + images]
\`\`\`

## The packaging lifecycle

\`\`\`mermaid
sequenceDiagram
    participant U as You
    participant Ed as MDZip Editor
    participant Core as core-js
    participant Disk as sample.mdz
    U->>Ed: Edit markdown & paste images
    Ed->>Core: buildWorkspace()
    Core->>Disk: Write ZIP + manifest.json
    U->>Ed: Reopen sample.mdz
    Ed->>Core: openWorkspace()
    Core-->>Ed: documents + assets
    Ed-->>U: Rendered preview
\`\`\`

## Working with MDZip

- **Edit** \`.mdz\` files directly in VS Code with the MDZip editor — live preview,
  image paste, and asset management.
- **Diff** against the Git base: compare the rendered Markdown *or* the raw
  archive contents.
- **Convert** any \`.md\` into a \`.mdz\` to bundle its images.
- **Extract** back to a plain folder of Markdown + images at any time.
- **Automate** with the bundled MCP server so agents can review documents.

## Try it

1. This file *is* a sample \`.mdz\`. You're reading its entry point.
2. Edit this Markdown — the preview updates live.
3. Paste an image and save; it gets packaged into \`images/\` automatically.
4. Run **MDZip: Extract to Folder** to see the plain files inside.

---

*Generated as a demonstration of the MDZip document format.*
`;

// --- Assemble + pack ---------------------------------------------------------
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mdz-sample-'));
try {
  await fs.mkdir(path.join(tmp, 'images'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'index.md'), markdown, 'utf8');
  await fs.writeFile(path.join(tmp, 'images', 'banner.png'), buildBanner());

  const outFile = path.resolve('samples', 'mdzip-overview.mdz');
  await fs.mkdir(path.dirname(outFile), { recursive: true });

  const result = await packDirectory(tmp, outFile, {
    rootName: 'MDZip Overview',
    overwrite: true,
    packOptions: {
      mode: 'document',
      entryPoint: 'index.md',
      title: 'MDZip — Markdown, Packaged',
      author: 'MDZip Project',
      description: 'A sample MDZip document explaining the .mdz format, with a banner image and Mermaid diagrams.',
      createIndex: false,
    },
  });

  console.log('Built:', outFile);
  console.log('Entry point:', result.manifest?.entryPoint ?? '(inferred)');
  console.log('Files:', (result.selectedFiles ?? result.files ?? []).map?.((f) => f.archivePath ?? f).join(', '));
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}
