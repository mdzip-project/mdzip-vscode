# Webview Async Initialization Pattern

## Issue
When `resolveCustomEditor()` awaits `_sendWorkspaceEditorContent()`, the webview HTML never renders if that method hangs or takes too long. VSCode blocks waiting for the promise, leaving the editor completely blank.

## Root Cause
`MdzipWorkspaceService.saveToBytes()` can hang during archive serialization, causing `_sendWorkspaceEditorContent()` to never resolve.

## Solution
**Don't await async operations during webview setup.** Instead:

```typescript
// ❌ WRONG - blocks webview rendering
await this._sendWorkspaceEditorContent(webviewPanel.webview, document);

// ✅ CORRECT - webview loads immediately
this._sendWorkspaceEditorContent(webviewPanel.webview, document).catch(error => {
  console.error('Error sending content:', error);
});
```

## Why This Works
1. Webview HTML renders immediately
2. Content is sent asynchronously in background
3. Webview receives `openWorkspace` message when ready
4. User sees responsive UI even if serialization is slow

## Key Pattern
- Set webview HTML synchronously
- Send initial content asynchronously
- Always handle promise rejections with `.catch()`
