# @mdzip/editor — Pending Improvement Requests

## 2. JSDoc on key `.d.ts` declarations

The package ships no TypeScript source — only compiled `.js` and `.d.ts` files. The `.d.ts` files have very sparse JSDoc, so developers and tools reading them get bare type signatures with no behavioural context.

**How to fix**: add JSDoc to the TypeScript source files. The TypeScript compiler preserves JSDoc comments in generated `.d.ts` output automatically. Manually editing the `.d.ts` files is not the right approach.

### `open` vs `openWorkspace` (in `view.ts`)

```ts
/**
 * Opens an `.mdz` archive or Markdown file from raw bytes.
 *
 * Parses the ZIP and resolves all assets in the browser. For large archives
 * this can take several seconds. Prefer {@link openWorkspace} when the host
 * has already parsed the archive on the native side.
 */
open(bytes: Uint8Array, options?: MdzipWorkspaceOpenOptions): Promise<void>;

/**
 * Opens a pre-parsed `MdzWorkspace` without rebuilding the archive.
 *
 * Use this when the host (e.g. a VS Code extension) has already called
 * `MdzipWorkspaceService.open()` on the native side and can pass the workspace
 * object directly. Significantly faster than {@link open} for large archives
 * because no ZIP parsing or asset decompression occurs in the browser.
 *
 * Assets must expose either `readDataUri` or `readBytes` so that subsequent
 * ZIP rebuilds (e.g. on paste or asset removal) can read their bytes.
 * Fields present at runtime but absent from the TypeScript interface —
 * `validation`, `orphanedAssets`, and `asset.kind` — must be preserved on the
 * workspace object or operations that depend on them will fail.
 */
openWorkspace(workspace: MdzWorkspace, options?: MdzipWorkspaceOpenOptions): Promise<void>;
```

### `pasteImage` (in `workspace.ts`)

```ts
/**
 * Embeds a pasted image into the current `.mdz` document and rebuilds the archive.
 *
 * Returns `null` — without throwing — when `sourceFormat` is `'markdown'`.
 * Markdown source files do not support embedded images; the paste event handler
 * automatically shows the conversion dialog via `executeCommand('insert-image')`.
 */
pasteImage(options: MdzipPasteImageOptions): Promise<MdzipPasteImageResult | null>;
```

### `snapshot().workspace` runtime shape (in `workspace.ts`, on `MdzipWorkspaceSnapshot`)

```ts
/**
 * The underlying `MdzWorkspace` object.
 *
 * The runtime object carries additional fields beyond what the TypeScript type
 * declares: `validation` (required by `getValidationStatus`),
 * `orphanedAssets` (used for orphan detection), and `asset.kind` on each
 * asset entry. If you serialise and re-hydrate this object, spread the full
 * runtime value rather than reconstructing it from declared fields only, or
 * these operations will fail with runtime errors.
 */
workspace: MdzWorkspace;
```
