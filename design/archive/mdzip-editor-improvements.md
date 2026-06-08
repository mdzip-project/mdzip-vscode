# @mdzip/editor — Improvement Requests (Resolved)

Improvement requests raised during VS Code extension integration. All items here are shipped.

---

## 1. Paste behaviour fixes

### 1a. Image paste in a markdown source file does not trigger the conversion dialog

**Fixed in `@mdzip/editor` 1.2.4.**

`handlePaste` now checks `sourceFormat === 'markdown'` and calls `requestMdzConversion({ kind: 'image-file', file })` instead of silently discarding the paste.

---

### 1b. Redundant ZIP rebuild in `exportBytes()` after `pasteImage()`

**Fixed in `@mdzip/editor` 1.2.4** (same commit as 1c).

`reloadPreservingCurrentText` now sets `pendingTextDirty = false` unconditionally. After `pasteImage()` calls `reloadPreservingCurrentText`, the subsequent `archiveBytesWithPendingText()` call from `notifyChanged` sees `pendingTextDirty = false` and `archiveBytes.length > 0`, so it returns `archiveBytes` directly without a second `serializeWorkspaceBytes()` call. Paste now triggers exactly one ZIP rebuild instead of two.

---

### 1c. `pendingTextDirty` optimisation breaks `convertToMdz()` when opened via `openWorkspace()`

**Fixed in `@mdzip/editor` 1.2.4.**

`archiveBytesWithPendingText()` now checks `this.archiveBytes.length > 0` before relying on `pendingTextDirty`. When `archiveBytes` is empty (as after `openWorkspaceDirect`), it forces a full serialise regardless of the dirty flag.

---

### 1d. Image paste is slow — DEFLATE compression on already-compressed / large images

**Fixed in `@mdzip/core-js` 1.2.6** (shipped via `@mdzip/editor` 1.2.6).

`buildArchive` now adds image-extension files with `{ compression: 'STORE' }` per-file, bypassing pako entirely for images. Compression and decompression of image assets are now memcpy operations. The intermediate step of DEFLATE level 1 (introduced in `@mdzip/core-js` 1.2.4) was insufficient — raw clipboard bitmaps and large PNGs still caused multi-second pauses.

The `openWorkspace` eager `readBytes` call (introduced in 1.2.4 to populate `byteSize`) is still present but is no longer a performance concern with STORE entries, since STORE decompression is a memcpy.

---

## 3. `AGENTS.md` for AI coding agents

**Shipped in `@mdzip/editor` 1.2.4.**

`AGENTS.md` exists at the package root and covers: `open()` vs `openWorkspace()`, paste behaviour in markdown source files, `MdzWorkspace` runtime shape, VS Code preset, and the `archiveBytesWithPendingText()` performance optimisation.
