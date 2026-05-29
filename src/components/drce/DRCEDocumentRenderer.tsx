// src/components/drce/DRCEDocumentRenderer.tsx
// Renders a full DRCEDocument given data context + school info.
// Used for both live preview in the editor and final print output.
'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { DRCEDocument, DRCEDataContext, DRCESection, DRCEShape } from '@/lib/drce/schema';
import { resolvePageStyle, resolvePageDimensions } from '@/lib/drce/styleResolver';
import type { DRCERenderContext } from './types';

// Side-effect import: registers the 11 built-in section plugins on load.
// Adding a new section type means registering it from elsewhere — no edits here.
import './sections/builtins';
import { getSectionPlugin } from '@/lib/drce/section-registry';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import { evaluateRule } from '@/lib/drce/visibility';

interface Props {
  document: DRCEDocument;
  dataCtx: DRCEDataContext;
  renderCtx: DRCERenderContext;
  /** Optional wrapper className for outer div */
  className?: string;
  /** Called when a section is clicked in editor mode */
  onSectionClick?: (sectionId: string) => void;
  /** ID of the currently selected section (highlights it) */
  selectedSectionId?: string | null;
  /** Called when a cell content is changed */
  onCellChange?: (sectionId: string, columnId: string, rowIndex: number, newValue: string) => Promise<void>;
  /** Called when a column should be hidden */
  onColumnHide?: (sectionId: string, columnId: string) => Promise<void>;
}

function renderSection(
  section: DRCESection,
  doc: DRCEDocument,
  dataCtx: DRCEDataContext,
  renderCtx: DRCERenderContext,
  onCellChange?: (sectionId: string, columnId: string, rowIndex: number, newValue: string) => Promise<void>,
  onColumnHide?: (sectionId: string, columnId: string) => Promise<void>,
) {
  if (!section || !doc || !dataCtx || !renderCtx) {
    console.warn('[renderSection] Missing required context:', { section: !!section, doc: !!doc, dataCtx: !!dataCtx, renderCtx: !!renderCtx });
    return null;
  }
  
  const { theme } = doc;
  const plugin = getSectionPlugin(section.type);
  if (!plugin) {
    console.warn(`[renderSection] No plugin registered for type: ${(section as { type?: string }).type}`);
    return null;
  }
  const node = plugin.Render({
    section, theme, dataCtx,
    renderCtx: renderCtx as unknown as { language?: 'en' | 'ar'; [k: string]: unknown },
    onCellChange, onColumnHide,
  });
  // The registry's Render returns `unknown` to keep /lib React-free; cast at the call site.
  return <React.Fragment key={section.id}>{node as React.ReactNode}</React.Fragment>;
}

function getSectionWrapperStyle(section: DRCESection, isSelected: boolean, isInteractive: boolean): React.CSSProperties {
  const sectionStyle = (section as { style?: Record<string, unknown> }).style ?? {};
  const borderWidth = Number(sectionStyle.borderWidth ?? 0);
  const borderStyle = (sectionStyle.borderStyle as string | undefined) ?? 'solid';
  const borderColor = (sectionStyle.borderColor as string | undefined) ?? '#111827';
  const positioning = (sectionStyle.position as string | undefined) ?? 'relative';
  const rotate = Number(sectionStyle.rotation ?? 0);
  const scale = Number(sectionStyle.scale ?? 1);
  const visibility = section.visible ? ((sectionStyle.visibility as string | undefined) ?? 'visible') : 'hidden';

  return {
    width: (sectionStyle.width as string | number | undefined) ?? undefined,
    height: (sectionStyle.height as string | number | undefined) ?? undefined,
    minWidth: (sectionStyle.minWidth as string | number | undefined) ?? undefined,
    minHeight: (sectionStyle.minHeight as string | number | undefined) ?? undefined,
    maxWidth: (sectionStyle.maxWidth as string | number | undefined) ?? undefined,
    maxHeight: (sectionStyle.maxHeight as string | number | undefined) ?? undefined,
    border: (sectionStyle.border as string | undefined) ?? undefined,
    padding: (sectionStyle.padding as string | number | undefined) ?? undefined,
    margin: (sectionStyle.margin as string | number | undefined) ?? undefined,
    marginTop: (sectionStyle.spacingTop as number | undefined) ?? undefined,
    marginBottom: (sectionStyle.spacingBottom as number | undefined) ?? undefined,
    borderWidth: borderWidth || undefined,
    borderStyle: borderWidth ? borderStyle : undefined,
    borderColor: borderWidth ? borderColor : undefined,
    borderRadius: (sectionStyle.borderRadius as number | string | undefined) ?? undefined,
    background: (sectionStyle.background as string | undefined) ?? undefined,
    opacity: Number(sectionStyle.opacity ?? 1),
    transform: `rotate(${rotate}deg) scale(${scale})`,
    transformOrigin: (sectionStyle.transformOrigin as string | undefined) ?? 'center',
    position: (positioning as React.CSSProperties['position']) ?? 'relative',
    left: (sectionStyle.left as number | string | undefined) ?? undefined,
    top: (sectionStyle.top as number | string | undefined) ?? undefined,
    right: (sectionStyle.right as number | string | undefined) ?? undefined,
    bottom: (sectionStyle.bottom as number | string | undefined) ?? undefined,
    zIndex: (sectionStyle.zIndex as number | undefined) ?? undefined,
    visibility: visibility as React.CSSProperties['visibility'],
    display: (sectionStyle.display as React.CSSProperties['display']) ?? undefined,
    alignSelf: (sectionStyle.alignSelf as React.CSSProperties['alignSelf']) ?? undefined,
    cursor: isInteractive ? 'pointer' : undefined,
    outline: isSelected ? '2px solid #6366f1' : undefined,
    outlineOffset: isSelected ? 2 : undefined,
    boxSizing: 'border-box',
    transition: isInteractive ? 'outline 0.1s' : undefined,
  };
}

export function DRCEDocumentRenderer(props: Props) {
  // Phase 0 — top-level boundary catches anything the per-section boundaries
  // miss (page-frame failure, watermark crash, StaticShapeLayer issue).
  return (
    <SectionErrorBoundary label="document">
      <DRCEDocumentRendererInner {...props} />
    </SectionErrorBoundary>
  );
}

function DRCEDocumentRendererInner({
  document,
  dataCtx,
  renderCtx,
  className,
  onSectionClick,
  selectedSectionId,
  onCellChange,
  onColumnHide,
}: Props) {
  // Defensive guards against undefined contexts
  if (!document) {
    console.error('[DRCEDocumentRenderer] document is required but not provided');
    return null;
  }
  if (!dataCtx) {
    console.error('[DRCEDocumentRenderer] dataCtx is required but not provided');
    return null;
  }
  if (!renderCtx) {
    console.error('[DRCEDocumentRenderer] renderCtx is required but not provided');
    return null;
  }
  
  const { theme, watermark, sections } = document;
  const pageStyle = resolvePageStyle(theme);
  const { width, minHeight } = resolvePageDimensions(theme);

  const sorted = [...(sections ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div style={{ ...pageStyle, width, minHeight }} className={className}>
      {/* Watermark */}
      {watermark?.enabled && (
        <div
          aria-hidden
          style={{
            position:  'absolute',
            inset:     0,
            display:   'flex',
            alignItems:    watermark.position === 'center' ? 'center' : 'flex-start',
            justifyContent: watermark.position === 'center' ? 'center' : 'flex-start',
            pointerEvents: 'none',
            zIndex: 0,
            overflow: 'hidden',
          }}
        >
          {watermark.type === 'text' ? (
            <span style={{
              color:       watermark.color,
              fontSize:    watermark.fontSize,
              opacity:     watermark.opacity,
              transform:   `rotate(${watermark.rotation}deg)`,
              fontWeight:  'bold',
              userSelect:  'none',
              whiteSpace:  'nowrap',
            }}>
              {watermark.content}
            </span>
          ) : watermark.type === 'qrcode' ? (
            <div style={{ opacity: watermark.opacity, transform: `rotate(${watermark.rotation}deg)` }}>
              <QRCodeSVG
                value={watermark.content || 'https://drais.app'}
                size={watermark.fontSize ?? 120}
              />
            </div>
          ) : watermark.imageUrl ? (
            <img
              src={watermark.imageUrl}
              alt={watermark.content}
              style={{
                opacity:   watermark.opacity,
                transform: `rotate(${watermark.rotation}deg)`,
                maxWidth:  '60%',
                maxHeight: '60%',
              }}
            />
          ) : null}
        </div>
      )}

      {/* Sections — memoised per-section so untouched ones skip re-render. */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {sorted.map(section => (
          <MemoSection
            key={section.id}
            section={section}
            doc={document}
            dataCtx={dataCtx}
            renderCtx={renderCtx}
            isSelected={selectedSectionId === section.id}
            onClick={onSectionClick}
            onCellChange={onCellChange}
            onColumnHide={onColumnHide}
          />
        ))}
      </div>

      {/* Phase 0 fix C3 — legacy overlay shapes. Until X1 these only rendered
          in the editor's ShapeCanvas; printed reports omitted them entirely.
          We render them as a passive SVG layer above the sections so they
          appear identically in editor preview AND in renderToStaticMarkup
          output for /print. Interactive shape editing remains in ShapeCanvas. */}
      <StaticShapeLayer shapes={document.shapes ?? []} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StaticShapeLayer — read-only SVG for legacy `document.shapes[]`.
// Pure: no listeners, no state. Works under renderToStaticMarkup.
// ─────────────────────────────────────────────────────────────────────────────
function StaticShapeLayer({ shapes }: { shapes: DRCEShape[] }) {
  if (!shapes.length) return null;
  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'visible', zIndex: 5,
      }}
    >
      {shapes.map(s => <StaticShape key={s.id} shape={s} />)}
    </svg>
  );
}

function StaticShape({ shape: s }: { shape: DRCEShape }) {
  switch (s.type) {
    case 'rect': {
      const tx = s.rotation ? `rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})` : undefined;
      return (
        <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.radius} ry={s.radius}
          fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
          opacity={s.opacity} transform={tx} />
      );
    }
    case 'ellipse': {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      const tx = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined;
      return (
        <ellipse cx={cx} cy={cy} rx={s.w / 2} ry={s.h / 2}
          fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
          opacity={s.opacity} transform={tx} />
      );
    }
    case 'line':
    case 'arrow': {
      const markerEnd   = s.endArrow   ? `url(#drce-arrow-end-${s.id})`   : undefined;
      const markerStart = s.startArrow ? `url(#drce-arrow-start-${s.id})` : undefined;
      return (
        <g opacity={s.opacity}>
          {(s.startArrow || s.endArrow) && (
            <defs>
              {s.endArrow && (
                <marker id={`drce-arrow-end-${s.id}`} viewBox="0 0 10 10"
                  refX="9" refY="5" markerWidth={s.arrowSize ?? 6} markerHeight={s.arrowSize ?? 6} orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill={s.stroke} />
                </marker>
              )}
              {s.startArrow && (
                <marker id={`drce-arrow-start-${s.id}`} viewBox="0 0 10 10"
                  refX="1" refY="5" markerWidth={s.arrowSize ?? 6} markerHeight={s.arrowSize ?? 6} orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={s.stroke} />
                </marker>
              )}
            </defs>
          )}
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={s.stroke} strokeWidth={s.strokeWidth}
            strokeDasharray={s.dashed ? '6 4' : undefined}
            markerEnd={markerEnd} markerStart={markerStart} />
        </g>
      );
    }
    case 'text': {
      const tx = s.rotation ? `rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})` : undefined;
      const font = (s as unknown as { fontFamily?: string }).fontFamily ?? 'system-ui, sans-serif';
      return (
        <g transform={tx}>
          {s.background && s.background !== 'transparent' && (
            <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.background} />
          )}
          <foreignObject x={s.x} y={s.y} width={s.w} height={s.h}>
            {/* xmlns required by foreignObject for HTML; React types don't
                expose it as a div prop, so cast through any. */}
            <div
              {...({ xmlns: 'http://www.w3.org/1999/xhtml' } as Record<string, string>)}
              style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center',
                justifyContent: s.align === 'right' ? 'flex-end' : s.align === 'center' ? 'center' : 'flex-start',
                fontSize: s.fontSize, color: s.color, fontFamily: font,
                fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal',
                textAlign: s.align, lineHeight: 1.2, padding: 2, whiteSpace: 'pre-wrap', overflow: 'hidden',
              }}
            >
              {s.content}
            </div>
          </foreignObject>
        </g>
      );
    }
    case 'triangle':
    case 'diamond':
    case 'pentagon':
    case 'hexagon':
    case 'star': {
      const pts = polygonPoints(s.type, s.x, s.y, s.w, s.h);
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      const tx = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined;
      return (
        <polygon points={pts} fill={s.fill} stroke={s.stroke}
          strokeWidth={s.strokeWidth} opacity={s.opacity} transform={tx} />
      );
    }
    case 'path': {
      const d = s.d ?? pathToD(s.nodes, s.closed);
      const cx = boundingCenter(s.nodes).x, cy = boundingCenter(s.nodes).y;
      const tx = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined;
      return (
        <path d={d} fill={s.closed ? s.fill : 'none'} stroke={s.stroke}
          strokeWidth={s.strokeWidth} opacity={s.opacity} transform={tx} />
      );
    }
    default:
      return null;
  }
}

function polygonPoints(kind: string, x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2, cy = y + h / 2;
  const rx = w / 2, ry = h / 2;
  const tau = Math.PI * 2;
  const v = (n: number, off = -Math.PI / 2): [number, number][] =>
    Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(off + (tau * i) / n), cy + ry * Math.sin(off + (tau * i) / n)]);
  let pts: [number, number][] = [];
  switch (kind) {
    case 'triangle': pts = v(3); break;
    case 'diamond':  pts = v(4); break;
    case 'pentagon': pts = v(5); break;
    case 'hexagon':  pts = v(6); break;
    case 'star': {
      const outer = v(5);
      const inner = v(5, -Math.PI / 2 + tau / 10).map(([px, py]) => [cx + (px - cx) * 0.45, cy + (py - cy) * 0.45] as [number, number]);
      for (let i = 0; i < 5; i++) { pts.push(outer[i]); pts.push(inner[i]); }
      break;
    }
  }
  return pts.map(([px, py]) => `${px},${py}`).join(' ');
}

function pathToD(nodes: { x: number; y: number; cpInX?: number; cpInY?: number; cpOutX?: number; cpOutY?: number }[], closed: boolean): string {
  if (!nodes.length) return '';
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1], cur = nodes[i];
    if (prev.cpOutX !== undefined || cur.cpInX !== undefined) {
      const c1x = prev.x + (prev.cpOutX ?? 0), c1y = prev.y + (prev.cpOutY ?? 0);
      const c2x = cur.x  + (cur.cpInX  ?? 0), c2y = cur.y  + (cur.cpInY  ?? 0);
      d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${cur.x} ${cur.y}`;
    } else {
      d += ` L ${cur.x} ${cur.y}`;
    }
  }
  if (closed) d += ' Z';
  return d;
}

function boundingCenter(nodes: { x: number; y: number }[]): { x: number; y: number } {
  if (!nodes.length) return { x: 0, y: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

// Memo boundary — skips re-renders for sections whose reference, theme, and
// data context all match. Mutations are immutable, so untouched sections
// keep the same reference and pass equality.
interface MemoProps {
  section:     DRCESection;
  doc:         DRCEDocument;
  dataCtx:     DRCEDataContext;
  renderCtx:   DRCERenderContext;
  isSelected:  boolean;
  onClick?:    (id: string) => void;
  onCellChange?: (sectionId: string, columnId: string, rowIndex: number, newValue: string) => Promise<void>;
  onColumnHide?: (sectionId: string, columnId: string) => Promise<void>;
}

const MemoSection = React.memo(function MemoSection(p: MemoProps) {
  // Phase 0 — each section is wrapped in an error boundary so one bad
  // section can't take down the whole document or 500 the print route.
  return (
    <SectionErrorBoundary label={p.section.type}>
      <MemoSectionInner {...p} />
    </SectionErrorBoundary>
  );
}, (prev, next) =>
  prev.section    === next.section    &&
  prev.dataCtx    === next.dataCtx    &&
  prev.renderCtx  === next.renderCtx  &&
  prev.isSelected === next.isSelected &&
  prev.onClick    === next.onClick    &&
  prev.onCellChange === next.onCellChange &&
  prev.onColumnHide === next.onColumnHide &&
  // Phase 0 fix H1 — section renderers (header, results_table, comments,
  // grade_table, …) read doc.theme. We compare the theme REFERENCE so
  // typical edits (theme stays put while sections mutate) still skip
  // unrelated sections, but a theme change correctly busts every section.
  prev.doc.theme    === next.doc.theme &&
  // P2 — visibility rule reference is part of `section`, so the prev.section
  // === next.section check above already covers re-render when the rule is
  // edited. Kept explicit here as documentation.
  prev.section.visibilityRule === next.section.visibilityRule
);

function MemoSectionInner(p: MemoProps) {
  // P2 — conditional visibility rule. `visible:false` (static toggle) still
  // hides for everyone; the rule layer narrows further per-learner.
  // Editor mode (onClick present) keeps the section visible so the author
  // can still select & edit a rule-hidden section.
  const editorMode = Boolean(p.onClick);
  const ruleOk = editorMode
    ? true
    : evaluateRule(p.section.visibilityRule, p.dataCtx);
  if (!ruleOk) return null;
  const rendered = renderSection(p.section, p.doc, p.dataCtx, p.renderCtx, p.onCellChange, p.onColumnHide);
  if (!rendered) return null;
  return (
    <div
      data-drce-section-id={p.section.id}
      onClick={p.onClick ? () => p.onClick!(p.section.id) : undefined}
      style={getSectionWrapperStyle(p.section, p.isSelected, Boolean(p.onClick))}
    >
      {rendered}
    </div>
  );
}
