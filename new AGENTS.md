(maybe?) For when the user uses the command New MDZ File (Include AGENTS.md)

# AGENTS.md

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

Before manually extracting or inspecting archive contents, determine whether MDZip-native tooling is available.

Preferred order:

1. MDZip MCP server
2. MDZip-compatible libraries
3. MDZip-compatible viewers or editors
4. Manual ZIP inspection

If an MDZip MCP server is available, prefer using it.

An MDZip MCP server may provide archive-aware operations that allow agents to:

- Read archive contents without extracting files
- Inspect images and other assets directly from memory
- Access manifest metadata and entry points
- Analyze archive structure safely
- Avoid creating temporary files or modifying the user's workspace

Use archive-aware operations whenever possible instead of extracting files solely for inspection.

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