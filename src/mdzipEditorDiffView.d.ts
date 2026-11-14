declare module '@mdzip/editor/diff-view' {
  export interface MdzipDiffSideInput {
    bytes?: Uint8Array;
    /** A plain `.md` document instead of an archive (@mdzip/editor 2.5+). */
    markdown?: string;
    /** Reads an image a `markdown` side links to, by its document-relative path (@mdzip/editor 2.5+). */
    readResource?: (path: string) => Promise<Uint8Array | null>;
    /** Let the user edit a `markdown` side in the source view (@mdzip/editor 2.5+). */
    editable?: boolean;
    onMarkdownChange?: (markdown: string) => void;
    label?: string;
    fileName?: string;
    missingMessage?: string;
  }

  export type MdzipDiffToolbarIcon = 'refresh' | 'save';

  export interface MdzipDiffToolbarAction {
    id: string;
    label: string;
    icon?: MdzipDiffToolbarIcon;
    disabled?: boolean;
    pressed?: boolean;
    run: () => void | Promise<void>;
  }

  export interface MdzipDiffViewOptions {
    before: MdzipDiffSideInput;
    after: MdzipDiffSideInput;
    initialPath?: string;
    showUnchanged?: boolean;
    navigationVisible?: boolean;
    /** Show Markdown entries rendered instead of as source (@mdzip/editor 2.5+). */
    rendered?: boolean;
    colorScheme?: 'light' | 'dark';
    toolbarDensity?: 'comfortable' | 'compact' | 'dense';
    toolbarActions?: readonly MdzipDiffToolbarAction[];
    onSelectionChanged?: (event: {
      path: string;
      entry: unknown;
    }) => void;
    onRenderedChanged?: (rendered: boolean) => void;
    onFailed?: (error: Error) => void;
  }

  export class MdzipDiffView {
    constructor(container: HTMLElement, options: MdzipDiffViewOptions);
    open(options: MdzipDiffViewOptions): Promise<void>;
    openPath(path: string): Promise<boolean>;
    setShowUnchanged(show: boolean): void;
    setRendered(rendered: boolean): Promise<void>;
    readonly isRendered: boolean;
    setNavigationVisible(visible: boolean): void;
    setToolbarActions(actions: readonly MdzipDiffToolbarAction[]): void;
    /** Replaces a plain-Markdown side's text in place (@mdzip/editor 2.5+). */
    updateMarkdown(side: 'before' | 'after', text: string): Promise<void>;
    destroy(): void;
  }
}
