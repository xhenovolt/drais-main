"use client";
/**
 * DRCEContainerSection — Phase C.1 composition primitive.
 *
 * Holds an ordered list of child sections. Renders them by looking each child
 * up in the section plugin registry — the same path the top-level renderer
 * uses. Recursion is just iteration; containers can contain containers.
 *
 * C.1 ships the `stack` layout (flex column). C.2 lights up `row`, `grid`,
 * `absolute` (where children get x/y from their own style). No editor wiring
 * yet — schools that hand-author a container in `schema_json` will see it
 * render; the C.3 commit adds drag-drop nesting in the editor.
 */
import React from 'react';
import type {
  DRCEContainerSection as Section,
  DRCESection,
  DRCETheme,
  DRCEDataContext,
} from '@/lib/drce/schema';
import { getSectionPlugin, type SectionRenderProps } from '@/lib/drce/section-registry';

interface Props {
  section:   Section;
  theme:     DRCETheme;
  dataCtx:   DRCEDataContext;
  renderCtx: SectionRenderProps['renderCtx'];
  onCellChange?: SectionRenderProps['onCellChange'];
  onColumnHide?: SectionRenderProps['onColumnHide'];
}

function containerStyle(section: Section): React.CSSProperties {
  const s = section.style ?? {};
  const layout = s.layout ?? 'stack';
  const base: React.CSSProperties = {
    gap:           s.gap != null ? s.gap : undefined,
    padding:       s.padding,
    background:    s.background,
    border:        s.border,
    borderRadius:  s.borderRadius,
    width:         s.width,
    height:        s.height,
    boxSizing:     'border-box',
  };
  const alignMap: Record<NonNullable<typeof s.align>, React.CSSProperties['alignItems']> = {
    start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch',
  };
  const justifyMap: Record<NonNullable<typeof s.justify>, React.CSSProperties['justifyContent']> = {
    start: 'flex-start', center: 'center', end: 'flex-end',
    between: 'space-between', around: 'space-around', evenly: 'space-evenly',
  };
  if (layout === 'stack') {
    return { ...base, display: 'flex', flexDirection: 'column',
      alignItems: s.align ? alignMap[s.align] : undefined,
      justifyContent: s.justify ? justifyMap[s.justify] : undefined };
  }
  if (layout === 'row') {
    return { ...base, display: 'flex', flexDirection: 'row',
      alignItems: s.align ? alignMap[s.align] : undefined,
      justifyContent: s.justify ? justifyMap[s.justify] : undefined };
  }
  if (layout === 'grid') {
    return { ...base, display: 'grid',
      gridTemplateColumns: s.gridTemplateColumns,
      gridTemplateRows:    s.gridTemplateRows };
  }
  if (layout === 'absolute') {
    return { ...base, position: 'relative' };  // children opt into absolute via their own style
  }
  return base;
}

export function ContainerSection({ section, theme, dataCtx, renderCtx, onCellChange, onColumnHide }: Props) {
  // Deterministic order — children render by their `order` field, like top-level sections.
  const children = (section.children ?? [])
    .filter(c => c.visible !== false)
    .slice()
    .sort((a, b) => a.order - b.order);

  return (
    <div style={containerStyle(section)} data-drce-container={section.id}>
      {children.map(child => {
        const plugin = getSectionPlugin(child.type);
        if (!plugin) {
          console.warn(`[ContainerSection] No plugin for child type: ${(child as { type?: string }).type}`);
          return null;
        }
        const node = plugin.Render({
          section: child, theme, dataCtx, renderCtx, onCellChange, onColumnHide,
        });
        return <React.Fragment key={child.id}>{node as React.ReactNode}</React.Fragment>;
      })}
    </div>
  );
}

/** Factory for the section plugin's defaultProps — exported so tests + the editor reuse it. */
export function defaultContainer(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'container',
    visible: true,
    children: [],
    style: { layout: 'stack', gap: 8 },
  } as Omit<DRCESection, 'id' | 'order'>;
}
