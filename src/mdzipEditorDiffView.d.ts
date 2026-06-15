declare module '@mdzip/editor/diff-view' {
  export interface MdzipDiffSideInput {
    bytes?: Uint8Array;
    label?: string;
    fileName?: string;
    missingMessage?: string;
  }

  export type MdzipDiffToolbarIcon = 'refresh';

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
    toolbarActions?: readonly MdzipDiffToolbarAction[];
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
    setToolbarActions(actions: readonly MdzipDiffToolbarAction[]): void;
    destroy(): void;
  }
}
