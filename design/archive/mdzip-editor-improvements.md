# @mdzip/editor — Improvement Requests (Resolved)

Improvement requests raised during VS Code extension integration. All items here are shipped.

---

## 0. CRITICAL: `buildWorkspace` wrote empty files for lazy documents (1.2.7) — data loss

**Fixed in `@mdzip/core-js` 1.2.8** (shipped via `@mdzip/editor` 1.2.8).

`buildWorkspace` read `document.text` directly and never called `readText()`,
so with 1.2.7's always-on lazy documents, any rebuild-triggering operation
(`addAsset`/`pasteImage`, `removeAsset`, `setTitle`, `convertToMdz`) wrote
empty content for every document the user had not opened. Verified with a
two-document repro: after `addAsset`, the unopened document was empty in the
rebuilt archive.

The 1.2.8 fix resolves `text || await readText()` per document, and documents
now carry a serialization-surviving `isLazy: true` flag. If a lazy document
arrives with no `readText` (e.g. the closure was dropped by `postMessage`),
`buildWorkspace` and `readWorkspacePathBytes` throw
`ERR_LAZY_TEXT_UNAVAILABLE` instead of silently writing/showing empty content.
Verified against the 1.2.8 tarballs: content survives rebuilds, dropped
closures throw, books.mdz (749 docs) opens in ~600ms with 748 lazy documents,
and a single on-demand `readText` takes ~25ms.

---

## 2. JSDoc on key `.d.ts` declarations

**Shipped in `@mdzip/editor` 1.2.8 / `@mdzip/core-js` 1.2.8.**

`open` vs `openWorkspace` (including the lazy-document serialization warning),
`pasteImage` (null return for markdown source + rebuild cost note), and
`snapshot().workspace` runtime-shape caveats are now documented in the shipped
`.d.ts` files. `isLazy` is declared on the document type with guidance to
clear it alongside `readText` when materializing.

---

## 3. Lazy document text failed silently after serialization (1.2.7)

**Fixed in 1.2.8** via the `isLazy` flag + `ERR_LAZY_TEXT_UNAVAILABLE` errors
described in item 0. The host-side pattern (strip closures, let `isLazy`
survive, rehydrate `readText` as a round-trip on the receiving side) is
implemented in mdzip-vscode 0.1.244.

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
