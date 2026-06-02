# Agent Instructions

- After every code or asset change, bump the extension patch version in `package.json` and `package-lock.json`, then rebuild the VSIX.
- Use `npm version patch --no-git-tag-version` for the version bump unless the user asks for a different version.
- Use `npx vsce package` to rebuild the VSIX after verification.
