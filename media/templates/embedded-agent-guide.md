# AGENTS.md

> **Note for humans:** The [MDZip VS Code extension](https://marketplace.visualstudio.com/items?itemName=mdzip-project.mdzip-vscode)
> added this file automatically when this archive was created, so AI tools
> without native `.mdz` support can read and edit it safely. If you're seeing
> this archive outside VS Code and don't recognize this file, that's where it
> came from. Nothing else in this archive depends on it, so deleting it won't
> break anything — but without it, an AI agent may not think to check whether
> it has an MDZip MCP server available, even if one is installed, and may
> default to slower, less safe manual handling: unzipping this archive to a
> temp folder just to read it (and potentially leaving those files behind),
> or overwriting edits without checking for conflicts. Keeping it around is
> usually worth it. Guidance last updated: 2026-07-03.

This archive is an **MDZip (`.mdz`)** file.

MDZip is a ZIP-based container format for packaging Markdown documents, related assets, and optional metadata into a single portable file.

## How To Consume This Archive

MDZip is commonly used for:

- Markdown documents with images and attachments
- Documentation projects
- Knowledge bases and notes
- AI context packages
- Portable content exchange between tools

## Role of This File

This file is a fallback guide for agents and tools that encounter this archive without full MDZip support.

If MDZip-native tooling, an MDZip MCP server, or a valid `manifest.json` is available, prefer those sources over this file.

This file is advisory.

The archive manifest, when present, is authoritative.

## Preferred Access Method

Before doing anything else with this archive — reading or writing — actively
check whether an MDZip MCP server is already available among your tools (for
example, tool names beginning `mdz_`, or `upsert_canonical_document`). Do not
assume one is unavailable just because it was not mentioned; check first.

Preferred order:

1. MDZip MCP server — for both reading and writing.
2. MDZip-compatible libraries
3. MDZip-compatible viewers or editors
4. Manual ZIP inspection — last resort, and only after confirming no MCP
   server or compatible tooling is available.

An MDZip MCP server may provide archive-aware operations that allow agents to:

- Read archive contents without extracting files
- Inspect images and other assets directly from memory
- Access manifest metadata and entry points
- Analyze archive structure safely
- Detect and reject writes that would overwrite content changed since it was
  last read (e.g. by an open MDZip editor), instead of silently clobbering it
- Avoid creating temporary files or modifying the user's workspace

Use archive-aware operations whenever possible instead of extracting files
solely for inspection. This applies to reads, not just writes: do not extract
the whole archive to a temp folder just to read one file out of it.

### If no MDZip MCP server is available

Check `manifest.json` for an `mcpServer` field first — it may point to how
this MCP server is meant to be set up (see Manifest, below). If you are
working inside VS Code and the MDZip extension is installed, its commands
`MDZip: Enable Workspace MCP Server` and `MDZip: Copy MCP Server Config
Snippet` can wire one up.

- **Reading:** manual ZIP inspection is acceptable — it is non-destructive.
  Prefer reading individual entries (manifest.json, the markdown text, a
  specific image) directly from the archive in memory over extracting the
  whole archive to a temp folder on disk.
- **Writing:** do not modify this archive with generic ZIP tools, scripts, or
  manual byte manipulation. Ask the user how they would like to proceed
  before making any change. A write performed outside MDZip-aware tooling has
  no way to detect a conflicting edit made elsewhere (e.g. in an open MDZip
  editor) and can silently discard it.

## Entry Point Discovery

When manually inspecting an MDZip archive:

1. If `manifest.json` exists and specifies an `entryPoint`, use it.
2. Otherwise, look for `index.md` in the archive root.
3. Otherwise, if exactly one candidate Markdown content file exists in the archive root, use that file.
4. Otherwise, do not guess arbitrarily.

When identifying candidate Markdown content files, ignore convention and support files such as:

- `AGENTS.md`
- `README.md`
- `LICENSE.md`
- `CHANGELOG.md`

## Mode Detection

If `manifest.json` exists, check the `mode` property.

### Document Mode

`mode: "document"`

The archive represents a single logical document.

Multiple Markdown files may be present and may represent sections, chapters, appendices, includes, or other content belonging to the same document.

### Project Mode

`mode: "project"`

The archive represents multiple related Markdown documents.

Preserve navigation and relationships between documents.

Do not automatically flatten project-mode archives into a single document unless explicitly requested.

## Assets

Images, PDFs, and other assets are typically referenced using relative paths from Markdown files.

Preserve relative paths and links whenever possible.

When MDZip-native tooling is available, assets should be inspected directly from the archive rather than extracted to temporary files whenever possible.

## Manifest

If present, `manifest.json` contains metadata and instructions for interpreting the archive.

Common properties may include:

- `mode`
- `entryPoint`
- `title`
- `mdzipVersion`
- `mcpServer` — optional. When present, points agents at how to reach the
  MDZip MCP server for this archive instead of guessing, for example:
  ```json
  "mcpServer": {
    "name": "mdzip-mcp",
    "setupHint": "If not already available as an MCP tool, check the MDZip VS Code extension (MDZip: Enable Workspace MCP Server / Copy MCP Server Config Snippet), or ask the user how they'd like to proceed before manually modifying this archive."
  }
  ```

Consumers should prefer manifest metadata over inferred behavior whenever possible.

## Recovery Behavior

If the archive appears incomplete, damaged, or inconsistent:

1. Prefer `manifest.json` if it is present and valid.
2. If the manifest points to a missing entry point, look for `index.md`.
3. If no `index.md` exists, look for a single candidate Markdown content file in the archive root.
4. Ignore support files such as `AGENTS.md`, `README.md`, `LICENSE.md`, and `CHANGELOG.md` when selecting a content entry point.
5. Preserve files and relative paths whenever possible.
6. Do not rewrite, rename, or delete archive contents unless explicitly instructed.

## Additional Information

Authoritative references:

- Website: https://mdzip.org
- Specification: https://github.com/mdzip-project/mdzip-spec
- GitHub Organization: https://github.com/mdzip-project

## Summary

MDZip is a ZIP-based Markdown package format.

When MDZip-native tooling is available:

1. Prefer an MDZip MCP server.
2. Read archive contents directly from the container.
3. Inspect assets in memory when possible.
4. Use manifest metadata to determine archive structure.

Otherwise:

1. Read `manifest.json` if present.
2. Determine the archive mode.
3. Locate the entry point.
4. Preserve relative links and assets.
5. Interpret the archive according to its declared mode.
6. Reading this way is fine. Before writing this way, ask the user how they
   would like to proceed.
