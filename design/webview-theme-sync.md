# Webview Theme Sync

## Current state

testasdf

nother test

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
