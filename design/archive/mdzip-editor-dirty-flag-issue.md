# @mdzip/editor Dirty Flag Issue

## Problem
When `MdzipWorkspaceService.open()` opens a file, the service's `dirty` flag is immediately `true`. This is unexpected—a freshly-opened, unmodified file should be clean (dirty = false).

Additionally, calling `service.saveToBytes()` appears to trigger change events that re-mark the service as dirty, even though serialization shouldn't modify the loaded state.

## Impact
- VSCode extension shows files as unsaved immediately upon opening
- Can't distinguish between "opened without changes" and "has unsaved changes"
- The dirty flag is unreliable for tracking actual user edits

## Root Cause
Unknown—not tested in the demo app since it doesn't have a dirty indicator or save functionality.

Possible causes:
1. `open()` triggers a change event internally
2. The service conflates "has content" with "has unsaved changes"
3. There's initialization logic that marks it dirty before marking persisted

## Investigation Steps
1. Check `MdzipWorkspaceService.open()` implementation
2. Check what events it fires during initialization
3. Check if there's an expected post-open workflow (e.g., call `markPersisted()` after opening)
4. Check `saveToBytes()` to see if it triggers change events

## Workaround (in mdzip-vscode)
The extension tracks its own dirty state independently:
- Documents start clean when opened
- Dirty flag only set when receiving `workspaceChanged` messages from the webview
- This matches user intent: "dirty = user made changes"

Remove workaround once @mdzip/editor is fixed.
