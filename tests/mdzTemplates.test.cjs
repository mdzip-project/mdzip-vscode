'use strict';
// Template-rendering tests for mdzTemplates.ts.
// Runs in Node with a mocked vscode API — no Extension Development Host needed.
// The bundle at dist/test/mdzTemplates.cjs is built by: npm run bundle:test-templates

const { test } = require('node:test');
const assert = require('node:assert/strict');

global.__vscodeMockFiles = new Map();

const { parseTemplateFrontmatter } = require('../dist/test/mdzTemplates.cjs');

// ── parseTemplateFrontmatter ────────────────────────────────────────────────
// Covers issue #3 Part 2: a single-file Markdown template opts out of the
// default AGENTS.md via `mdzipIncludeAgents: false` frontmatter.

test('no frontmatter: body unchanged, includeAgents undefined (caller falls back to default-on)', () => {
  const source = '# Title\n\nBody text.\n';
  const result = parseTemplateFrontmatter(source);
  assert.equal(result.body, source);
  assert.equal(result.includeAgents, undefined);
});

test('mdzipIncludeAgents: false opts out', () => {
  const source = '---\nmdzipIncludeAgents: false\n---\n# Title\n\nBody.\n';
  const result = parseTemplateFrontmatter(source);
  assert.equal(result.includeAgents, false);
  assert.equal(result.body, '# Title\n\nBody.\n');
});

test('mdzipIncludeAgents: true is explicit opt-in (same as the default)', () => {
  const result = parseTemplateFrontmatter('---\nmdzipIncludeAgents: true\n---\nBody\n');
  assert.equal(result.includeAgents, true);
});

test('accepts yes/no as well as true/false, case-insensitively', () => {
  assert.equal(parseTemplateFrontmatter('---\nmdzipIncludeAgents: No\n---\nBody\n').includeAgents, false);
  assert.equal(parseTemplateFrontmatter('---\nmdzipIncludeAgents: YES\n---\nBody\n').includeAgents, true);
});

test('other frontmatter keys are ignored, not errors', () => {
  const source = '---\ntitle: Something\nmdzipIncludeAgents: false\ntags: [a, b]\n---\nBody\n';
  const result = parseTemplateFrontmatter(source);
  assert.equal(result.includeAgents, false);
  assert.equal(result.body, 'Body\n');
});

test('a malformed/unrecognized value leaves includeAgents undefined', () => {
  const result = parseTemplateFrontmatter('---\nmdzipIncludeAgents: maybe\n---\nBody\n');
  assert.equal(result.includeAgents, undefined);
  assert.equal(result.body, 'Body\n');
});

test('an unterminated --- block (no closing ---) is not treated as frontmatter', () => {
  const source = '---\nmdzipIncludeAgents: false\n\n# Just a heading that starts with a rule\n';
  const result = parseTemplateFrontmatter(source);
  assert.equal(result.includeAgents, undefined);
  assert.equal(result.body, source);
});
