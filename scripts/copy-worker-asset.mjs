// `@mdzip/editor`'s archive-parsing worker is a pre-bundled, self-contained
// script the host loads by URL (`new Worker(url, { type: 'module' })`), not
// by JS import — esbuild's bundling of webviewEditor.ts doesn't touch it, so
// it's copied into media/ here instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const from = path.resolve(repoRoot, 'node_modules/@mdzip/editor/dist/mdz-archive.worker.js');
const to = path.resolve(repoRoot, 'media/mdz-archive.worker.js');

fs.copyFileSync(from, to);
console.log(`Copied ${path.relative(repoRoot, to)}`);
