# Project Mode: Folder-Based Editing

Status: proposal (2026-06-10). Not started.

## Motivation

Every large-archive problem hit during the 1.2.7/1.2.8 integration —
multi-hundred-MB webview payloads, lazy-document round-trips, full ZIP
rebuilds for manifest-only changes, lazy-text data loss — comes from one root
cause: the archive is a single in-memory blob, so any edit means "rebuild the
world."

For document mode (one markdown file plus images) that model is fine, and the
webview editor is the right UX. For project mode — books.mdz is 126MB with
749 documents — the archive is conceptually a *folder of documents*, and the
single-blob model is the wrong altitude. Once entries live individually
somewhere, an edit is a file write, and the entire class of rebuild problems
evaporates. Native tooling comes free: real text editors, workspace search,
file watchers, markdown language servers, image viewers.

## Two approaches

### A. Extract to temp folder, repackage on save

Unpack the archive to a temp directory on open, work on loose files, re-zip
on save.

Pros:
- Simple mental model; works in any host, not just VS Code
- External tool interop: edit an image in Photoshop, run scripts over the tree
- OS page cache instead of extension-host RAM for large archives
- Crash recovery: the tree survives; unsaved work can be restored

Cons (each needs real engineering):
- **Two sources of truth.** The extracted tree must be authoritative between
  open and save; external modification of the .mdz while open needs conflict
  handling; save must be atomic (write temp zip → rename)
- **Cleanup.** Orphaned temp trees after crashes need a session registry and
  stale-dir GC
- **Filename hazards.** ZIP entries can be invalid on Windows (`:`, trailing
  dots), and case collisions (`Readme.md` vs `readme.md`) break on
  case-insensitive filesystems — requires a sanitization/mapping layer
- **Plaintext on disk.** Documents land in temp locations where backup/sync
  software can pick them up

### B. VS Code `FileSystemProvider` (virtual `mdz:` folder) — preferred for the extension

Mount the archive as a virtual folder so VS Code treats entries as files:
standard editors, explorer tree, and search all work, but reads/writes go
through the provider directly into the archive. Same pattern as the zipfs
extension.

- No extraction → no second source of truth, no temp cleanup, no on-disk
  filename constraints, nothing plaintext in temp
- Writes patch the archive incrementally: `MdzArchiveCore.addFile` on the
  real bytes, per file save. With STORE-compressed images (core 1.2.6+),
  regenerating books.mdz is mostly memcpy — sub-second
- Dirty state and save UX are per-file and handled by VS Code natively;
  the .mdz on disk updates on each entry save (or debounced)

Sketch:

```ts
// extension.ts
vscode.workspace.registerFileSystemProvider('mdz', new MdzFs(), {
  isCaseSensitive: true,
});

// Open project-mode archive as workspace folder:
// mdz:/<encoded-path-to-archive>/...entries
vscode.workspace.updateWorkspaceFolders(0, 0, {
  uri: vscode.Uri.parse(`mdz:/${encodeURIComponent(mdzPath)}`),
  name: path.basename(mdzPath),
});

class MdzFs implements vscode.FileSystemProvider {
  // stat/readDirectory: from MdzArchiveCore.open(bytes).listEntries()
  // readFile: archive.readBytes(entryPath)
  // writeFile: bytes = await MdzArchiveCore.addFile(bytes, entryPath, content);
  //            atomically rewrite the .mdz; fire onDidChangeFile
  // delete/rename: removeFiles / addFile+removeFiles
}
```

Open questions for B:
- Entry point / manifest editing UX inside the mounted folder (raw
  manifest.json edits vs. commands)
- Preview: the webview editor could still render any single document from the
  mounted tree (read-only or round-tripping edits through the provider)
- Whether opening the folder replaces or supplements the current custom
  editor when an .mdz with `mode: 'project'` is opened — likely a "Open as
  Folder" command + a prompt for project-mode archives

## Recommended hybrid

- **Document mode**: keep the current webview editor. Its remaining hot paths
  are fixed by incremental library ops (see
  [mdzip-editor-improvements.md](archive/mdzip-editor-improvements.md) item 4).
- **Project mode in VS Code**: mount via FileSystemProvider (approach B).
- **Temp extraction (approach A)**: keep as an explicit interop workflow, not
  the editing model — `mdzip.extractToFolder` already exists, and mdzip-cli
  is the natural home for an unpack/pack pair for non-VS Code hosts.

## Library implications

Approach B needs nothing new from `@mdzip/editor` — it bypasses the workspace
service entirely for project mode and talks to `@mdzip/core-js` directly
(`open`, `listEntries`, `readBytes`, `addFile`, `removeFiles`).

**Benchmarked 2026-06-10 (core-js 1.2.8):** `addFile(booksMdzBytes,
'manifest.json', …)` takes **12.8s** on the 120MB / 749-document archive —
JSZip decompresses and recompresses every unchanged DEFLATE entry on
`generateAsync`. That is too slow for per-file saves, so carrying unchanged
compressed entries over verbatim is a **prerequisite** for approach B. Filed
as item 5 in [mdzip-editor-improvements.md](archive/mdzip-editor-improvements.md).
(It also bounds Tier 1 of item 4: a manifest patch via `addFile` on books.mdz
costs ~13s today — still better than the current full rebuild with webview
round-trips, but not the milliseconds it should be.)
