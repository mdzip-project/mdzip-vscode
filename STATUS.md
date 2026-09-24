Status: awaiting-test
Last: v1.3.94 — linked images for .md (#14) get the Markdown/HTML + alignment dialog; on published @mdzip/editor 1.4.6; needs a try in real VS Code

v1.3.94: the webview uses the editor's new `context.promptImageInsert` /
`formatImageInsert` (@mdzip/editor 1.4.6) so linked images get the same dialog a
`.mdz` paste does. To make cancel leave nothing on disk the host protocol is now
two-step: `markdownImageRequest` → host picks/decides and replies `prepared`
(nothing written; the copy is staged per request) → dialog in the webview →
`markdownImageCommit {commit}` → host writes (or drops) and replies
`markdownImageCommitted`. Pins `@mdzip/editor` `^1.4.6` from the registry
(local link removed, lockfile refreshed, VSIX rebuilt).

v1.3.91: toolbar Insert Image (not paste — no bytes to place) gains "Link to an
existing image": open dialog starting at the document's folder, then a relative
link to the file where it is. Only inside the document's folder tree — the
editor rejects `../` asset paths (`ERR_PATH_INVALID: path traversal`, checked),
so the preview couldn't show one; outside files get an error pointing at the
copy choices. `relativeImagePath` is unit-tested; the dialog flow isn't.

v1.3.89 (#14): the webview now sets `onConversionRequested` (nav-button
conversion keeps the editor's built-in dialog). For an image paste/insert
into a `.md` it posts `markdownImageRequest`; the host
(`_handleMarkdownImageRequest`) shows a QuickPick (beside / subfolder /
convert), asks for the subfolder name (default `images`), writes the file with
a collision-free name, and answers `markdownImageResult`. The result carries
the image as a data URI, registered in the webview's disk-image map before the
`![](…)` link is inserted so the preview shows it (relative URLs don't load in
the webview). v1.3.90: that map alone wasn't enough — the editor strips the `src`
of any relative image that isn't a workspace asset, so no error event ever
fires for the fallback. The webview now calls `editor.addAsset(path, bytes)`
before inserting the link (verified in a jsdom mount: without it the `<img>`
has no `src`, with it it resolves; the workspace stays `markdown`). Convert runs the editor's own convert-to-.mdz. Unsaved/non-file
documents fall back to the built-in dialog. Pure helpers + payload validation
are in `mdLinkedImage.ts` (6 tests); the host prompts and webview wiring are
**not** unit-tested — try: paste an image into a saved `.md`, insert via the
toolbar picker, each of the three choices, cancelling at each step, a name
collision, and an oversized file.


v1.3.87: `package.json`'s `description` (the Marketplace card and Extensions
view subtitle) and the README's opening sentence described `.mdz` only. Now:
"Edit MDZip (.mdz) files in single document mode — Markdown plus its images
in one portable file — with live preview. Also opens plain Markdown (.md)
files in the same editor via Open With." ("Single document mode" is an .mdz
limitation — no project mode yet, #7 — so it sits by the .mdz wording, not the .md.) It says "via Open With" deliberately: the
`.md` editor is `priority: option`, not the default, and the README already
notes packaged-image/manifest-title features still need `.mdz`.

v1.3.86: VS Code labels each custom editor in the picker "<editor
displayName> - <extension displayName>". Both editors were "MDZip Editor" and
the extension "MDZip (.mdz) Editor", giving "MDZip Editor - MDZip (.mdz)
Editor". Now the extension is "MDZip Editor" and the editors are "MDZip"
(`mdzip.mdzEditor`) and "Markdown" (`mdzip.mdEditor`): "MDZip - MDZip Editor"
for `.mdz`, "Markdown - MDZip Editor" for `.md`. Display names only — ids and
selectors are untouched. **The extension's `displayName` is the public
Marketplace title** — confirm the listing name before publishing. Also fixed
the one in-code mention (the "search the Extensions view" message).

(v1.3.85, previously:) status bar stats tooltip names the Markdown entry
counted inside an .mdz; the icon fix (1.3.84) was confirmed in real VS Code.

The 1.3.84 icon alignment/spacing was confirmed in real VS Code after a
**Reload Window** (contributed icon fonts are only re-read at window load —
"Restart Extensions" isn't enough). v1.3.85: the tooltip's first lines are
the file on disk, then `Document: <archive path>` for an .mdz. Only the
webview knows the current entry, so the report carries it (`entry`); it's
omitted for a plain .md, whose entry name is synthetic. The report-building
logic moved into `mdzStats.ts` (`buildStatsReport`) so that distinction is
unit-tested.

## Status bar document statistics (#12)

One right-aligned item, `<mark> 1,234 words` (tooltip: words, characters,
characters without spaces, lines, reading time at 200 wpm), for the active
MDZip editor tab — `.mdz` and `.md` (`mdzip.mdEditor`) both. Counts the
document currently shown, not the whole archive.

**The mark** (v1.3.83): status bar text can only show codicons or a glyph
from a contributed icon font, and the MDZip mark isn't a codicon. So
`media/icons/mdzip-icons.woff` (built in `../mdzip-mark/font/`, which also
holds the open-folder and Markdown variants) is contributed via
`contributes.icons` (`mdzip-logo`, `mdzip-logo-open`, `mdzip-markdown`), and
the item's text is `$(mdzip-logo) …` for `.mdz`, `$(mdzip-markdown) …` for
`.md`. The glyphs are *traced* from the SVG marks (a font can't hold strokes
or white fills), so they're close to, not identical to, the artwork. A test
pins the code's icon ids, `package.json`'s `contributes.icons`, and the font
file together (a typo in any would silently render nothing), and checks the
font isn't excluded from the VSIX. The glyph was checked rendering in Chromium
at 14–64px on light, dark and coloured backgrounds, but **not in VS Code's
status bar itself** — that's the thing to look at.

- **Where the numbers come from**: the webview (`webviewEditor.ts`) already
  bundles `@mdzip/editor`, so it calls `computeDocumentStats` on
  `onSnapshotChanged` (debounced 200ms, skipped when path+text are unchanged
  — that event also fires for selection moves) and posts a `documentStats`
  report. Importing the editor into the extension host instead would have
  dragged its whole DOM-dependent view into the Node bundle.
- **Guards**: over 3M characters the count is skipped (`too-large`) so typing
  stays responsive; non-Markdown entries (image/binary selected) report
  `none`; the host validates the untrusted payload (`parseStatsReport`).
- **Not repeating Office Viewer's stale item** (the leftover `Line 66 Count
  2278` seen earlier): `mdzStatsStatusBar.ts` derives visibility from the tab
  model (`tabGroups.activeTabGroup.activeTab.input` being a `TabInputCustom`
  of ours) on every tab change, rather than tracking show/hide by hand. Diff
  views and every other tab type hide it. Reports are stored per document URI,
  so a document can never show another's numbers, `forget()` drops a report
  when its last panel closes, and `dispose()` (registered with the provider)
  unsubscribes and disposes the item.
- **Tests** (`mdzStats.test.cjs`, 20): report parsing/formatting, plus the
  visibility rules against an extended `vscode` mock. Confirmed two
  mutations fail them: showing a stale item when the active tab isn't ours (4
  failures) and `dispose()` not unsubscribing (1). Full `npm test` green.
- **Not verified in real VS Code** — no API to read status bar items, so it's
  untested end to end. Try: open a `.mdz`/`.md` (item appears, updates as you
  type), switch to a text file (item disappears), close the document (gone),
  open a diff, and confirm nothing lingers.
- Deliberately left out: selection stats, a click action, and a setting to
  turn it off (see #11's settings backlog).

## Earlier in this batch (v1.3.79–1.3.81)

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
