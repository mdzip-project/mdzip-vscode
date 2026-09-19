import * as vscode from 'vscode';
import { handleToolCall, toToolErrorResult, type ToolContent } from './mdzToolHandlers';

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
};

class MdzLanguageModelTool implements vscode.LanguageModelTool<Record<string, unknown>> {
  public constructor(private readonly handlerName: string) {}

  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<Record<string, unknown>>
  ): Promise<vscode.PreparedToolInvocation | undefined> {
    if (this.handlerName !== 'upsert_canonical_document') {
      return undefined;
    }

    const archivePath = typeof options.input?.archivePath === 'string' ? options.input.archivePath : 'the archive';
    return {
      invocationMessage: `Updating the canonical markdown document in ${archivePath}`,
      confirmationMessages: {
        title: 'Update MDZip document?',
        message: new vscode.MarkdownString(
          `This overwrites the canonical markdown entry in \`${archivePath}\`. The write is rejected automatically if the file changed since it was last reviewed, but confirm you want to proceed.`
        ),
      },
    };
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

function toLanguageModelPart(content: ToolContent): vscode.LanguageModelTextPart | vscode.LanguageModelDataPart {
  if (content.type === 'image') {
    return vscode.LanguageModelDataPart.image(Buffer.from(content.data, 'base64'), content.mimeType);
  }
  return new vscode.LanguageModelTextPart(content.text);
}

export function registerMdzLanguageModelTools(): vscode.Disposable[] {
  return Object.entries(TOOL_NAME_TO_HANDLER_NAME).map(([toolName, handlerName]) =>
    vscode.lm.registerTool(toolName, new MdzLanguageModelTool(handlerName))
  );
}
