# MDZip VS Code: Enable Codex MCP Server

## Goal

Add a `mdzip-vscode` command that makes the bundled MDZip MCP server available to Codex.

Installing the VS Code extension currently makes the MCP server available to VS Code MCP surfaces through `vscode.lm.registerMcpServerDefinitionProvider(...)`, but Codex reads MCP servers from Codex config. Codex should not be expected to discover the VS Code MCP provider automatically.

## Proposed Command

```text
MDZip: Enable Codex MCP Server
```

Suggested command id:

```text
mdzip.enableCodexMcp
```

The command should write a Codex MCP config entry for the bundled server:

```toml
[mcp_servers.MDZip]
command = "node"
args = ["<absolute path to mdz-mcp-server.js>"]
```

The command assumes `node` is available on the user's PATH when Codex launches
the MCP server. Before writing config, the implementation should verify that a
usable Node runtime is discoverable, or show a clear warning that Codex may not
be able to start the server until Node is installed or added to PATH. If a more
stable runtime path is available from the extension host, prefer writing that
absolute executable path instead of the bare `node` command.

The server path should resolve to the installed extension bundle:

```text
<extensionPath>/dist/mdz-mcp-server.js
```

This is the same bundled server currently used by the VS Code MCP provider.

## First-Run Prompt

On extension activation, show one simple, one-time prompt for AI-tool setup
rather than separate prompts for Codex, Claude Code, and VS Code/Copilot:

```text
Enable the MDZip MCP server so AI tools can inspect .mdz files directly?
```

Suggested actions:

```text
Enable
Not Now
Don't Ask Again
```

If the user selects `Enable`, show a quick-pick target selector:

```text
Codex
Claude Code
VS Code / Copilot
```

Keep the selector practical and quiet:

- `Codex`: run `mdzip.enableCodexMcp`. The command should still ask where to
  write config, defaulting to user-level config.
- `Claude Code`: run the Claude-specific enable flow once it exists. If it does
  not exist yet, show a short message explaining that Claude Code setup is not
  available in this build.
- `VS Code / Copilot`: use the existing VS Code MCP setup flow. Prefer opening
  the MCP server status or setup surface if the bundled provider is already
  registered; fall back to `mdzip.enableWorkspaceMcp` / `mdzip.enableUserMcp`
  only when the user wants an explicit `mcp.json`.

Store the prompt state in `context.globalState` so it is not shown repeatedly.
Recommended states:

- Prompt not shown yet: show the prompt.
- User selected `Not Now`: do not show again during the current activation, but
  allow a future extension version or explicit command to surface it again.
- User selected `Don't Ask Again`: never show the automatic prompt again unless
  storage is reset.
- User completed an MCP setup target: never show the automatic prompt again.

Do not write any external tool config automatically on install. The prompt must
require an explicit user action before touching Codex, Claude Code, VS Code, or
workspace MCP configuration.

## Config Targets

Support at least user-level Codex config:

```text
~/.codex/config.toml
```

Optionally support workspace-level config for trusted projects:

```text
<workspace>/.codex/config.toml
```

Recommended UX:

1. Ask whether to write user-level or workspace-level Codex config.
2. Default to user-level config.
3. If workspace-level is selected and no workspace folder is open, show a warning.
4. If workspace-level is selected, tell the user that Codex only loads project
   `.codex/config.toml` files for trusted projects.
5. Create parent directories when missing.
6. Preserve unrelated existing config.
7. Upsert only the `[mcp_servers.MDZip]` table and any descendant tables owned
   by that server.

## Example User Config

```toml
[mcp_servers.MDZip]
command = "node"
args = ["F:\\Code\\1 Projects\\mdzip-project\\mdzip-vscode\\dist\\mdz-mcp-server.js"]
```

## User Message After Success

After writing config, show:

```text
Enabled MDZip MCP server for Codex. Restart Codex or open a new Codex session for the server to become available.
```

For workspace-level config, include:

```text
Codex will load this project config only when the workspace is trusted.
```

Codex loads MCP server configuration at startup, so the new server generally will not appear in an already-running Codex session.

## Related Existing Commands

Existing commands:

```text
MDZip: Copy MCP Server Config Snippet
MDZip: Enable Workspace MCP Server
MDZip: Enable User MCP Server
MDZip: Open MCP Server Status
```

The new command is different from the existing VS Code MCP commands because it targets Codex config rather than VS Code `mcp.json`.

## Available Tools Once Enabled

Codex should see the bundled server tools after restart:

```text
mdz_review_document
mdz_list_entries
mdz_read_text
mdz_read_image
mdz_read_markdown_embedded_images
upsert_canonical_document
```

For review tasks, agents should call `mdz_review_document` first with the `.mdz` archive path.

## Implementation Notes

Use the extension runtime path:

```typescript
const bundledServerPath = vscode.Uri.joinPath(
  context.extensionUri,
  'dist',
  'mdz-mcp-server.js'
).fsPath;
```

Then write:

```toml
[mcp_servers.MDZip]
command = "node"
args = ["..."]
```

Prefer a TOML parser/preserver if one is already acceptable as a dependency. If avoiding dependencies, a conservative implementation can:

1. Read existing `config.toml` as text.
2. Remove an existing `[mcp_servers.MDZip]` table block, including descendant
   tables such as `[mcp_servers.MDZip.env]` and
   `[mcp_servers.MDZip.tools.some_tool]`, stopping at the next table that is not
   `[mcp_servers.MDZip...]`.
3. Append the generated block.
4. Leave all other config text unchanged.

Be careful not to rewrite unrelated Codex settings.

## Future Option

A future Codex plugin could bundle the MDZip MCP server definition directly. That would be the cleanest install-once Codex experience, but the VS Code command is the fastest bridge for users who already install `mdzip-vscode`.
