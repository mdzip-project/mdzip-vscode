import * as vscode from 'vscode';

/**
 * Shared logging for the whole extension, backed by a real registered
 * OutputChannel (readable on disk under a windowN/exthost/mdzip-project.mdzip-vscode/
 * folder, not just live in the Output panel).
 *
 * Extracted to its own module rather than living in extension.ts so
 * mdzDocument.ts/mdzEditorProvider.ts can import it without a circular
 * dependency back to extension.ts (which imports MdzEditorProvider) and
 * without dragging extension.ts's full dependency tree (git extension
 * typings, mdzTemplates, fs/os/child_process, etc.) into mdzDocument.ts's
 * standalone test bundle (bundle:test-document).
 *
 * Plain console.log/console.error from an extension with no registered
 * OutputChannel don't reliably land anywhere inspectable — confirmed: none
 * of this extension's console.* calls ever appeared in exthost.log across
 * an entire real test session, despite genuine unhandled exceptions vscode's
 * own internals threw as a *result* of this extension's calls showing up
 * there just fine. Route anything worth inspecting later through here.
 */

let channel: vscode.OutputChannel | undefined;

/** Call once from activate(). */
export function initLogging(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('MDZip');
  context.subscriptions.push(channel);
}

export function logInfo(message: string, ...details: unknown[]): void {
  const line = formatLogLine('INFO', message, details);
  channel?.appendLine(line);
  console.log(`[MDZip] ${message}`, ...details);
}

export function logError(message: string, error?: unknown): void {
  const details = error === undefined ? [] : [formatError(error)];
  channel?.appendLine(formatLogLine('ERROR', message, details));
  console.error(`[MDZip] ${message}`, error);
}

function formatLogLine(level: 'INFO' | 'ERROR', message: string, details: readonly unknown[]): string {
  const suffix = details.length > 0 ? ` ${details.map(formatLogDetail).join(' ')}` : '';
  return `${new Date().toISOString()} [${level}] ${message}${suffix}`;
}

function formatLogDetail(detail: unknown): string {
  if (typeof detail === 'string') {
    return detail;
  }
  if (detail instanceof Error) {
    return formatError(detail);
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}
