# Webview Theme Sync

**Resolved.** `setColorScheme` was made public in `@mdzip/editor` 1.2.8 (option 1
below), and mdzip-vscode 0.1.245 wires the `MutationObserver` in
`webviewEditor.ts` exactly as sketched. The library method no-ops when the
scheme is unchanged and deliberately does not fire `onColorSchemeChanged`
(that callback reports user-initiated toolbar toggles only, so host-driven
changes are never persisted as user choices).

## Current state (at time of writing)

The editor reads VS Code's `data-vscode-theme-kind` body attribute at construction time and passes it as `initialColorScheme` to `MdzipWorkspaceView`. This covers the initial load correctly.

## Gap: live theme switching

If the user changes the VS Code color theme while an editor tab is open, the webview does not react. The editor stays in whatever color scheme it started with.

## What's needed

`MdzipWorkspaceView` has no public method to change the color scheme after construction. Options:

1. **Add `setColorScheme(scheme: MdzipColorScheme)` to `MdzipWorkspaceView`** — cleanest; no state loss.

2. **Recreate the editor on theme change** — works today but destroys the CodeMirror instance and loses unsaved edits.

## Implementation sketch (option 1)

In `webviewEditor.ts`, listen for the `data-vscode-theme-kind` attribute change via `MutationObserver`:

```typescript
new MutationObserver(() => {
  editor.setColorScheme(detectColorScheme());
}).observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind', 'class'] });
```

Then in `view.ts`, expose:

```typescript
public setColorScheme(colorScheme: MdzipColorScheme): void {
  if (this.colorScheme === colorScheme) return;
  this.colorScheme = colorScheme;
  this.render();
}
```
