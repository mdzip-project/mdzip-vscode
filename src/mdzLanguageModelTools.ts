import * as vscode from 'vscode';
import { handleToolCall, toToolErrorResult, type ToolContent } from './mdzToolHandlers';
import { logError, logInfo } from './mdzLog';

/**
 * Native `vscode.lm.registerTool` wrappers around the same handlers the bundled MCP server
 * uses (see `mdzToolHandlers.ts`). These are consumed in-process by VS Code chat participants
 * that support the Language Model Tools API (Copilot Chat and similar) — no MCP server, no
 * `mcp.json`, nothing to configure. Standalone CLI agents (Claude Code, Codex) aren't VS Code
 * chat participants and never see these; they still go through the MCP server.
 *
 * Each entry's `toolName` must match a `contributes.languageModelTools[].name` in package.json
 * exactly, and `handlerName` must match a case in `mdzToolHandlers.ts#handleToolCall`.
 */
const TOOL_NAME_TO_HANDLER_NAME: Record<string, string> = {
  mdzip_review_document: 'mdz_review_document',
  mdzip_list_entries: 'mdz_list_entries',
  mdzip_search_text: 'mdz_search_text',
  mdzip_read_text: 'mdz_read_text',
  mdzip_read_image: 'mdz_read_image',
  mdzip_read_markdown_embedded_images: 'mdz_read_markdown_embedded_images',
  mdzip_upsert_canonical_document: 'upsert_canonical_document',
  mdzip_write_entry: 'mdz_write_entry',
  mdzip_remove_entry: 'mdz_remove_entry',
};

/** What a write tool asks the user before it runs. */
function writeConfirmation(handlerName: string, input: Record<string, unknown> | undefined): vscode.PreparedToolInvocation | undefined {
  const archivePath = typeof input?.archivePath === 'string' ? input.archivePath : 'the archive';
  const entryPath = typeof input?.entryPath === 'string' ? input.entryPath : 'a file';
  switch (handlerName) {
    case 'upsert_canonical_document':
      return {
        invocationMessage: `Updating the canonical markdown document in ${archivePath}`,
        confirmationMessages: {
          title: 'Update MDZip document?',
          message: new vscode.MarkdownString(
            `This overwrites the canonical markdown entry in \`${archivePath}\`. The write is rejected automatically if the file changed since it was last reviewed, but confirm you want to proceed.`
          ),
        },
      };
    case 'mdz_write_entry': {
      const replacing = typeof input?.expectedEntryHash === 'string' && input.expectedEntryHash.trim() !== '';
      return {
        invocationMessage: `${replacing ? 'Replacing' : 'Adding'} ${entryPath} in ${archivePath}`,
        confirmationMessages: {
          title: replacing ? 'Replace a file in the MDZip archive?' : 'Add a file to the MDZip archive?',
          message: new vscode.MarkdownString(
            replacing
              ? `This replaces \`${entryPath}\` in \`${archivePath}\`, keeping every other file as it is. It's refused automatically if the file changed since it was last read.`
              : `This adds \`${entryPath}\` to \`${archivePath}\`, keeping every other file as it is.`
          ),
        },
      };
    }
    case 'mdz_remove_entry':
      return {
        invocationMessage: `Removing ${entryPath} from ${archivePath}`,
        confirmationMessages: {
          title: 'Remove a file from the MDZip archive?',
          message: new vscode.MarkdownString(
            `This removes \`${entryPath}\` from \`${archivePath}\`, keeping every other file as it is. It's refused automatically if the file changed since it was last read.`
          ),
        },
      };
    default:
      return undefined;
  }
}

class MdzLanguageModelTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  public constructor(private readonly handlerName: string) {}

  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, unknown>>
  ): Promise<vscode.PreparedToolInvocation | undefined> {
    return writeConfirmation(this.handlerName, options.input);
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<Record<string, unknown>>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      const result = await handleToolCall(this.handlerName, options.input);
      return new vscode.LanguageModelToolResult(result.content.map(toLanguageModelPart));
    } catch (error) {
      const errorResult = toToolErrorResult(this.handlerName, error);
      return new vscode.LanguageModelToolResult(errorResult.content.map(toLanguageModelPart));
    }
  }
}

// LanguageModelDataPart arrived after VS Code 1.95, the oldest version supported,
// so it's typed here rather than from @types/vscode.
type LanguageModelDataPartCtor = { image(data: Uint8Array, mimeType: string): unknown };

function toLanguageModelPart(content: ToolContent): vscode.LanguageModelTextPart {
  if (content.type === 'image') {
    // Editors without image parts get a note instead of failing the whole result.
    const dataPart = (vscode as unknown as { LanguageModelDataPart?: LanguageModelDataPartCtor }).LanguageModelDataPart;
    if (typeof dataPart?.image === 'function') {
      // A data part, which the result accepts where the editor supports it.
      return dataPart.image(Buffer.from(content.data, 'base64'), content.mimeType) as vscode.LanguageModelTextPart;
    }
    return new vscode.LanguageModelTextPart(`[Image (${content.mimeType}) not shown: this editor can't pass images to the model. Use mdz_read_image through the MCP server instead.]`);
  }
  return new vscode.LanguageModelTextPart(content.text);
}

/**
 * Registers the tools where the editor supports language model tools (VS Code
 * with Copilot Chat and similar). Editors built on VS Code may not (Cursor,
 * Windsurf): then nothing is registered and agents use the MCP server instead.
 */
export function registerMdzLanguageModelTools(): vscode.Disposable[] {
  const lm = (vscode as { lm?: Partial<typeof vscode.lm> }).lm;
  if (typeof lm?.registerTool !== 'function' || typeof vscode.LanguageModelToolResult !== 'function') {
    logInfo(`${vscode.env.appName} has no language model tools API; MDZip's tools are available through its MCP server.`);
    return [];
  }
  const disposables: vscode.Disposable[] = [];
  for (const [toolName, handlerName] of Object.entries(TOOL_NAME_TO_HANDLER_NAME)) {
    try {
      disposables.push(lm.registerTool(toolName, new MdzLanguageModelTool(handlerName)));
    } catch (error) {
      logError(`Could not register the ${toolName} language model tool`, error);
    }
  }
  return disposables;
}
