# MDZip VSCode Extension

Visual Studio Code extension to read and write MDZip (`.mdz`) files including packaged images.

## Features

- **Open `.mdz` files** directly in VS Code — the extension registers as the default editor for all `*.mdz` files.
- **Open With support for `.md`** — appears as an optional editor choice in **Open With...** for Markdown files without replacing the default Markdown editor. Markdown files open in preview/edit mode; packaged image and manifest-title features still require `.mdz`.
- **Rendered preview + source editing** — switch between Preview and Edit, or use Split mode for side-by-side editing and rendering.
- **Toolbar layout toggles** — icon-based `Preview`, `Edit`, and `Split` controls with tooltip and keyboard-focus support.
- **Image paste support** — pasted images are added to the archive and inserted into Markdown automatically.
- **Document title editing** — set the package title (manifest title) from the toolbar.
- **Full save / Save As / Revert** — honours the standard VS Code document lifecycle.
- **New document** — create a fresh `.mdz` archive from the Command Palette or folder context menu.
- **Markdown conversion** — convert a `.md` file to adjacent `.mdz`.

## Requirements

- VS Code 1.116 or later.

## Usage

### Opening an existing `.mdz` file

Click any `.mdz` file in Explorer to open it (double-click to keep the editor tab pinned). The editor opens in **Preview** mode.

- Click **Preview** to use rendered Markdown view.
- Click **Edit** to work in raw Markdown source.
- Click **Split** to keep one pane in Preview and one in Edit.

### Saving changes

Save with <kbd>Ctrl+S</kbd> (or <kbd>Cmd+S</kbd> on macOS) at any time.  The extension rewrites the entry-point Markdown file inside the archive and updates the manifest timestamp.

### Creating a new `.mdz` document

Open the Command Palette (<kbd>Ctrl+Shift+P</kbd>) and run:

```
MDZip: New .mdz Document
```

You will be prompted to choose a save location.  The new archive contains a starter `index.md` and a `manifest.json` set to `document` mode.

### Converting Markdown to MDZip

Select a `.md` file and run:

```
MDZip: Convert .md To .mdz
```

The extension writes `<name>.mdz` beside the source file and opens it in the MDZip editor.

### Troubleshooting image rendering

If a Markdown image does not render in Preview, verify that the Markdown path exactly matches an image path inside the archive (including filename and extension). The renderer resolves archive-relative paths exactly.

## Architecture

| File | Role |
|------|------|
| `src/extension.ts` | Extension entry point; registers provider and top-level commands |
| `src/mdzEditorProvider.ts` | `CustomEditorProvider` implementation — manages webview lifecycle and message passing |
| `src/mdzDocument.ts` | In-memory document model; reads/writes the archive on disk |
| `src/mdzArchiveUtils.ts` | Thin wrappers around [`mdzip-core-js`](https://github.com/mdzip-project/mdzip-core-js) |
| `src/shared/editorMetadata.ts` | Host-agnostic metadata/title helpers shared across extension layers |
| `media/editor.css` | Webview stylesheet |
| `media/editor.js` | Webview script (Markdown rendering via `marked`, image rewriting, host bridge + message bus) |

### Reuse Notes

The codebase is split so reusable logic can move into a future `mdzip-editor` package:

- `src/shared/*` is intended to stay host-agnostic and reusable.
- `src/mdzArchiveUtils.ts` wraps core archive operations and is portable outside VS Code.
- `media/editor.js` uses a small host bridge boundary (`createVscodeHost`) so the UI logic can be adapted to non-VS Code hosts with a different bridge implementation.

## Commands

- `MDZip: New .mdz Document`
- `MDZip: Convert .md To .mdz`
- `MDZip: Copy MCP Server Config Snippet`
- `MDZip: Enable Workspace MCP Server`
- `MDZip: Enable User MCP Server`
- `MDZip: Open Getting Started`
- `MDZip: Open MCP Server Status`
- `MDZip: Open Extension Help`
- `MDZip: Enable Workspace Agent Instructions`

## MCP Server (Optional)

This extension also ships a bundled MCP stdio server at `dist/mdz-mcp-server.js`.
It allows AI agents to inspect `.mdz` archives without extracting image files to disk.

In current VS Code builds that support MCP server definition providers, the bundled server is published automatically by the extension. In many cases, users do not need to edit `mcp.json` at all.

When VS Code prompts you to trust or start the bundled MDZip MCP server, approve the prompt. You can then run `MDZip: Open MCP Server Status` to inspect the server list, or `MDZip: Open Extension Help` to jump back to the extension details surface.

### Available MCP tools

- `mdz_review_document` - preferred first call for `.mdz` review/analyze/summarize requests; returns markdown and referenced images together as MCP content (no extraction).
- `mdz_list_entries` - list archive entries
- `mdz_read_text` - read a text entry (for example `manifest.json` or `index.md`)
- `mdz_read_image` - return image content directly as MCP image payload
- `mdz_read_markdown_embedded_images` - return markdown with archive image links rewritten as data URLs

### Quick setup

1. Install the extension.
2. Trust and start the bundled MDZip MCP server when VS Code prompts.
3. Open Chat and use the MDZip MCP tools.

Optional shared-workspace setup:

1. Run `MDZip: Enable Workspace MCP Server` from the Command Palette.
2. VS Code writes/updates `.vscode/mcp.json` and opens it for review.
3. Start or restart MCP servers in VS Code (for example via `MCP: List Servers`).

Optional user-profile setup:

1. Run `MDZip: Enable User MCP Server` from the Command Palette.
2. The extension opens your user MCP configuration when possible and adds the MDZip server entry.

Useful helper commands:

- `MDZip: Open Getting Started` - reopen the walkthrough anytime
- `MDZip: Open MCP Server Status` - jump to MCP server management when supported by the current VS Code build
- `MDZip: Open Extension Help` - open this extension in the Extensions UI, with a search fallback on VS Code builds that do not expose the direct command
- `MDZip: Enable Workspace Agent Instructions` - writes `.github/copilot-instructions.md` guidance so agents prefer `mdz_review_document` for `.mdz` reviews

Manual alternative:

1. Run `MDZip: Copy MCP Server Config Snippet`.
2. Paste into your target `mcp.json` (workspace or user profile).

## Building

```bash
npm install
npm run compile
```

To package a `.vsix` for local installation:

```bash
npm install -g @vscode/vsce
vsce package
```

## Specification

The MDZip format is documented at [mdzip-project/mdzip-spec](https://github.com/mdzip-project/mdzip-spec).

