# Plan: Refactor mdzip-vscode to Use @mdzip/editor as Thin Wrapper

## Context

The `@mdzip/editor` package has been significantly enhanced and now contains most of the logic
the VSCode extension duplicates — archive manipulation, workspace state management, diff
utilities, rendering helpers, and metadata utilities. The extension should be a thin VS Code
integration layer; all archive/workspace logic should live in the library. This refactor
eliminates duplication and ensures future improvements to @mdzip/editor are inherited
automatically.

---

## Phase 1: Replace `mdzDocument.ts` with `MdzipWorkspaceService`  ⬅ Largest win

**Current state:** `MdzDocument` maintains its own `_content: OpenedArchive`,
`_currentMarkdown`, dirty state, and methods for all archive mutations.

**Target state:** `MdzDocument` becomes a thin `vscode.CustomDocument` shell that owns one
`MdzipWorkspaceService` instance and delegates everything to it.

### Changes

- In `create()`: replace `openMdzArchive()` + manual state init with
  `MdzipWorkspaceService.open(bytes, { sourceFormat, fileName })`.
- Remove fields: `_content`, `_currentMarkdown`, manual dirty flag.
- Replace `edit(newMarkdown)` → `service.editText(newMarkdown)`.
- Replace `addImageAsset()` → `service.addAsset(archivePath, fileBytes)`.
- Replace `findCurrentOrphanedAssetPaths()` → `service.content.orphanedAssetPaths`
  (already on the snapshot).
- Replace `removeOrphanedAsset()` → `service.removeAsset(archivePath, { requireOrphaned: true })`.
- Replace `setTitle()` → `service.setManifestTitle(newTitle)`.
- Replace `applyWorkspaceSnapshot()` — the service's `subscribe()` callback gives change
  events; the provider can call `service.snapshot()` on demand instead of pushing snapshots in.
- Replace `save()` / `saveAs()` → `service.saveToBytes()` then write to disk, then
  `service.markPersisted()`.
- Replace `revert()` → re-open bytes from disk and call `service.openArchive()` (or recreate).
- Delete `isLikelyBinary()` — `inferMdzipSourceFormat()` from `@mdzip/editor` workspace module
  covers format detection.

**File:** [src/mdzDocument.ts](src/mdzDocument.ts) — expect significant net line deletion (~200–300 lines).

---

## Phase 2: Simplify `mdzEditorProvider.ts` message handling

**Current state:** The provider routes many webview messages that push raw archive bytes back
and rebuilds state manually.

**Target state:** The provider subscribes to `MdzipWorkspaceService` change events via
`service.subscribe()` and calls `service.snapshot()` to get current state rather than
re-parsing archive bytes on every message.

### Changes

- `workspaceChanged` / `workspaceSaved` messages: instead of calling
  `doc.applyWorkspaceSnapshot()` with raw bytes, call `service.markPersisted()` on save and
  let the service own the bytes.
- `pasteImage` message: route to `service.pasteImage(options)` (already in the service API).
- `setTitle` message: route to `service.setManifestTitle()`.
- `removeOrphanedAsset` message: route to `service.removeAsset(path, { requireOrphaned: true })`.
- `openPath` message: route to `service.openPath(path)`.
- `_sendWorkspaceEditorContent()`: call `service.saveToBytes()` to get current bytes for the
  `openWorkspace` message rather than reading `doc._archiveBytes` directly.
- Remove duplicate `bytesToBase64` / `base64ToBytes` (they're `Buffer.from` one-liners) — keep
  as private statics or inline, but ensure they're not duplicated with the webview side.
- Replace hand-rolled `getNonce()` using `Math.random()` with
  `crypto.randomBytes(16).toString('hex')` (Node built-in).

**File:** [src/mdzEditorProvider.ts](src/mdzEditorProvider.ts) — moderate net deletion.

---

## Phase 3: Simplify `mdzDiffPanel.ts` with library exports

**Current state:** Builds its own `escapeHtml()` and a full 100-line LCS diff algorithm
(`buildLcsTable`, `diffMarkdownLines`, `pairChangedRows`).

**Target state:** Import `escapeHtml` from `@mdzip/editor` (exported from `workspace-view`).
The LCS line-diff logic has no equivalent in the library and must stay — but it can be
clearly isolated.

### Changes

- Replace hand-rolled `escapeHtml()` with the imported `escapeHtml` from `@mdzip/editor`.
- `createArchiveInventory` and `diffArchiveInventories` are already imported — confirm usage
  is correct and no duplication remains.
- The `buildLcsTable` / `diffMarkdownLines` / `pairChangedRows` functions stay (text-level
  line diff, not archive-level inventory diff — no library equivalent).
- Consider using `highlightMdzipMarkdownSource()` from `@mdzip/editor` for the source view
  if it provides better output than the current plain-text rendering.

**File:** [src/mdzDiffPanel.ts](src/mdzDiffPanel.ts) — small net deletion.

---

## Phase 4: Use metadata utilities in `mdzTemplates.ts`

**Current state:** `mdzTemplates.ts` has hand-rolled `firstMarkdownPath()` to find entry
points, and builds title strings manually.

**Target state:** Use library exports where they overlap.

### Changes

- Replace manual title derivation with `suggestedTitleFromMarkdown(markdown, fileBaseName)`
  from `@mdzip/editor` metadata module.
- Replace manual heading extraction with `firstMarkdownHeading(markdown)` from metadata module.
- The `firstMarkdownPath()` function (finds `index.md` or first `.md` file in a folder) has
  no direct equivalent — keep it, but note that `OpenedArchive.entryPoint` covers the
  post-creation case.
- `buildNewArchiveBytesWithTitle()` is already used — confirm it remains the archive-creation
  call.
- `slugifyFileName()`, `formatLocalDate()`, and template-folder discovery are VS Code-specific
  and stay.

**File:** [src/mdzTemplates.ts](src/mdzTemplates.ts) — small net deletion.

---

## Phase 5: Cleanup in `extension.ts`

**Current state:** `extension.ts` has `extractMarkdownImageTargets` / `isRelativeImageTarget` /
`collectRelativeMarkdownImageAssets` for scanning `.md` files before conversion.

**Target state:** Use `isImagePath(path)` from `@mdzip/editor` archive-utils where it overlaps.
The actual markdown image regex scanning (`![...]()` parsing) has no library equivalent — keep
but isolate it cleanly.

### Changes

- Replace the `isRelativeImageTarget` mime/extension checks with `isImagePath(path)` where
  appropriate (the library version may be more complete).
- The TOML manipulation and MCP config logic is unrelated to @mdzip/editor — no changes.
- The `upsertMarkedBlock` markdown-block insertion is VS Code-specific — no changes.

**File:** [src/extension.ts](src/extension.ts) — minimal changes.

---

## What Stays (Legitimately VS Code-Specific)

These are **not** duplication — they're the actual VS Code integration layer and should remain:

- `vscode.CustomDocument` and `vscode.CustomEditorProvider` lifecycle (`save`, `revert`,
  `backup`, `dispose`)
- Webview HTML generation and CSP (`_buildWebviewHtml`)
- Multi-panel layout management (`_trackPanel`, `_ensureUniqueModes`, `LayoutMode`)
- Scroll sync broadcasting across panels
- `MdzMarkdownFsProvider` virtual file system for VS Code's native diff command
- Git integration (`getGitBaseBytes` via `vscode.git` extension API)
- MCP server registration and config file management
- Template folder configuration in VS Code settings
- All VS Code command registrations

---

## Verification

1. Build the extension: `npm run build` (or the esbuild script in package.json).
2. Press F5 in VS Code to launch the Extension Development Host.
3. Open an `.mdz` file — verify editor loads, edits are tracked as dirty, and save works.
4. Paste an image — verify it's added to the archive.
5. Run a diff command on a file with git history — verify the diff panel renders.
6. Create a new file from template — verify archive is built with correct title.
7. Open an `.md` file in the custom editor — verify it opens and offers MDZ conversion.
8. Run `npm run build` and check for TypeScript errors (zero expected).
