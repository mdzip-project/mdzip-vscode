# MDZip VS Code Source Control Diff Plans

## Goal

Improve `.mdz` review from VS Code Source Control in two stages:

1. Ship the best stable workflow available today.
2. Prepare for the ideal workflow where clicking a changed `.mdz` in Source Control opens an MDZip semantic diff automatically.

This work belongs in `mdzip-vscode`. Reusable archive-reading and inventory-diff logic should stay in `@mdzip/editor`.

## Current Constraint

The ideal Source Control click behavior depends on VS Code custom editor diff APIs:

- `diffEditorPriority` in the `customEditors` contribution.
- `resolveCustomEditorInlineDiff(...)` and/or `resolveCustomEditorSideBySideDiff(...)` on the custom editor provider.

As of VS Code 1.120, these APIs are still described as proposed. The extension currently targets VS Code `^1.116.0`, so the shippable plan must avoid depending on those APIs.

## Plan 1: Stable Workflow We Can Ship Today

### Desired Behavior

- Opening a `.mdz` normally opens the regular MDZip editor.
- Source Control and Explorer context menus offer an explicit MDZip diff command.
- The command opens a read-only semantic diff without requiring proposed VS Code APIs.
- Existing compare commands remain available for arbitrary `.mdz` comparisons.
- No automatic tab listener hijacks normal `.mdz` opens.

### Plan 1.1: Remove the Current Tab-Interception Workaround

Delete or disable the `vscode.window.tabGroups.onDidChangeActiveTabGroup(...)` handler that detects any opened `.mdz`, runs `mdzip.compareWithGitBase`, and closes the tab.

That workaround is too broad because it affects normal editor opens, not only Source Control review opens.

### Plan 1.2: Keep and Tighten the Manual Git Compare Command

Keep `mdzip.compareWithGitBase` as the stable Source Control entry point.

Make sure it:

- Resolves `resourceUri` correctly from `scm/resourceState/context`.
- Only appears for `.mdz` resources in SCM menus.
- Uses `vscode.workspace.fs.readFile(uri)` for working-copy reads.
- Handles files outside Git, untracked files, deleted files, and empty base files with clear messages.
- Does not require the file to be opened in the custom editor.

### Plan 1.3: Replace the Markdown-Only Diff with a Semantic Diff Webview

The existing command can keep using `vscode.diff` as a fallback, but the main stable path should open a dedicated read-only webview panel.

The webview should show:

- Canonical markdown diff for the resolved entry point.
- Archive inventory summary with counts for added, removed, and changed files.
- Detailed entry list with path, kind, size, and status.
- Manifest changes if useful.
- Friendly error states when either side cannot be read or parsed.

The diff webview must not expose edit or save controls.

### Plan 1.4: Build the Diff Model from `@mdzip/editor`

Import the reusable helpers:

```ts
import {
  readCanonicalMarkdown,
  createArchiveInventory,
  diffArchiveInventories
} from '@mdzip/editor';
```

Build a model from the Git base bytes and working-copy bytes:

```ts
const beforeMarkdown = await readCanonicalMarkdown(beforeBytes);
const afterMarkdown = await readCanonicalMarkdown(afterBytes);

const beforeInventory = await createArchiveInventory(beforeBytes);
const afterInventory = await createArchiveInventory(afterBytes);

const inventoryDiff = diffArchiveInventories(beforeInventory, afterInventory);
```

This should not go through `MdzDocument.create(...)` for diff-only reads, because normal document creation may convert empty `.mdz` files into starter archives.

### Plan 1.5: Add a Small Diff Rendering Surface

Prefer a focused diff view over reusing the editable MDZip editor shell.

Implementation options:

- Add a small `MdzDiffPanel` module that owns the webview HTML, message setup, and render payload.
- Reuse existing bundled browser/editor styling only where it does not bring edit controls with it.
- Keep the initial version simple: server-build the diff model, then send one `mdzip.diff.load` message when the webview is ready.

Example message shape:

```ts
panel.webview.postMessage({
  type: 'mdzip.diff.load',
  before: {
    uri: beforeUri.toString(),
    entryPoint: beforeMarkdown.entryPoint,
    markdown: beforeMarkdown.markdown,
    manifest: beforeMarkdown.manifest
  },
  after: {
    uri: afterUri.toString(),
    entryPoint: afterMarkdown.entryPoint,
    markdown: afterMarkdown.markdown,
    manifest: afterMarkdown.manifest
  },
  inventoryDiff
});
```

### Plan 1.6: Preserve Existing Explicit Compare Workflows

Keep `mdzip.compareMarkdown` for arbitrary two-file comparisons unless it is replaced by a better semantic compare command.

The command-based workflow remains useful for:

- Current stable VS Code versions.
- Comparing two arbitrary `.mdz` files outside Source Control.
- Users who prefer explicit commands.
- Future fallback when a user selects a different default diff editor.

### Plan 1.7: Test the Shippable Workflow

Manual extension-host test:

1. Open a Git repo with `mdzip-vscode` installed in the extension host.
2. Modify a tracked `.mdz`.
3. Open Source Control.
4. Right-click the changed `.mdz`.
5. Run `MDZip: Compare with Git Base`.
6. Confirm the semantic diff webview opens.
7. Confirm normal opening a `.mdz` opens the regular MDZip editor.
8. Confirm added, deleted, corrupt, and renamed `.mdz` states produce acceptable results or clear messages.

Add regression coverage if the repo gains an extension-test harness. At minimum, keep `@mdzip/editor` tests covering added, removed, changed, and unchanged archive entries.

## Plan 2: Future Native Source Control Click Workflow

### Desired Behavior

- A user modifies a tracked `.mdz` file.
- The file appears in the Source Control Changes pane.
- The user clicks the changed `.mdz` entry.
- VS Code opens an MDZip semantic diff automatically.
- Opening a `.mdz` normally still opens the regular MDZip editor.
- Explicit diff commands remain available as fallback and for arbitrary comparisons.

### Plan 2.1: Reconfirm API Maturity

Before implementation, verify that custom editor diff APIs are stable in the target VS Code engine version.

Required stable surface:

- `diffEditorPriority` in `contributes.customEditors`.
- A stable custom editor diff provider interface.
- Stable signatures for inline and/or side-by-side diff resolvers.
- Type support in `@types/vscode` without copied proposed API files.

If the APIs are still proposed-only, keep this plan as an Insiders-only experiment and do not ship it in the Marketplace extension.

### Plan 2.2: Update the `.mdz` Custom Editor Contribution

Use the existing `.mdz` custom editor view type:

```json
{
  "viewType": "mdzip.mdzEditor",
  "displayName": "MDZip Editor",
  "selector": [
    { "filenamePattern": "*.mdz" }
  ],
  "priority": "default",
  "diffEditorPriority": "default"
}
```

Use a separate diff view type only if VS Code's final API requires it or if normal editing and diff rendering become too awkward inside one provider.

### Plan 2.3: Implement the Custom Editor Diff Resolver

Extend the existing provider, or a dedicated read-only provider, to implement the stable diff resolver method.

Start with inline diff if the MDZip semantic diff is a single webview comparing both archives. Use side-by-side only if the intended UX is two coordinated archive views managed by VS Code.

### Plan 2.4: Read Both Archive Versions Safely

The diff resolver should read both sides by URI using `vscode.workspace.fs.readFile(uri)`, because Source Control diffs may use non-`file:` URIs.

For each side:

- Respect the cancellation token around slower parsing and rendering setup.
- Treat missing, deleted, empty, corrupt, or unsupported archives as diff-side states.
- Avoid normal editable document initialization when it would create starter archive content.

### Plan 2.5: Reuse the Stable Diff Model and Webview

Reuse the same semantic diff model and read-only rendering surface from Plan 1.

The native resolver should be mostly wiring:

- Receive the two VS Code diff documents or URIs.
- Read bytes for both sides.
- Build the shared diff model.
- Render or message the same MDZip diff webview.

### Plan 2.6: Keep Manual Diff Commands

Even after native Source Control click support works, keep explicit commands for:

- Older VS Code versions.
- Explicit compare commands.
- Comparing two arbitrary `.mdz` files outside Source Control.
- Users who choose a different default diff editor.

### Plan 2.7: Test Native Click Behavior

Manual extension-host test:

1. Open a Git repo with `mdzip-vscode` installed in the extension host.
2. Modify a tracked `.mdz`.
3. Open Source Control.
4. Click the changed `.mdz`.
5. Confirm the MDZip semantic diff opens automatically.
6. Confirm normal opening a `.mdz` still opens the regular editor.
7. Confirm "Reopen With..." offers reasonable alternatives.
8. Confirm deleted, added, corrupt, and renamed `.mdz` states behave acceptably.

Add extension regression coverage when the VS Code test harness can exercise the final stable API.

## Main Risks

- The native Source Control click workflow is blocked until VS Code custom editor diff APIs are stable and publishable.
- Added/deleted SCM states can look like empty or missing files, so diff code must not reuse normal document creation that generates starter content.
- A semantic diff webview must stay read-only and independent from normal edit/save state.
