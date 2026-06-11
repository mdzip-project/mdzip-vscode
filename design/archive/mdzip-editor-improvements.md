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

---

## 4. Manifest-only changes should not trigger a full archive rebuild

> **Status: DONE in 1.2.8 local tarballs (2026-06-10).**
> Tier 1: all mutations (`setManifestTitle`, `addAsset`, `pasteImage`,
> `removeAsset`) serialize via the new byte-level `MdzArchiveCore.updateFiles`
> patcher when `archiveBytes` is available - `setManifestTitle` on books.mdz:
> **569ms**, zero `readText()` calls (test-enforced).
> Tier 2: with empty `archiveBytes`, `setManifestTitle` now builds **nothing**
> - the manifest changes in memory and is folded into the next serialization.
> The view skips `exportBytes()`/`onChanged` for manifest-only events when the
> host registers `onManifestChanged` (opt-in).
>
> **Extension wired up in 0.1.247 (libraries 1.2.9):** `onManifestChanged` ->
> `manifestChanged` message -> host patches via
> `MdzArchiveCore.updateFiles(bytes, [], [], { manifest })`. Verified on
> books.mdz: webview side 1ms with zero `readText` calls, host patch 352ms.
> `openWorkspace(..., { archiveBytes })` is passed for archives <= 16MB so
> asset ops (image paste, removal) patch incrementally too; larger archives
> stay on the lazy path.

### Problem

`setManifestTitle` (and any future manifest-only edit: metadata fields, entry
point, mode) goes through `serializeWorkspaceBytes()` -> `buildWorkspace()`,
which reads **every** document and asset to rebuild the entire ZIP - to change
one small JSON file.

With 1.2.8 lazy documents this is much worse than it looks. For a host using
`openWorkspace()` with serialized workspaces (VS Code), each lazy document's
`readText()` is a webview<->host round-trip. Setting the title on books.mdz
(126MB, 749 documents) means ~748 round-trips totalling ~324MB of text, plus
building a 126MB ZIP inside the webview, plus base64-posting the whole archive
back to the host. Observed: tens of seconds of "nothing happens" after
clicking Save in the title dialog.

The library already has the right primitive: `MdzArchiveCore.addFile(bytes,
'manifest.json', json)` patches a single entry into existing archive bytes -
`updateManifestTitleInArchive` in `archive-utils.ts` already does exactly
this. It just isn't used by the service's manifest paths.

### Proposal - two tiers

**Tier 1: incremental patch when `archiveBytes` is available.**
In `setManifestTitle` (and any manifest-only mutation), when
`this.archiveBytes.length > 0`, replace the `serializeWorkspaceBytes()` call
with an `addFile` patch:

```js
async setManifestTitle(newTitle) {
    this.assertEditable('set manifest title');
    this.commitPendingTextToWorkspace();
    this.workspaceValue.manifest = MdzPackagerCore.updateManifest(this.workspaceValue.manifest, { title: newTitle });
    this.workspaceValue.title = newTitle;
    const nextBytes = this.archiveBytes.length > 0 && !this.pendingTextDirty
        ? await blobToBytes((await MdzArchiveCore.addFile(this.archiveBytes, 'manifest.json',
              JSON.stringify(this.workspaceValue.manifest, null, 2))).blob)
        : await this.serializeWorkspaceBytes();
    await this.reloadPreservingCurrentText(nextBytes);
    this.dirtyValue = true;
    this.emit('edit', ['manifest'], 'manifest.json');
}
```

No document is ever read; unchanged ZIP entries are carried over. This fixes
browser hosts that use `open(bytes)` directly.

**Tier 2: host-delegated manifest changes for `openWorkspace()` hosts.**
When `archiveBytes` is empty (pre-parsed workspace), the service cannot patch
locally and currently has no choice but the full rebuild. The change event
already carries `changes: ['manifest']` - the missing piece is that
`MdzipWorkspaceView.notifyChanged` unconditionally calls `exportBytes()`
whenever `onChanged` is registered, forcing the rebuild.

Suggestion: add an opt-in `onManifestChanged(manifest, snapshot)` view option.
When the event's `changes` is exactly `['manifest']` and the host registered
`onManifestChanged`, skip the `exportBytes()`/`onChanged` path and invoke
`onManifestChanged` instead. The host then applies the patch natively where
the real bytes live - the VS Code extension would call
`updateManifestTitleInArchive(realArchiveBytes, title)` on the extension-host
side (milliseconds, no round-trips) and mark the document dirty itself.

Hosts that don't register the callback keep today's behaviour, so this is
backward compatible.

### Other rebuild-triggering operations worth auditing

`removeAsset` and `replaceAsset`/`addAsset` also call
`serializeWorkspaceBytes()` and would pull all lazy documents through
round-trips in serialized-workspace hosts. `addFile`/`removeFiles` on existing
bytes could patch those incrementally too (Tier 1); they're less urgent than
the title path because they're not in the first-five-minutes UX the way the
title dialog is, but pasting an image into a large archive will hit the same
wall.

## 5. `addFile`/`removeFiles` recompress every unchanged entry

> **Status: DONE in 1.2.8 local tarballs (2026-06-10).** Implemented as fix
> direction 3 (hand-rolled ZIP splice): new `MdzArchiveCore.updateFiles(bytes,
> writes, removals, { manifest })` parses the central directory and copies
> unchanged entries' compressed data verbatim; only new/replaced entries are
> compressed (deflate-raw via `CompressionStream`, STORE for images, JSZip
> fallback for ZIP64/encrypted/non-UTF-8 archives). `addFile`, `removeFile`,
> and `removeFiles` now delegate to it. Measured `addFile` of manifest.json
> into books.mdz: **12.8s -> 332-454ms**. This unblocks the project-mode
> FileSystemProvider per-file save path.

**Benchmarked 2026-06-10 (core-js 1.2.8):** `MdzArchiveCore.addFile` of a
tiny manifest.json into books.mdz (120MB, 749 documents) takes **12.8s**.
JSZip's `generateAsync` decompresses and recompresses every DEFLATE entry
even when only one entry changed.

This caps the value of item 4 Tier 1 (a manifest patch still costs ~13s on a
large archive instead of milliseconds) and is a hard blocker for the
project-mode FileSystemProvider proposal
([project-mode-folder-editing.md](../project-mode-folder-editing.md)), which
needs per-file saves to patch the archive quickly.

**Fix direction:** carry unchanged entries over verbatim - copy the raw
compressed data and central-directory metadata for untouched entries instead
of round-tripping them through pako. Options, in rough order of effort:

1. JSZip exposes `compressedContent` internally; reusing it requires care but
   avoids a dependency change.
2. Switch incremental operations to a ZIP writer that supports raw-entry
   copy (e.g. yazl/yauzl pairing or fflate's low-level APIs), keeping JSZip
   for full builds.
3. Hand-rolled: ZIP's format makes append/replace tractable - local file
   headers + central directory are independent records; a replace can splice
   the new entry and rewrite only the central directory.

With STORE-compressed images (1.2.6+) the bulk of many archives is already
memcpy on rebuild; this item extends the same principle to the DEFLATE
document entries.
