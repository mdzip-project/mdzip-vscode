# Change Log

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
