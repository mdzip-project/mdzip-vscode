# About This File

This is an **MDZip (`.mdz`)** file — a ZIP archive that packages a Markdown document, together with any images or other assets it uses, into one portable file.

## How to open it

- **VS Code:** install the [MDZip extension](https://marketplace.visualstudio.com/items?itemName=mdzip-project.mdzip-vscode) and open this file directly — it renders like a normal document, images and all.
- **Anywhere else:** `.mdz` is a standard ZIP file. Extract it with any ZIP/archive tool. The Markdown document is usually `index.md` — if a `manifest.json` file is present, check its `entryPoint` field to be sure.

## What's inside

- The Markdown document itself, plus any images or attachments it references, kept at their original relative paths.
- `manifest.json`, if present — optional metadata such as the title and entry point.
- `AGENTS.md`, if present — instructions for AI coding assistants, not for people. Safe to ignore or delete.

Learn more: https://mdzip.org
