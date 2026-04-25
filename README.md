# MDZip VSCode Extension

Visual Studio Code extension to read and write MDZip (`.mdz`) files including packaged images. Supports single document mode.

## Features

- **Open `.mdz` files** directly in VS Code — the extension registers as the default editor for all `*.mdz` files.
- **Rendered preview** — opens with a rich HTML preview of the primary Markdown document, including any packaged images embedded as data URIs.
- **Edit source** — toggle to the Markdown source editor, make changes, and save with the standard <kbd>Ctrl+S</kbd> / <kbd>Cmd+S</kbd> shortcut.
- **Full save / Save As / Revert** — honours the standard VS Code document lifecycle.
- **New document** — create a fresh `.mdz` archive from the Command Palette.

## Requirements

- VS Code 1.85 or later.

## Usage

### Opening an existing `.mdz` file

Double-click any `.mdz` file in the Explorer.  The editor opens in **Preview** mode showing the rendered Markdown.  Click **Edit** in the toolbar to switch to the raw Markdown source; click **Preview** to return to the rendered view.

### Saving changes

Save with <kbd>Ctrl+S</kbd> (or <kbd>Cmd+S</kbd> on macOS) at any time.  The extension rewrites the entry-point Markdown file inside the archive and updates the manifest timestamp.

### Creating a new `.mdz` document

Open the Command Palette (<kbd>Ctrl+Shift+P</kbd>) and run:

```
MDZip: New .mdz Document
```

You will be prompted to choose a save location.  The new archive contains a starter `index.md` and a `manifest.json` set to `document` mode.

## Architecture

| File | Role |
|------|------|
| `src/extension.ts` | Extension entry point; registers the editor provider and the "New .mdz" command |
| `src/mdzEditorProvider.ts` | `CustomEditorProvider` implementation — manages webview lifecycle and message passing |
| `src/mdzDocument.ts` | In-memory document model; reads/writes the archive on disk |
| `src/mdzArchiveUtils.ts` | Thin wrappers around [`mdzip-core-js`](https://github.com/mdzip-project/mdzip-core-js) |
| `media/editor.css` | Webview stylesheet |
| `media/editor.js` | Webview script (Markdown rendering via `marked`, image rewriting, message bus) |

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

