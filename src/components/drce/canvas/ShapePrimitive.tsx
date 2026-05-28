"use client";
/**
 * Pure, read-only SVG render of any DRCEShape. No selection, no drag, no
 * mouse handlers. Used by the new `shape` section (Phase C.2) so shapes can
 * live as children of an `absolute` container — which makes them flow with
 * the section tree and ends the "shape drifts after save" structural bug
 * described in docs/DRCE_ARCHITECTURE_REVIEW.md §2.8.
 *
 * The ShapeCanvas overlay continues to use its own interactive renderer; this
 * file is the read-only sibling, deliberately duplicated to keep the
 * interactive path free of conditional flags.
 */
import React from 'react';
import type {
  DRCEShape, DRCEPolygonShape, DRCEPathShape,
} from '@/lib/drce/schema';
import { nodesToPathD, pathBounds } from '@/lib/drce/paths';

function polygonPoints(type: DRCEPolygonShape['type'], x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2, cy = y + h / 2;
  const rx = w / 2, ry = h / 2;
  const pt = (a: number, rX: number, rY: number) => `${cx + rX * Math.cos(a)},${cy + rY * Math.sin(a)}`;
  switch (type) {
    case 'triangle': return `${cx},${y} ${x + w},${y + h} ${x},${y + h}`;
    case 'diamond':  return `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
    case 'pentagon': {
      const a = (2 * Math.PI) / 5;
      return Array.from({ length: 5 }, (_, i) => pt(-Math.PI / 2 + i * a, rx, ry)).join(' ');
    }
    case 'hexagon': {
      const a = (2 * Math.PI) / 6;
      return Array.from({ length: 6 }, (_, i) => pt(-Math.PI / 2 + i * a, rx, ry)).join(' ');
    }
    case 'star': {
      const outer = 5, inner = 5;
      const out: string[] = [];
      for (let i = 0; i < outer + inner; i++) {
        const r = i % 2 === 0 ? Math.min(rx, ry) : Math.min(rx, ry) * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / outer;
        out.push(pt(a, r, r));
      }
      return out.join(' ');
    }
  }
}

/** Compute the bounding rectangle for any shape (used to size the wrapping SVG). */
export function shapeBounds(s: DRCEShape): { x: number; y: number; w: number; h: number } {
  if (s.type === 'line' || s.type === 'arrow') {
    const x = Math.min(s.x1, s.x2);
    const y = Math.min(s.y1, s.y2);
    return { x, y, w: Math.max(1, Math.abs(s.x2 - s.x1)), h: Math.max(1, Math.abs(s.y2 - s.y1)) };
  }
  if (s.type === 'path') return pathBounds(s);
  // Remaining variants all carry x/y/w/h.
  const r = s as { x: number; y: number; w: number; h: number };
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

function ShapeBody({ s }: { s: DRCEShape }) {
  if (s.type === 'rect') {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    return (
      <g transform={s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined}>
        <rect x={s.x} y={s.y} width={s.w} height={s.h}
          fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
          rx={s.radius} opacity={s.opacity} />
      </g>
    );
  }
  if (s.type === 'ellipse') {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    return (
      <g transform={s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined}>
        <ellipse cx={cx} cy={cy} rx={s.w / 2} ry={s.h / 2}
          fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
          opacity={s.opacity} />
      </g>
    );
  }
  if (s.type === 'line' || s.type === 'arrow') {
    const markId      = `mkr_ro_${s.id}`;
    const markStartId = `mkrs_ro_${s.id}`;
    return (
      <g>
        <defs>
          {s.endArrow && (
            <marker id={markId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={s.stroke} />
            </marker>
          )}
          {s.startArrow && (
            <marker id={markStartId} markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
              <polygon points="0 0, 10 3.5, 0 7" fill={s.stroke} />
            </marker>
          )}
        </defs>
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          stroke={s.stroke} strokeWidth={s.strokeWidth}
          strokeDasharray={s.dashed ? '6 3' : undefined}
          strokeLinecap="round"
          markerEnd={s.endArrow ? `url(#${markId})` : undefined}
          markerStart={s.startArrow ? `url(#${markStartId})` : undefined}
          opacity={s.opacity} />
      </g>
    );
  }
  if (s.type === 'text') {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    return (
      <g transform={s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined}>
        {s.background && s.background !== 'transparent' && (
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.background} />
        )}
        <foreignObject x={s.x} y={s.y} width={s.w} height={s.h}>
          <div
            style={{
              width: '100%', height: '100%', padding: '2px 4px', boxSizing: 'border-box',
              fontSize: s.fontSize, color: s.color,
              fontWeight: s.bold ? 'bold' : 'normal',
              fontStyle: s.italic ? 'italic' : 'normal',
              textAlign: s.align,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            } as React.CSSProperties}
          >
            {s.content}
          </div>
        </foreignObject>
      </g>
    );
  }
  if (s.type === 'triangle' || s.type === 'diamond' || s.type === 'pentagon' || s.type === 'hexagon' || s.type === 'star') {
    const poly = s as DRCEPolygonShape;
    const pts = polygonPoints(poly.type, poly.x, poly.y, poly.w, poly.h);
    const cx = poly.x + poly.w / 2, cy = poly.y + poly.h / 2;
    return (
      <g transform={poly.rotation ? `rotate(${poly.rotation} ${cx} ${cy})` : undefined}>
        <polygon points={pts}
          fill={poly.fill} stroke={poly.stroke} strokeWidth={poly.strokeWidth}
          opacity={poly.opacity} />
      </g>
    );
  }
  if (s.type === 'path') {
    const p = s as DRCEPathShape;
    const d = p.d ?? nodesToPathD(p.nodes, p.closed);
    const b = pathBounds(p);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return (
      <g transform={p.rotation ? `rotate(${p.rotation} ${cx} ${cy})` : undefined}>
        <path
          d={d}
          fill={p.closed ? p.fill : 'none'}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={p.opacity}
        />
      </g>
    );
  }
  return null;
}

/**
 * Wraps a single DRCEShape in a self-contained SVG sized to its bounding
 * box. The SVG uses the shape's own coords as the viewBox, so the shape
 * draws at its authored position within the SVG; the caller positions the
 * SVG via CSS (inside an `absolute` container, for instance).
 */
export function ShapePrimitive({ shape, fitContent }: { shape: DRCEShape; fitContent?: boolean }) {
  const b = shapeBounds(shape);
  if (b.w <= 0 || b.h <= 0) return null;
  return (
    <svg
      viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`}
      width={fitContent ? b.w : '100%'}
      height={fitContent ? b.h : '100%'}
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: 'visible', display: 'block' }}
    >
      <ShapeBody s={shape} />
    </svg>
  );
}
