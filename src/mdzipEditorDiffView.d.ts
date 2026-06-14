declare module '@mdzip/editor/diff-view' {
  export function navigationToggleIconHtml(className?: string): string;

  export interface MdzipDiffSideInput {
    bytes?: Uint8Array;
    label?: string;
    fileName?: string;
    missingMessage?: string;
  }

  export interface MdzipDiffViewOptions {
    before: MdzipDiffSideInput;
    after: MdzipDiffSideInput;
    initialPath?: string;
    showUnchanged?: boolean;
    navigationVisible?: boolean;
    onSelectionChanged?: (event: {
      path: string;
      entry: unknown;
    }) => void;
    onFailed?: (error: Error) => void;
  }

  export class MdzipDiffView {
    constructor(container: HTMLElement, options: MdzipDiffViewOptions);
    open(options: MdzipDiffViewOptions): Promise<void>;
    openPath(path: string): Promise<boolean>;
    setShowUnchanged(show: boolean): void;
    setNavigationVisible(visible: boolean): void;
    destroy(): void;
  }
}
