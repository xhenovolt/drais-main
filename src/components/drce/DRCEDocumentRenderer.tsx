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
    // PHASE 1A fix G2 — prevent a section from being split across two
    // physical pages by the browser print engine. Tables, grade scales,
    // and watermark anchors all break visually when split mid-row.
    // Authors can override via `style.breakInside: 'auto'`.
    pageBreakInside: ((sectionStyle as Record<string, unknown>).pageBreakInside as React.CSSProperties['pageBreakInside']) ?? 'avoid',
    breakInside: ((sectionStyle as Record<string, unknown>).breakInside as React.CSSProperties['breakInside']) ?? 'avoid-page',
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
  // Defensive guards against undefined contexts.
  //
  // PHASE 1A G4 fix originally threw under SSR so missing context was
  // visible as a 500 rather than 200-with-empty-markup. That cure was
  // worse than the disease — ONE bad student in a 200-learner batch
  // killed the whole PDF. Reverted to console.error + return null so
  // the rest of the batch succeeds. The print/pdf routes now catch
  // catastrophic build failures higher up and surface them as typed
  // JSON errors, which is the better place to enforce visibility.
  if (!document)  { console.error('[DRCEDocumentRenderer] document is missing');  return null; }
  if (!dataCtx)   { console.error('[DRCEDocumentRenderer] dataCtx is missing');   return null; }
  if (!renderCtx) { console.error('[DRCEDocumentRenderer] renderCtx is missing'); return null; }
  
  const { theme, watermark, sections, pages } = document;

  // P5 — multi-page mode: when document.pages is set and non-empty, render
  // one page wrapper per page with its own theme override + watermark
  // override + page-break-after styling. Single-page documents fall through
  // to the existing path so byte-identical render is preserved.
  if (pages && pages.length) {
    return (
      <div className={className}>
        {pages.map((p, idx) => {
          // P2 — per-page visibility rule, evaluated against the same dataCtx.
          if (!evaluateRule(p.visibilityRule, dataCtx) && !onSectionClick) return null;
          // Theme override: shallow merge so unset fields fall back to the
          // document-level theme. Most templates only override page size /
          // orientation per page.
          const pageTheme = { ...theme, ...(p.themeOverride ?? {}) };
          const ps = resolvePageStyle(pageTheme);
          const dims = resolvePageDimensions(pageTheme);
          const pageWM = p.watermarkOverride
            ? { ...watermark, ...p.watermarkOverride }
            : watermark;
          const breakBefore = p.pageBreakBefore ?? (idx > 0 ? 'always' : 'auto');
          const sortedSections = [...(p.sections ?? [])].sort((a, b) => a.order - b.order);
          // PHASE 1A fix G3 — modern `break-*` properties alongside the
          // legacy `pageBreak*` so Chromium honours page breaks in print
          // preview AND on actual print. Some print engines respect only
          // one or the other.
          const pageBreakStyle: React.CSSProperties = {
            pageBreakBefore: breakBefore,
            pageBreakAfter: idx < pages.length - 1 ? 'always' : 'auto',
            breakBefore:    breakBefore === 'always' ? 'page' : undefined,
            breakAfter:     idx < pages.length - 1 ? 'page' : undefined,
          };
          return (
            <div
              key={p.id}
              data-drce-page-id={p.id}
              className="drce-page"
              style={{
                ...ps,
                width: dims.width, minHeight: dims.minHeight,
                ...pageBreakStyle,
                position: 'relative',
                marginBottom: 16,  // visual gap in the editor preview only
                overflow: 'hidden', // prevent absolute content from spilling
              }}
            >
              {pageWM?.enabled && <WatermarkLayer watermark={pageWM} />}
              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Phase L3 — per-page header section. Renders ABOVE the
                    page's regular sections. Operator authors any
                    DRCESection (header, banner, container, …) and it
                    appears once per page in normal document flow. For
                    bars that repeat on EVERY paper page, use
                    document.runningHeader instead (puppeteer-driven). */}
                {p.pageHeader && (
                  <MemoSection
                    key={`${p.id}-header`}
                    section={p.pageHeader}
                    doc={document}
                    dataCtx={dataCtx}
                    renderCtx={renderCtx}
                    isSelected={selectedSectionId === p.pageHeader.id}
                    onClick={onSectionClick}
                    onCellChange={onCellChange}
                    onColumnHide={onColumnHide}
                  />
                )}
                {sortedSections.map(section => (
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
                {/* Phase L3 — per-page footer section. Mirror of the
                    pageHeader slot, rendered BELOW regular sections. */}
                {p.pageFooter && (
                  <MemoSection
                    key={`${p.id}-footer`}
                    section={p.pageFooter}
                    doc={document}
                    dataCtx={dataCtx}
                    renderCtx={renderCtx}
                    isSelected={selectedSectionId === p.pageFooter.id}
                    onClick={onSectionClick}
                    onCellChange={onCellChange}
                    onColumnHide={onColumnHide}
                  />
                )}
              </div>
              {/* Per-page shapes overlay always. Document-wide shapes
                  overlay ONLY on the first page (PHASE 1A fix G7 — the
                  previous code emitted document.shapes on every page,
                  causing decorative shapes to repeat). Watermarks are
                  intentionally per-page already. */}
              <StaticShapeLayer shapes={p.shapes ?? []} dataCtx={dataCtx} />
              {idx === 0 && <StaticShapeLayer shapes={document.shapes ?? []} dataCtx={dataCtx} />}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Single-page path (unchanged) ─────────────────────────────────────────
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
      <StaticShapeLayer shapes={document.shapes ?? []} dataCtx={dataCtx} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StaticShapeLayer — read-only SVG for legacy `document.shapes[]`.
// Pure: no listeners, no state. Works under renderToStaticMarkup.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * P5 — extracted so per-page watermark overrides reuse the same JSX as the
 * single-page watermark. Pure, deterministic, no React state.
 */
function WatermarkLayer({ watermark }: { watermark: { enabled?: boolean; type?: string; content?: string; color?: string; fontSize?: number; opacity?: number; rotation?: number; position?: string; imageUrl?: string } }) {
  if (!watermark?.enabled) return null;
  const rot = watermark.rotation ?? 0;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems:     watermark.position === 'center' ? 'center' : 'flex-start',
        justifyContent: watermark.position === 'center' ? 'center' : 'flex-start',
        pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
      }}
    >
      {watermark.type === 'text' ? (
        <span style={{
          color: watermark.color, fontSize: watermark.fontSize,
          opacity: watermark.opacity, transform: `rotate(${rot}deg)`,
          fontWeight: 'bold', userSelect: 'none', whiteSpace: 'nowrap',
        }}>
          {watermark.content}
        </span>
      ) : watermark.type === 'qrcode' ? (
        <div style={{ opacity: watermark.opacity, transform: `rotate(${rot}deg)` }}>
          <QRCodeSVG value={watermark.content || 'https://drais.app'} size={watermark.fontSize ?? 120} />
        </div>
      ) : watermark.imageUrl ? (
        <img src={watermark.imageUrl} alt={watermark.content}
          style={{ opacity: watermark.opacity, transform: `rotate(${rot}deg)`, maxWidth: '60%', maxHeight: '60%' }} />
      ) : null}
    </div>
  );
}

function StaticShapeLayer({ shapes, dataCtx }: { shapes: DRCEShape[]; dataCtx: DRCEDataContext }) {
  if (!shapes.length) return null;
  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'visible', zIndex: 5,
      }}
    >
      {shapes.map(s => <StaticShape key={s.id} shape={s} dataCtx={dataCtx} />)}
    </svg>
  );
}

function StaticShape({ shape: s, dataCtx }: { shape: DRCEShape; dataCtx: DRCEDataContext }) {
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
    case 'image': {
      // P3 — print parity for image shape, with optional data-binding so
      // `binding: 'student.photoUrl'` resolves per-learner at render time.
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      const tx = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined;
      const fit = s.fit ?? 'contain';
      const preserve = fit === 'stretch' ? 'none'
                     : fit === 'cover'   ? 'xMidYMid slice'
                     : 'xMidYMid meet';
      const cl = s.cropLeft ?? 0, ct = s.cropTop ?? 0;
      const cr = s.cropRight ?? 0, cb = s.cropBottom ?? 0;
      const hasCrop = cl + ct + cr + cb > 0;
      const clipId = `imgprint_clip_${s.id}`;
      const resolvedSrc = resolveImageSrc(s, dataCtx);
      if (!resolvedSrc) return null;
      return (
        <g transform={tx} opacity={s.opacity}>
          {hasCrop && (
            <defs>
              <clipPath id={clipId}>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} />
              </clipPath>
            </defs>
          )}
          <image
            href={resolvedSrc}
            x={s.x - cl * s.w} y={s.y - ct * s.h}
            width={s.w * (1 + cl + cr) || s.w}
            height={s.h * (1 + ct + cb) || s.h}
            preserveAspectRatio={preserve}
            clipPath={hasCrop ? `url(#${clipId})` : undefined}
          />
        </g>
      );
    }
    case 'qrcode': {
      // QR shapes fill the bounding box edge-to-edge. We use
      // qrcode.react's SVG output inside a <foreignObject> so the QR
      // stays vector + scales perfectly to the (w,h) the author dragged.
      // Resolves binding the same way image shapes do — if `binding`
      // resolves to a non-empty string it overrides `value`.
      const tx = s.rotation ? `rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})` : undefined;
      const resolved = resolveStringValue(s.value, s.binding, dataCtx);
      const sz = Math.min(s.w, s.h);
      return (
        <g transform={tx} opacity={s.opacity}>
          <foreignObject x={s.x + (s.w - sz) / 2} y={s.y + (s.h - sz) / 2} width={sz} height={sz}>
            <div
              {...({ xmlns: 'http://www.w3.org/1999/xhtml' } as Record<string, string>)}
              style={{ width: '100%', height: '100%', background: s.bg ?? '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <QRCodeSVG
                value={resolved || 'https://drais.app'}
                size={sz}
                fgColor={s.fg ?? '#000'}
                bgColor={s.bg ?? '#fff'}
                level={s.level ?? 'M'}
                marginSize={s.includeMargin ? 4 : 0}
              />
            </div>
          </foreignObject>
        </g>
      );
    }
    case 'barcode': {
      // Tight-fit Code128-ish barcode. The bars are sized in EXACT
      // pixels of (w, h) so the rendered box matches what the author
      // dragged — no preserveAspectRatio scaling, no internal padding.
      // The label sits below the bars within the same box; when
      // `showLabel` is false the bars take the full height.
      const tx = s.rotation ? `rotate(${s.rotation} ${s.x + s.w / 2} ${s.y + s.h / 2})` : undefined;
      const resolved = resolveStringValue(s.value, s.binding, dataCtx);
      const showLabel = s.showLabel !== false;
      const labelSize = s.labelFontSize ?? Math.max(6, Math.min(12, Math.floor(s.h * 0.15)));
      const labelGap  = showLabel ? labelSize + 2 : 0;
      const barsH     = Math.max(1, s.h - labelGap);
      const fg        = s.fg ?? '#111';
      const bg        = s.bg ?? '#fff';
      const bars      = buildBarcodeRects(resolved, s.x, s.y, s.w, barsH, fg, bg);
      return (
        <g transform={tx} opacity={s.opacity}>
          {/* Background fill so the bars sit on a white quiet zone even
              when the page background is coloured. */}
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={bg} />
          {bars}
          {showLabel && (
            <text
              x={s.x + s.w / 2}
              y={s.y + s.h - 1}
              textAnchor="middle"
              fontSize={labelSize}
              fill={fg}
              style={{ fontFamily: 'monospace' }}
            >
              {resolved}
            </text>
          )}
        </g>
      );
    }
    default:
      return null;
  }
}

/**
 * Build the bar rectangles for a barcode shape. Bars fill the box
 * edge-to-edge with no inner padding. Uses the same charCode % 10 →
 * width heuristic as the legacy InlineBarcode for visual continuity
 * — NOT a real Code128 scanner-grade encoder.
 */
function buildBarcodeRects(
  value: string, x: number, y: number, w: number, h: number, fg: string, bg: string,
): React.ReactNode[] {
  const pattern = [3, 1, 2, 1, 3, 1, 2, 2, 1, 2];
  const safe = (value || '').slice(0, 32);
  if (!safe.length) return [];
  // Compute total natural width so we can scale bars to fill exactly `w`.
  let totalUnits = 0;
  const seq: Array<{ w: number; bar: boolean }> = [];
  for (let i = 0; i < safe.length; i++) {
    const code = safe.charCodeAt(i) % 10;
    const bw = pattern[code];
    seq.push({ w: bw, bar: true });
    seq.push({ w: 1, bar: false });
    totalUnits += bw + 1;
    if (i % 3 === 2) {
      seq.push({ w: 1, bar: false });
      totalUnits += 1;
    }
  }
  if (totalUnits === 0) return [];
  const unitPx = w / totalUnits;
  const out: React.ReactNode[] = [];
  let cx = x;
  let idx = 0;
  for (const s of seq) {
    const segW = s.w * unitPx;
    if (s.bar) {
      out.push(<rect key={`b${idx}`} x={cx} y={y} width={segW} height={h} fill={fg} />);
    } else if (bg !== '#fff' && bg !== 'transparent') {
      // Explicit gap fills only when bg is non-default — the underlying
      // background rect already covers '#fff'.
      out.push(<rect key={`g${idx}`} x={cx} y={y} width={segW} height={h} fill={bg} />);
    }
    cx += segW;
    idx++;
  }
  return out;
}

/**
 * Resolve a string-valued shape prop. Mirrors resolveImageSrc but for
 * any binding that should yield a string (barcode + qrcode values).
 */
function resolveStringValue(
  staticValue: string,
  binding: string | undefined,
  ctx: DRCEDataContext,
): string {
  if (binding && binding.trim()) {
    try {
      const root: Record<string, unknown> = {
        student:    ctx.student,
        subjects:   ctx.subjects,
        results:    ctx.results,
        assessment: ctx.assessment,
        comments:   ctx.comments,
        meta:       ctx.meta,
      };
      let cur: unknown = root;
      for (const part of binding.split('.')) {
        if (cur == null || typeof cur !== 'object') { cur = null; break; }
        cur = (cur as Record<string, unknown>)[part];
      }
      if (typeof cur === 'string' && cur.trim()) return cur;
      if (typeof cur === 'number') return String(cur);
    } catch { /* fall through */ }
  }
  return staticValue || '';
}

/**
 * P3 — resolve an image shape's src. If `binding` is set we walk the
 * dataCtx to fetch a URL (e.g. `student.photoUrl`, `meta.logoUrl`,
 * `student.custom.signature_url`) — when the bound value is missing or
 * empty we fall back to the static `src`. Never throws.
 */
function resolveImageSrc(
  s: { src: string; binding?: string },
  ctx: DRCEDataContext,
): string {
  const binding = s.binding?.trim();
  if (!binding) return s.src || '';
  try {
    // Mirror bindingResolver's root shape.
    const root: Record<string, unknown> = {
      student:    ctx.student,
      subjects:   ctx.subjects,
      results:    ctx.results,
      assessment: ctx.assessment,
      comments:   ctx.comments,
      meta:       ctx.meta,
    };
    let cur: unknown = root;
    for (const part of binding.split('.')) {
      if (cur == null || typeof cur !== 'object') { cur = null; break; }
      cur = (cur as Record<string, unknown>)[part];
    }
    if (typeof cur === 'string' && cur.trim()) return cur;
  } catch { /* fall through */ }
  return s.src || '';
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
