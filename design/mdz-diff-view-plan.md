# MDZip Diff View Plan

## Goal

Provide a familiar VS Code diff experience for `.mdz` files by comparing readable archive-derived content instead of raw ZIP bytes.

## Approach

Use VS Code's native diff editor through `vscode.diff` and provide extracted `.mdz` content through virtual text documents. This keeps the UI consistent with Source Control diffs and avoids building a custom diff webview.

## Phase 1: Markdown Diff Command

Add a command named `MDZip: Compare Markdown`.

Implementation steps:

1. Contribute the command in `package.json`.
2. Register the command in `src/extension.ts`.
3. Add a `TextDocumentContentProvider` for a custom URI scheme such as `mdzip-diff`.
4. Create virtual left and right URIs that identify the target `.mdz`, reference, and view:

   ```text
   mdzip-diff:/absolute/file.mdz?ref=base&view=markdown
   mdzip-diff:/absolute/file.mdz?ref=working&view=markdown
   ```

5. Decode each archive with the existing `@mdzip/editor` archive helpers.
6. Return the canonical markdown entry as plain text.
7. Open the native diff editor with:

   ```ts
   await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
   ```

Initial comparison target:

- Left: saved file or Git base version.
- Right: current working-tree file, with future support for custom-editor in-memory bytes.

## Phase 2: Git-Aware Pending Change Diff

Make the command useful from Source Control pending changes.

Implementation steps:

1. Accept an `.mdz` `vscode.Uri` when invoked from menus.
2. Query the built-in Git extension API for the original version of the file.
3. Compare the Git/base archive against the working-tree archive.
4. Fall back to a saved-vs-working comparison if Git data is unavailable.
5. Show a clear message when no comparable previous version exists.

## Phase 3: Package Contents Diff

Add a command named `MDZip: Compare Package Contents`.

Purpose:

Show archive-level changes that markdown-only diff cannot reveal, especially asset additions, removals, and binary updates.

Generated virtual text should summarize entries in a stable format:

```text
Manifest
~ manifest.json

Markdown
~ index.md

Assets
+ images/new-diagram.png
- images/old-diagram.png
~ images/changed-image.png
```

Implementation steps:

1. Decode both archives.
2. Build sorted inventories of archive entries.
3. Hash bytes for matching paths.
4. Mark added, removed, and changed entries.
5. Pretty-print manifest JSON when useful.
6. Open the generated reports in `vscode.diff`.

## Phase 4: Source Control Menu Integration

Add `.mdz` context menu entries in Source Control:

```json
"scm/resource/context": [
  {
    "command": "mdzip.compareMarkdown",
    "when": "resourceExtname == .mdz",
    "group": "inline"
  },
  {
    "command": "mdzip.comparePackageContents",
    "when": "resourceExtname == .mdz",
    "group": "navigation"
  }
]
```

This makes the diff view discoverable from the same place users already inspect pending changes.

## Phase 5: AI-Agent Diff Hook

Add an internal helper for future agent workflows:

```ts
openMdzBytesDiff(
  title: string,
  leftBytes: Uint8Array,
  rightBytes: Uint8Array,
  view: 'markdown' | 'package'
)
```

This would allow generated or proposed `.mdz` bytes to be reviewed in a human-readable diff before applying them.

## Recommended Milestone

Ship the first milestone with:

1. `MDZip: Compare Markdown`.
2. Git-aware base-vs-working comparison.
3. Source Control context menu integration.

Then add `MDZip: Compare Package Contents` as the next feature.
