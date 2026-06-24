# Change Log

## [1.3.23] - 2026-06-23
### Added
- Pasting or dropping an image into the editor now opens a dialog to choose Markdown or HTML, alt text, sizing, and alignment instead of inserting a bare `![Pasted image](...)`. The HTML option uses portable `align` attributes so positioning survives the preview sanitizer.

### Changed
- Upgraded to the published `@mdzip/editor` 1.3.12 and `@mdzip/core-js` 1.3.2 npm packages.
- Packaged images in the preview no longer replay their loading animation on every keystroke. The first-load reveal is preserved, but images now snap open on same-document edits (`imageHydrationAnimation: 'initial'`).

## [1.3.22] - 2026-06-16
### Added
- Added a sample MDZip document (`samples/mdzip-overview.mdz`) that explains the `.mdz` format and demonstrates a packaged banner image and two Mermaid diagrams, along with the `scripts/build-sample-mdz.mjs` generator used to produce it.

### Changed
- Upgraded to the published `@mdzip/editor` 1.3.11 npm package (`@mdzip/core-js` remains at 1.3.1, its latest published version).

## [1.3.17] - 2026-06-15
### Fixed
- Archive images no longer render as broken placeholders in the editor. The webview Content-Security-Policy now allows `blob:` image sources, which the editor library uses (via `URL.createObjectURL`) when resolving packaged assets.

## [1.3.14] - 2026-06-15
### Added
- Interactive archive diff view: comparing `.mdz` archives now opens a status-aware navigation pane with read-only side-by-side text diffs and image or binary metadata comparisons, and the navigation pane can be hidden or restored with a familiar left-aligned panel icon.
- Orphaned asset detection: serialized archive workspaces now report packaged images that are no longer referenced by Markdown.

### Changed
- Upgraded to the published `@mdzip/editor` 1.3.8 and `@mdzip/core-js` 1.3.1 npm packages (replacing the local development tarballs).
- Large `.mdz` archives now provide their backing ZIP bytes to the editor so image and asset mutations remain incremental and preserve the latest document text.
- Initial editor content is sent only once when the webview starts.

### Fixed
- Markdown files opened from Git changes now use VS Code's built-in text diff even when MDZip is configured as the default `.md` editor.
- `.mdz` files opened from Git changes now show the archive-aware contents comparison instead of opening each revision as a normal custom editor, and reopening one reuses its existing archive diff instead of scheduling another diff view.
- Archive diffs are revealed only after the transient Git custom-editor panel is closed, preventing a regular editor tab from flashing briefly.

## [1.3.2] - 2026-06-11
### Fixed
- Removed the tracked workspace MCP config so the extension relies on the bundled provider instead of a stale repo-local server entry.

## [1.3.1] - 2026-06-11
### Added
- Added manifest-only patching in the extension host so title edits update `manifest.json` directly instead of forcing a full archive rebuild.
- Added incremental raw-bytes handoff for small archives so archive mutations can patch existing ZIP bytes instead of reserializing the whole document.
- Added an update-proof MCP launcher so workspace, user, and Codex server configs no longer pin a versioned extension install path.

### Changed
- Upgraded the extension to the published `@mdzip/editor` and `@mdzip/core-js` 1.3.0 packages.
- Expanded the README command list and MCP setup guidance to cover archive diffs, extraction, and Codex config helpers.
- Archived the finished `mdzip-editor-improvements` design note.

### Fixed
- Long-running on-demand document reads now time out with a visible error instead of hanging silently.
- Removed the non-functional Cut/Copy/Paste context menu from the archive navigation pane and toolbar.

## [0.1.249] - 2026-06-11
### Fixed
- Removed the non-functional Cut/Copy/Paste context menu in the editor's navigation pane and toolbar. The context menu still appears where it works: text inputs, the markdown editor, and selected preview text.

## [0.1.247] - 2026-06-10
### Changed
- Upgraded `@mdzip/editor` and `@mdzip/core-js` to 1.2.9: archive mutations now patch existing ZIP bytes incrementally instead of rebuilding the whole archive (unchanged entries are copied verbatim).
- Setting the document title is now near-instant on any archive size — manifest-only edits no longer rebuild the archive in the webview; the extension patches `manifest.json` into the real bytes directly (books.mdz: from tens of seconds to ~350ms).
- Archives up to 16MB ship raw bytes to the editor so image paste and asset removal patch the ZIP incrementally too.

### Fixed
- A lost document-text request in the editor now fails with a visible error after 30s instead of leaving the editor silently unresponsive.

## [0.1.245] - 2026-06-10
### Added
- Live theme sync: the editor now follows VS Code color theme changes immediately, without recreating the editor or losing unsaved edits.
- Added unit tests for the document lifecycle (open, save, save-as, revert) and an Extension Development Host integration suite for save behaviour.

### Changed
- Upgraded `@mdzip/editor` and `@mdzip/core-js` to 1.2.8. Image assets are stored uncompressed inside the ZIP (images are already compressed formats), making image paste near-instant instead of taking tens of seconds.
- Large multi-document archives now open lazily: a 126MB archive with 749 documents opens in under a second, and document text is fetched on demand when opened from the contents tree.
- Pasting an image into a plain `.md` file and choosing Convert now auto-saves the converted `.mdz` document instead of leaving an unsaved editor behind.

### Fixed
- Fixed clicking a document in the contents tree of a large archive showing an empty file.
- Fixed potential data loss when editing multi-document archives: documents not yet opened could be written back empty on save (resolved in `@mdzip/core-js` 1.2.8 together with on-demand text loading in the extension).

## [0.1.182] - 2026-06-04
### Added
- Added template-based `.mdz` document creation with built-in templates, custom template folders, folder templates, and prompted template parameters.
- Added `MDZip: Enable Codex MCP Server` and a first-run AI tool setup flow for writing Codex MCP configuration.
- Added archive-level Git comparison with `MDZip: Compare Archive Contents with Git Base`, including canonical Markdown and archive inventory diffs.
- Added `mdz_search_text` so MCP clients can search UTF-8 text entries inside `.mdz` archives directly.

### Changed
- Switched the VS Code webview to the published `mdzip-editor` package and opened converted/new documents in split layout by default.
- Improved Git compare command handling from editor tabs, Explorer menus, and source-control resource contexts.

### Fixed
- Refreshed clean open editors when their backing `.mdz` or `.md` file changes on disk.

## [0.1.168] - 2026-06-04
### Added
- Added `MDZip: New .mdz file...` with built-in Default document and Agile Story templates.
- Added configurable template folders, folder-based templates, custom parameter prompts, and template folder helper commands.

## [0.1.165] - 2026-06-03
### Fixed
- Refreshed open MDZip custom editors when the backing `.mdz` or `.md` file changes on disk and the editor has no unsaved local edits.

## [0.1.164] - 2026-06-03
### Added
- Added `mdz_search_text` so MCP clients can search UTF-8 text entries inside `.mdz` archives directly.

## [0.1.112] - 2026-06-01
### Changed
- Switched `mdzip-core-js` from a local tarball dependency to the published npm package at version `1.1.1`.

## [0.1.111] - 2026-06-01
### Added
- Added Node-based archive utility tests and wired `npm test` to run archive coverage plus the MCP smoke suite.

### Changed
- Prepared the VSIX for Marketplace packaging by excluding local development artifacts and test files.
- Added Marketplace metadata links for repository issues and README homepage.

## [0.1.79] - 2026-06-01
### Added
- Added documentation and website commands, plus walkthrough steps for finding MDZip docs and mdzip.org from VS Code.

### Changed
- Refined Marketplace packaging so the VSIX ships only runtime bundles, media assets, README, changelog, and license content.

## [0.1.61] - 2026-05-31
### Added
- Added `MDZip: Enable Workspace Agent Instructions` to write `.github/copilot-instructions.md` guidance that nudges agents to use `mdz_review_document` first for `.mdz` review tasks.

## [0.1.60] - 2026-05-31
### Added
- Added the bundled MDZip MCP stdio server with tools for listing archive entries, reading text and image entries, embedding archive images into markdown, and reviewing canonical `.mdz` document content without extracting files.
- Added commands for MCP setup and support, including copying MCP config snippets, enabling workspace/user MCP config, opening MCP server status, and reopening extension help.
- Added first-run onboarding and a getting-started walkthrough for opening `.mdz` files and enabling the bundled MCP server.

### Changed
- Improved MCP tool guidance so agents start with `mdz_review_document` for review, analysis, and summarization workflows.

## [0.1.53] - 2026-05-31
### Fixed
- Improved manifest title editing so toolbar titles, `manifest.json`, saved archives, and reopened documents stay in sync.
- Prevented manifest editing through the custom editor while preserving read-only preview behavior for `manifest.json`.

## [0.1.49] - 2026-05-31
### Added
- Added in-place archive contents browsing with Markdown, text, image, and binary entry handling.
- Added syntax highlighting for common text previews and fenced Markdown code blocks.

### Changed
- Improved toolbar behavior for preview, edit, and split modes, including non-editable entry handling and better title sizing.
- Added resizable contents and split panes with persisted editor layout.

## [0.1.45] - 2026-05-31
### Added
- Added split view inside the custom editor with side-by-side editing and preview.
- Added scroll synchronization between edit and preview panes.

## [0.1.37] - 2026-05-31
### Added
- Added an optional contents tree for browsing files inside `.mdz` archives.
- Added support for opening archive entries from the contents tree.

## [0.1.36] - 2026-05-31
### Added
- Added prompts to copy relative Markdown image references into `.mdz` archives during conversion.
- Added image paste support for Markdown-backed editor sessions, including conversion to `.mdz` when needed.

## [0.1.33] - 2026-05-31
### Added
- Added optional `Open With...` support for `.md` files without replacing VS Code's default Markdown editor.
- Added `.md` to `.mdz` conversion from the command palette, explorer context menu, and editor title menu.
- Added `.mdz` language icon support and refreshed Marketplace/Explorer icon assets.

### Changed
- Redesigned editor toolbar controls for preview, edit, split, and zoom workflows.
- Improved webview structure with a host bridge boundary and shared metadata helpers.
- Fixed Markdown rendering in packaged builds by shipping local `marked` assets.

## [0.1.31] - 2026-05-29
### Added
- Added shared editor metadata helpers for deriving document titles from Markdown headings, manifest titles, and filenames.

### Fixed
- Improved image paste persistence, split-pane mode consistency, and empty `.mdz` bootstrap behavior.

## [0.1.0] - 2026-04-25
### Added
- Initial release with a custom editor for `.mdz` files.
- Added rendered Markdown preview, source editing, save/save-as/revert/backup support, packaged image rendering, and new `.mdz` document creation.
