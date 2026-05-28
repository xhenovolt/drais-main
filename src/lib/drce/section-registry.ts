/**
 * DRCE section plugin registry — Phase D.
 *
 * The 11 built-in section types stop being a closed switch in the renderer.
 * Each section type registers a single descriptor here, the renderer looks it
 * up by `type`, and new section types (tahfiz, finance, …) can register
 * without editing the renderer, the editor palette, or the schema union.
 *
 * Identity-only contract: this file imports NO React. The descriptor exposes
 * a `Render` field typed as `unknown`; the renderer casts to the concrete
 * React component type at the call site. Keeping JSX out of `/lib` preserves
 * server-side import boundaries for route handlers.
 */
import type { DRCESection, DRCESectionType, DRCETheme, DRCEDataContext } from './schema';

export interface SectionRenderProps {
  section:   DRCESection;
  theme:     DRCETheme;
  dataCtx:   DRCEDataContext;
  /** Render context (school metadata, language); typed loosely to avoid a circular import. */
  renderCtx: { language?: 'en' | 'ar'; [k: string]: unknown };
  /** Results-table interactive callbacks. Only honoured by results_table. */
  onCellChange?: (sectionId: string, columnId: string, rowIndex: number, newValue: string) => Promise<void>;
  onColumnHide?: (sectionId: string, columnId: string) => Promise<void>;
}

/** Renderer is intentionally untyped here so /lib stays React-free. */
export type SectionRenderer = (props: SectionRenderProps) => unknown;

export interface SectionPlugin {
  /** Discriminant matching DRCESection.type. */
  type:         DRCESectionType | string;     // string allows future external plugins
  /** Human label for the editor palette. */
  label:        string;
  /** Emoji or icon hint for the palette. */
  icon:         string;
  /** Optional short description shown in the variable/section picker. */
  description?: string;
  /** Factory producing a fresh default section object for "add section" flows. */
  defaultProps: () => Omit<DRCESection, 'id' | 'order'>;
  /** Render function — see SectionRenderer note above. */
  Render:       SectionRenderer;
}

const REGISTRY = new Map<string, SectionPlugin>();

export function registerSection(plugin: SectionPlugin): void {
  if (REGISTRY.has(plugin.type)) {
    console.warn(`[drce/section] overwrote ${plugin.type}`);
  }
  REGISTRY.set(plugin.type, plugin);
}

export function getSectionPlugin(type: string): SectionPlugin | undefined {
  return REGISTRY.get(type);
}

export function listSectionPlugins(): SectionPlugin[] {
  return [...REGISTRY.values()];
}

/** Test-only hook. */
export function __clearSectionRegistry(): void {
  REGISTRY.clear();
}
