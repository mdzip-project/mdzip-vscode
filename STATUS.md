Status: ready-to-commit
Last: v1.3.81 on published @mdzip/editor 1.4.5 — #13 workspace links, in-page #heading anchors, duplicate-tail fix, spelling hint hidden; full test run green, VSIX rebuilt

v1.3.79 adds nothing of its own beyond rebuilding against `@mdzip/editor`'s
new heading anchors (see its STATUS.md): `[x](#heading)` scrolls the
preview to that heading. Test with
`TestFiles/link-navigation-test/main.md` (case 6 and the top link).

## Open/reveal workspace-relative preview links (#13)

Landed while auditing whether any open Studio/vscode issues actually needed
an `@mdzip/editor` fix — this was the one that did. `view.ts`'s preview
click handler only ever acted on links resolving to another Markdown doc
inside the same archive; anything pointing outside it (`../README.md`,
`./docs/`) silently fell through to the browser's own default navigation,
which is inert/broken inside a webview. Fixed in two repos:

1. **`@mdzip/editor`**: new `onUnresolvedLinkClick(href, snapshot)` hook,
   fired (with default navigation suppressed) for a link that's
   workspace-relative-shaped but didn't resolve internally — skipped for
   plain external URLs/`mailto:`/fragments. Published in 1.4.5 (see its own
   STATUS.md); this repo's pin is now `^1.4.5` from the registry.
2. **Here**: `webviewEditor.ts` wires the hook to a new `openExternalLink`
   postMessage (mirroring the existing `openPath` message's shape).
   `mdzEditorProvider.ts`'s new `_openWorkspaceRelativeLink` resolves the
   href against the `.mdz`/`.md` file's own on-disk directory (explicitly
   *not* any archive-internal path structure — an .mdz's internal folders
   don't correspond to anything real on disk, per the issue's own
   clarification) via `vscode.workspace.fs.stat`: a directory reveals in
   Explorer, a `.md` file opens forced into this extension's own preview
   mode (`MdzEditorProvider.markNextOpenInPreview` + `vscode.openWith` on
   `MARKDOWN_VIEW_TYPE` — an existing hook that had never actually been
   called from anywhere until now), anything else opens via
   `vscode.open`'s default-editor resolution, and anything that resolves to
   neither is left inert. `.mdz`-to-`.mdz` links are intentionally out of
   scope.

Verified: extracted the href-cleaning step (strip `#`/`?`, percent-decode)
into an exported `decodeWorkspaceLinkHref`, unit-tested directly (8 cases:
fragment/query stripping, percent-decoding, malformed escapes, empty/
fragment-only input, trailing-slash preservation) via a new
`bundle:test-editor-provider`/`test:editor-provider` pair mirroring the
existing `mdzDocument`/`mdzTemplates` test-bundle pattern — `mdzEditorProvider.ts`
had no test coverage at all before this. The vscode-API-heavy half (stat,
openWith, revealInExplorer) isn't unit-tested, consistent with the rest of
this file; `@mdzip/editor`'s own `onUnresolvedLinkClick` tests cover that
the hook fires correctly (see its STATUS.md). Full `npm run test` green
(now 5 steps), `tsc` compiles clean. Version bumped 1.3.77 → 1.3.78 for
this change; VSIX repackaged at `build/mdzip-vscode-1.3.78.vsix`.

Not yet manually tested against a real workspace/repo — only unit-level so
far. Kyle should verify: a relative link to a file in the surrounding repo
opens it in preview; a link to a folder reveals it in Explorer; a link to
nothing on disk does nothing, all against a `.mdz`/`.md` opened both via
"Open Folder" and via "Open File" alone. The `onUnresolvedLinkClick` hook it
relies on shipped in `@mdzip/editor` 1.4.5, so nothing here depends on a
local link any more.

## Two earlier pieces of work below, both confirmed by Kyle in real VSIX builds

## localResourceRoots fix

The custom editor's webview never set `localResourceRoots`, so it fell
back to VS Code's default (extension directory + open workspace folders)
— which doesn't include an arbitrary file's own containing directory when
that directory isn't itself an open workspace folder (e.g. opening a
single `.md` file via "Open File" rather than "Open Folder"). Relative
images 403'd in that case. `mdzEditorProvider.ts`'s `resolveCustomEditor`
now explicitly includes the document's own directory alongside the
existing defaults.

## Picked up from @mdzip/editor

Brings in that package's own fixes (see its STATUS.md): the editor/preview
scroll-jump-on-edit fix (#46) and the highlight.js webview bundle-size
reduction (#45, ~5.3MB → ~4.3MB). Both confirmed working by Kyle against
the originally-reported repro file after several rounds of live debug-build
iteration, originally via a local dev symlink during that debugging cycle.

Version bumped to 1.3.77 across the debugging cycle (1.3.65 → 1.3.77); all
debug logging has been stripped back out and confirmed absent from the
built bundle. `@mdzip/editor` published 1.4.4 (containing #43/#45/#46);
the dependency pin here is now bumped to `^1.4.4` and `node_modules`
reinstalled from the registry (dev symlink removed), then rebuilt/
repackaged: final clean VSIX at `build/mdzip-vscode-1.3.77.vsix`.

<!-- Status: idle | in-progress | awaiting-test | ready-to-commit | blocked -->
