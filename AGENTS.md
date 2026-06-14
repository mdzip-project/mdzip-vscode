# Agent Instructions

- Never modify upstream or sibling repositories. You may inspect them for context, but treat them as read-only.
- If an upstream change appears warranted, stop and discuss it with the user. Create a GitHub issue when requested so the work can be coordinated and completed in the appropriate repository.
- After every code or asset change, bump the extension patch version in `package.json` and `package-lock.json`, then rebuild the VSIX.
- Documentation, design notes, and other non-code/non-asset changes do not require an automatic version bump or VSIX rebuild.
- Use `npm version patch --no-git-tag-version` for the version bump unless the user asks for a different version.
- Use `npx vsce package` to rebuild the VSIX after verification.
