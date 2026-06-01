# Change Log

## [0.1.61] - 2026-05-31
### Added
- Command `MDZip: Enable Workspace Agent Instructions` to write/update `.github/copilot-instructions.md` with guidance that tells agents to call `mdz_review_document` first for `.mdz` review tasks.

## [0.1.60] - 2026-05-31
### Added
- MCP tool `mdz_review_document` that returns markdown content plus referenced image payloads in one call for no-extraction document review.

### Changed
- Updated MCP tool descriptions to guide agents toward `mdz_review_document` as the preferred first call for `.mdz` review/analyze/summarize requests.

## [0.1.59] - 2026-05-31
### Changed
- First-run activation now always shows a visible MDZip install notification with direct actions for Getting Started and Extension Details.

## [0.1.58] - 2026-05-31
### Changed
- First-run onboarding now auto-opens the MDZip walkthrough instead of relying only on a notification button.
- Versioned the first-run walkthrough flag so existing installs receive the updated onboarding behavior once.

## [0.1.57] - 2026-05-31
### Added
- Walkthrough step explaining that the bundled MDZip MCP server is auto-discovered and may need a trust/start approval in VS Code.
- Command `MDZip: Open Extension Help` to jump back to the extension details or Extensions UI when users need the bundled MCP setup surface again.

## [0.1.55] - 2026-05-31
### Fixed
- VSIX packaging now excludes local design/test artifacts (nested `.mdz`/`.zip` files and `design/**`) while still shipping the bundled MCP server.

- Automatic bundled MCP server discovery via VS Code MCP server definition provider API, reducing or eliminating manual `mcp.json` setup.
- Getting-started walkthrough and first-run prompt for lightweight onboarding.
### Added
- MCP tool `mdz_read_markdown_embedded_images` to read markdown entries with image links embedded as data URLs (no extraction).
- Command `MDZip: Enable Workspace MCP Server` to one-click write/update `.vscode/mcp.json` for easier MCP setup.

## [0.1.54] - 2026-05-31
### Added
- Bundled MDZip MCP stdio server (`dist/mdz-mcp-server.js`) with tools for listing archive entries, reading text entries, and reading image entries without extracting files.
- New command: `MDZip: Copy MCP Server Config Snippet` to help users wire the bundled MCP server into their agent setup.

## [0.1.53] - 2026-05-31
### Fixed
- Title updates now round-trip through the extension host and immediately refresh webview content from document state, preventing toolbar title and `manifest.json` title from diverging after save.

## [0.1.52] - 2026-05-31
### Fixed
- Title dialog `Reset` now restores the currently saved/displayed package title instead of injecting a derived filename fallback (which could unintentionally write values like `README`).

## [0.1.51] - 2026-05-31
### Fixed
- Toolbar title now resolves from raw `manifest.json` title when strict manifest parsing metadata is unavailable, so saved title changes remain visible after reload/reopen.

## [0.1.50] - 2026-05-31
### Fixed
- Updating the document title now refreshes `manifest.json` content immediately when it is the active selection, instead of keeping stale pre-update text in the preview.

## [0.1.49] - 2026-05-31
### Fixed
- Enabled syntax highlighting for text-file previews (for example `manifest.json`, `.css`, and `.js`) instead of plain unstyled output.
- Disabled the `Edit` and `Split` toggle buttons for non-editable entries so toolbar state clearly matches file capabilities.
- Updated toolbar sizing so long document titles use available horizontal space instead of truncating too aggressively.

- Commands `MDZip: Enable User MCP Server`, `MDZip: Open Getting Started`, and `MDZip: Open MCP Server Status` for lower-friction setup and support.
## [0.1.48] - 2026-05-31
### Changed
- Added language-aware syntax highlighting for fenced code blocks in Markdown preview, covering common formats such as JSON, CSS, and JavaScript.

## [0.1.47] - 2026-05-31
### Changed
- Made manifest.json read-only in the custom editor (disabled edit mode and guarded document-level edit/save write paths).
- Moved the nav show/hide button into a separate left-side toolbar group so it is visually and functionally separated from preview/edit/split view controls.

## [0.1.46] - 2026-05-31
### Changed
- Added drag-resize handles for the left contents pane and the split edit/preview divider, with per-editor persisted widths.
- Updated split layout ordering to keep Edit on the left and Preview on the right.

## [0.1.45] - 2026-05-31
### Changed
- Split view now renders both panes side-by-side inside the same editor window instead of opening a second VS Code panel. Scroll sync between edit and preview panes works locally within the webview — no host roundtrip.

## [0.1.44] - 2026-05-31

### Fixed
- Synchronized forced-preview transitions back to the host mode map so returning from non-editable entries no longer leaves the Edit toggle selected while rendering preview.

## [0.1.43] - 2026-05-31

### Fixed
- Prevented invalid mode state in the custom editor toolbar by forcing non-editable selections to preview layout (so Edit/Split cannot remain active while rendering non-editable entries like `image.png`).

## [0.1.42] - 2026-05-31

### Fixed
- Contents tree selection now forces preview mode for non-editable entries, fixing cases where selecting `image.png` appeared to keep showing the previously edited text file.

## [0.1.41] - 2026-05-31

### Changed
- Added automatic fallback for binary entries: when selected in the contents tree, they still show the in-pane fallback message and also open in VS Code's default registered viewer.

## [0.1.40] - 2026-05-31

### Changed
- Contents tree selection now opens files in-place inside the right pane of the custom editor instead of opening separate tabs.
- Added type-aware in-pane rendering: Markdown preview, plain-text preview, image preview, and binary-file fallback messaging.

## [0.1.39] - 2026-05-31

### Changed
- Contents tree nodes now open extracted files in VS Code's default registered viewer for each file type.
- Tightened `.gitignore` and `.vscodeignore` to keep local test artifacts out of commits and published VSIX packages.

## [0.1.38] - 2026-05-31

### Changed
- Improved the contents pane with a tree-style icon and file-switching behavior so selecting text-file nodes loads that file in the editor.

## [0.1.37] - 2026-05-31

### Added
- Optional left-side contents tree in the custom editor, built from archive entries and toggled from the toolbar.

## [0.1.36] - 2026-05-31

### Added
- Prompt to copy relative image references into the .mdz archive during `.md` to `.mdz` conversion.

## [0.1.35] - 2026-05-31

### Added
- Prompt markdown-backed editor sessions to convert `.md` files to `.mdz` when pasting an image, then package the pasted image into the new archive.

## [0.1.34] - 2026-05-31

### Fixed
- Bumped release version before packaging to keep the VSIX metadata aligned with the release.

## [0.1.33] - 2026-05-31

### Added
- Optional `Open With...` registration for `*.md` files via `MDZip Editor` without replacing the default Markdown editor.

### Changed
- Updated README feature documentation to describe optional Markdown editor selection behavior.

## [0.1.32] - 2026-05-30

### Changed
- Refreshed extension icon assets using the updated mdzip-mark artwork for Explorer and Marketplace icons.

## [0.1.31] - 2026-05-29

### Added
- `.md` to `.mdz` conversion command: `MDZip: Convert .md To .mdz`.
- `.mdz` language icon contribution for Explorer entries using SVG assets.
- Marketplace icon generated from project SVG mark assets.
- New shared metadata helpers in `src/shared/editorMetadata.ts` for title and filename fallback logic.

### Changed
- Toolbar layout controls are now document-level toggles: `Preview`, `Edit`, `Split`.
- Side-by-side behavior now preserves the current pane and opens/closes counterpart panes as needed.
- Toolbar mode controls were restyled as icon toggles with tooltips and accessibility labels.
- Zoom controls were redesigned to an Edge-style cluster with `%` readout, `-` / `+`, and `Reset`.
- Webview code now uses a host bridge boundary (`createVscodeHost`) to reduce direct VS Code coupling.
- Context menu and command contributions were simplified by removing the old dedicated side-by-side command entry points.

### Fixed
- Prevented edit sessions from unexpectedly flipping back to preview mode.
- Fixed packaged Markdown rendering by bundling local `marked.min.js` in webview media.
- Enabled image paste into `.mdz` with persistence into archive assets.
- Improved split-pane scroll synchronization and reduced duplicate-scroll behavior.
- Improved pane-mode uniqueness enforcement (one edit pane + one preview pane per document).
- Empty `.mdz` files now bootstrap to a valid starter archive on open.

## [0.1.0] - 2026-04-25

### Added
- Initial release
- Custom editor for `.mdz` files with rendered Markdown preview
- Edit/Preview toggle for switching between source and rendered views
- Full save, Save As, Revert, and backup support
- Packaged images rendered as embedded data URIs
- "MDZip: New .mdz Document" command to create a new archive
