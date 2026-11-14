declare module '@mdzip/editor/merge-view' {
  export type MergeConflictResolution = 'ours' | 'theirs' | 'both' | 'base' | { text: string };

  export interface MdzipMergeChangeEvent {
    /** The entry (or plain document) that changed. */
    path: string;
    /** Its new text, for a text entry or a plain document. */
    text?: string;
    /** The whole archive after the change, for an archive. */
    bytes?: Uint8Array;
    /** Conflicts still to resolve. */
    remaining: number;
  }

  export interface MdzipMergeSource {
    bytes?: Uint8Array;
    markdown?: string;
  }

  export interface MdzipMergeViewOptions {
    bytes?: Uint8Array;
    markdown?: string;
    /** Git's ancestor, yours and theirs (@mdzip/editor 2.5+); null: that side has no such file. */
    versions?: { base?: MdzipMergeSource | null; ours?: MdzipMergeSource | null; theirs?: MdzipMergeSource | null };
    fileName?: string;
    oursLabel?: string;
    theirsLabel?: string;
    readResource?: (path: string) => Promise<Uint8Array | null | undefined>;
    rendered?: boolean;
    colorScheme?: 'light' | 'dark';
    toolbarDensity?: 'comfortable' | 'compact' | 'dense';
    onChange?: (event: MdzipMergeChangeEvent) => void;
    onResolved?: () => void;
    onComplete?: (event: { remaining: number }) => void | Promise<void>;
    onFailed?: (error: Error) => void;
  }

  export class MdzipMergeView {
    constructor(container: HTMLElement, options: MdzipMergeViewOptions);
    open(options: MdzipMergeViewOptions): Promise<void>;
    readonly conflictCount: number;
    readonly isRendered: boolean;
    getText(path?: string): string | undefined;
    getArchiveBytes(): Uint8Array | null;
    setRendered(rendered: boolean): Promise<void>;
    destroy(): void;
  }
}
