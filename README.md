# MDZip VS Code Extension

Visual Studio Code extension to read and write MDZip (`.mdz`) files, including packaged images.

## Features

- **Open `.mdz` files** directly in VS Code - the extension registers as the default editor for all `*.mdz` files.
- **Open With support for `.md`** - appears as an optional editor choice in **Open With...** for Markdown files without replacing the default Markdown editor. Markdown files open in preview/edit mode; packaged image and manifest-title features still require `.mdz`.
- **Rendered preview + source editing** - switch between Preview and Edit, or use Split mode for side-by-side editing and rendering.
- **Toolbar layout toggles** - icon-based `Preview`, `Edit`, and `Split` controls with tooltip and keyboard-focus support.
- **Image paste support** - pasted images are added to the archive and inserted into Markdown automatically.
- **Document title editing** - set the package title from the toolbar.
- **Archive contents browser** - browse Markdown, text, image, and binary entries inside `.mdz` archives.
- **Full save / Save As / Revert** - honors the standard VS Code document lifecycle.
- **New document** - create a fresh `.mdz` archive from the Command Palette or folder context menu.
- **Markdown conversion** - convert a `.md` file to an adjacent `.mdz`.
- **Bundled MCP server** - let compatible AI agents inspect `.mdz` archives without extracting image files to disk.

## Requirements

- VS Code 1.116 or later.

## Usage

### Opening an existing `.mdz` file

Click any `.mdz` file in Explorer to open it. The editor opens in **Preview** mode by default.

- Click **Preview** to use rendered Markdown view.
- Click **Edit** to work in raw Markdown source.
- Click **Split** to keep one pane in Preview and one in Edit.
- Use the contents pane to inspect files packaged inside the archive.

### Saving changes

Save with <kbd>Ctrl+S</kbd> or <kbd>Cmd+S</kbd> on macOS. The extension rewrites the active editable text entry inside the archive and keeps the archive bytes in sync with VS Code's custom document lifecycle.

### Creating a new `.mdz` document

Open the Command Palette (<kbd>Ctrl+Shift+P</kbd>) and run:

```text
MDZip: New .mdz Document
```

You will be prompted to choose a save location. The new archive contains a starter `index.md` and a `manifest.json` set to document mode.

### Converting Markdown to MDZip

Select a `.md` file and run:

```text
MDZip: Convert .md To .mdz
```

The extension writes `<name>.mdz` beside the source file and opens it in the MDZip editor.

### Troubleshooting image rendering

If a Markdown image does not render in Preview, verify that the Markdown path exactly matches an image path inside the archive, including filename and extension. The renderer resolves archive-relative paths exactly.

## Commands

- `MDZip: New .mdz Document`
- `MDZip: Convert .md To .mdz`
- `MDZip: Copy MCP Server Config Snippet`
- `MDZip: Enable Workspace MCP Server`
- `MDZip: Enable User MCP Server`
- `MDZip: Open Getting Started`
- `MDZip: Open MCP Server Status`
- `MDZip: Open Extension Help`
- `MDZip: Open Documentation`
- `MDZip: Visit mdzip.org`
- `MDZip: Enable Workspace Agent Instructions`

## Documentation

- Docs: [mdzip.org/spec.html](https://mdzip.org/spec.html)
- Website: [mdzip.org](https://mdzip.org)
- Format specification: [mdzip-project/mdzip-spec](https://github.com/mdzip-project/mdzip-spec)

## MCP Server

This extension ships a bundled MCP stdio server at `dist/mdz-mcp-server.js`. It allows compatible AI agents to inspect `.mdz` archives without extracting image files to disk.

In VS Code builds that support MCP server definition providers, the bundled server is published automatically by the extension. In many cases, users do not need to edit `mcp.json`.

When VS Code prompts you to trust or start the bundled MDZip MCP server, approve the prompt. You can then run `MDZip: Open MCP Server Status` to inspect the server list, or `MDZip: Open Extension Help` to jump back to the extension details surface.

### Available MCP tools

- `mdz_review_document` - preferred first call for `.mdz` review, analysis, and summarization requests; returns markdown and referenced images together as MCP content.
- `upsert_canonical_document` - updates the manifest-first canonical Markdown document.
- `mdz_list_entries` - lists archive entries.
- `mdz_read_text` - reads a text entry such as `manifest.json` or `index.md`.
- `mdz_read_image` - returns image content directly as an MCP image payload.
- `mdz_read_markdown_embedded_images` - returns markdown with archive image links rewritten as data URLs.

### Optional setup commands

- `MDZip: Enable Workspace MCP Server` writes or updates `.vscode/mcp.json` for the current workspace.
- `MDZip: Enable User MCP Server` opens your user MCP configuration when possible and adds the MDZip server entry.
- `MDZip: Copy MCP Server Config Snippet` copies a manual config snippet for workspace, user, or remote MCP configuration.
- `MDZip: Enable Workspace Agent Instructions` writes `.github/copilot-instructions.md` guidance so agents prefer `mdz_review_document` for `.mdz` reviews.

## Architecture

| File | Role |
|------|------|
| `src/extension.ts` | Extension entry point; registers provider and top-level commands |
| `src/mdzEditorProvider.ts` | `CustomEditorProvider` implementation; manages webview lifecycle and message passing |
| `src/mdzDocument.ts` | In-memory document model; reads and writes the archive on disk |
| `@mdzip/editor` | Shared archive, metadata, rendering, and workspace helpers linked from `../mdzip-editor/packages/editor` |
| `media/editor.css` | Webview stylesheet |
| `media/editor.js` | Webview script for Markdown rendering, image rewriting, host bridge, and message bus |

### Shared editor package

Reusable archive and editor-domain logic lives in the linked `@mdzip/editor` package. The VS Code extension keeps the host-specific pieces here:

- `src/mdzDocument.ts` adapts shared archive helpers to VS Code's custom document lifecycle.
- `src/mdzEditorProvider.ts` manages webview creation, VS Code commands, and message passing.
- `media/editor.js` uses a small host bridge boundary (`createVscodeHost`) for the VS Code webview runtime.

## Building

```bash
npm install
npm test
```

To package a `.vsix` for local installation:

```bash
npx vsce package
```
