declare module '@mdzip/editor/mermaid' {
  import type { MdzipMarkdownRenderExtension } from '@mdzip/editor';

  export type MdzipMermaidTheme =
    | 'auto'
    | 'default'
    | 'dark'
    | 'neutral'
    | 'forest'
    | 'base';

  export interface MdzipMermaidApi {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
  }

  export interface MdzipMermaidOptions {
    theme?: MdzipMermaidTheme;
    loadMermaid?: () => Promise<MdzipMermaidApi>;
  }

  export function mdzipMermaidExtension(
    options?: MdzipMermaidOptions
  ): MdzipMarkdownRenderExtension;
}
