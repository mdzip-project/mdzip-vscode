# Agent Instructions

- Never modify upstream or sibling repositories. You may inspect them for context, but treat them as read-only.
- If an upstream change appears warranted, stop and discuss it with the user. Create a GitHub issue when requested so the work can be coordinated and completed in the appropriate repository.
- After every code or asset change, bump the extension patch version in `package.json` and `package-lock.json`, then rebuild the VSIX.
- **Every VSIX rebuild gets a new version — no exceptions.** That includes rebuilds that only pick up a new `@mdzip/editor`/`@mdzip/core-js` or rebundle `media/`. VS Code won't reinstall a VSIX whose version is already installed, so re-packaging at the same number leaves the owner testing the old build.
- Documentation, design notes, and other non-code/non-asset changes do not require an automatic version bump or VSIX rebuild.
- Use `npm version patch --no-git-tag-version` for the version bump unless the user asks for a different version.
- Use `npx vsce package` to rebuild the VSIX after verification.
- The release/publish checklist lives in `private/Publish.mdz` (local-only, gitignored). Read/edit it via the MDZip MCP server. Finalize the CHANGELOG entry for a release **before** packaging the VSIX — the Marketplace renders the CHANGELOG.md bundled inside it.
