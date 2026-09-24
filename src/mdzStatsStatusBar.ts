import * as vscode from 'vscode';
import * as path from 'path';
import {
  formatStatsAccessibleLabel,
  formatStatsText,
  formatStatsTooltip,
  type MdzStatsReport,
} from './mdzStats';

/**
 * One status bar item showing statistics for whichever MDZip editor tab is the
 * active tab of the active group (mdzip-vscode#12).
 *
 * Visibility is derived from the tab model on every change rather than tracked
 * by hand, and each document's report is stored under its own URI, so it can't
 * show a stale item after its tab closes or switches to another file, and can't
 * show one document's numbers while another is in front. Diff views are
 * webview/text-diff tabs, not custom-editor tabs, so they hide it too.
 */
export class MdzStatsStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly reports = new Map<string, MdzStatsReport>();
  private readonly subscriptions: vscode.Disposable[];

  /** `editors` maps each custom-editor view type to the icon shown for it. */
  constructor(private readonly editors: readonly { viewType: string; iconId: string }[]) {
    // Just left of VS Code's own Ln/Col item (priority 100.5).
    this.item = vscode.window.createStatusBarItem('mdzip.documentStats', vscode.StatusBarAlignment.Right, 101);
    this.item.name = 'MDZip Document Statistics';
    this.subscriptions = [
      vscode.window.tabGroups.onDidChangeTabs(() => this.refresh()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.refresh()),
    ];
    this.refresh();
  }

  /** Records the latest report for a document (keyed by its URI string). */
  public update(documentKey: string, report: MdzStatsReport): void {
    this.reports.set(documentKey, report);
    this.refresh();
  }

  /** Drops a closed document's report so nothing stale can be shown for it. */
  public forget(documentKey: string): void {
    this.reports.delete(documentKey);
    this.refresh();
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.reports.clear();
    this.item.dispose();
  }

  private activeDocument(): { key: string; iconId: string } | null {
    const input = vscode.window.tabGroups.activeTabGroup?.activeTab?.input;
    if (input instanceof vscode.TabInputCustom) {
      const editor = this.editors.find((candidate) => candidate.viewType === input.viewType);
      if (editor) {
        return { key: input.uri.toString(), iconId: editor.iconId };
      }
    }
    return null;
  }

  private refresh(): void {
    const active = this.activeDocument();
    const report = active === null ? undefined : this.reports.get(active.key);
    if (active === null || !report || report.kind === 'none') {
      this.item.hide();
      return;
    }
    const documentName = path.posix.basename(vscode.Uri.parse(active.key).path);
    this.item.text = formatStatsText(report, active.iconId);
    this.item.tooltip = new vscode.MarkdownString(formatStatsTooltip(report, documentName));
    this.item.accessibilityInformation = { label: formatStatsAccessibleLabel(report) };
    this.item.show();
  }
}
