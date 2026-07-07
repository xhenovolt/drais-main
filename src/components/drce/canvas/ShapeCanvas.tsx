// src/components/drce/canvas/ShapeCanvas.tsx
// SVG canvas overlay for DRCE shape drawing. Positioned absolutely over the
// document renderer so shapes float above the report content.
'use client';

import React, { useRef, useState, useEffect } from 'react';
import type {
  DRCEShape, DRCERectShape, DRCEEllipseShape, DRCELineShape, DRCETextShape, DRCEPolygonShape, DRCEPathShape, DRCEPathNode,
} from '@/lib/drce/schema';
import { nodesToPathD, refreshPathD, setNodeAnchor } from '@/lib/drce/paths';

// ─── Types ───────────────────────────────────────────────────────────────────────────────

export type DrawTool = 'select' | 'rect' | 'ellipse' | 'arrow' | 'line' | 'text'
  | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star'
  | 'pen' | 'polygon'     // Vector tools — drawing UX lands in commit 2
  | 'image'               // P3 — drag-to-place an uploaded image
  | 'qrcode' | 'barcode'; // Phase L1 — anti-forgery / scannable shapes

type RectHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type LineHandle = 'p1' | 'p2';
type HandleId = RectHandle | LineHandle;

type DragState =
  | null
  | { kind: 'drawing'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'moving';   id: string; orig: DRCEShape; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'resizing'; id: string; orig: DRCEShape; handle: HandleId; sx: number; sy: number; cx: number; cy: number }
  /** Phase-vector: tracking a bezier OUT handle on the latest pen-drawn anchor */
  | { kind: 'pen-handle'; nodeIdx: number; anchorX: number; anchorY: number }
  /** Phase-vector: dragging one anchor of an already-committed path. */
  | { kind: 'path-node'; id: string; orig: DRCEPathShape; nodeIdx: number; sx: number; sy: number; cx: number; cy: number }
  /** Phase-vector: dragging an IN/OUT bezier handle of an existing path. */
  | { kind: 'bezier'; id: string; orig: DRCEPathShape; nodeIdx: number; which: 'in' | 'out';
      symmetric: boolean; sx: number; sy: number; cx: number; cy: number };

interface Props {
  shapes: DRCEShape[];
  activeTool: DrawTool;
  selectedShapeId: string | null;
  onAddShape: (s: DRCEShape) => void;
  onUpdateShape: (id: string, u: Partial<DRCEShape>) => void;
  onSelectShape: (id: string | null) => void;
  /** P3 — URL to use when finishing an `image` tool drag, or when an OS file
   *  is dropped onto the canvas. Wired up in DRCEEditor: the Image button in
   *  the drawing toolbar uploads the file, then sets this prop. */
  pendingImageSrc?: string | null;
  /** P3 — invoked when an OS file is dropped on the canvas so the parent
   *  can upload it and supply a URL via pendingImageSrc on the next tick. */
  onFileDropUpload?: (file: File, x: number, y: number) => Promise<string | null>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { newShapeId } from '@/lib/drce/ids';
function uid() { return newShapeId(); }

/** Compute SVG polygon `points` string for built-in polygon shapes. */
function polygonPoints(type: DRCEPolygonShape['type'], x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2, cy = y + h / 2;
  const rx = w / 2, ry = h / 2;
  function pt(angle: number, rX: number, rY: number) {
    return `${cx + rX * Math.cos(angle)},${cy + rY * Math.sin(angle)}`;
  }
  switch (type) {
    case 'triangle':
      return `${cx},${y} ${x + w},${y + h} ${x},${y + h}`;
    case 'diamond':
      return `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
    case 'pentagon': {
      const a = (2 * Math.PI) / 5;
      return Array.from({ length: 5 }, (_, i) => pt(-Math.PI / 2 + i * a, rx, ry)).join(' ');
    }
    case 'hexagon': {
      const a = (2 * Math.PI) / 6;
      return Array.from({ length: 6 }, (_, i) => pt(-Math.PI / 2 + i * a, rx, ry)).join(' ');
    }
    case 'star': {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.4;
        pts.push(`${cx + rx * r * Math.cos(angle)},${cy + ry * r * Math.sin(angle)}`);
      }
      return pts.join(' ');
    }
    default: return '';
  }
}

const POLYGON_TYPES = new Set(['triangle', 'diamond', 'pentagon', 'hexagon', 'star']);
function isPolygonTool(t: DrawTool): t is DRCEPolygonShape['type'] {
  return POLYGON_TYPES.has(t);
}

function getSVGPoint(e: React.MouseEvent | MouseEvent, svg: SVGSVGElement) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const t = pt.matrixTransform(ctm.inverse());
  return { x: t.x, y: t.y };
}

/** Top-left-most point of a shape's geometry (used for off-page clamping). */
function shapeMinCorner(s: DRCEShape): { x: number; y: number } {
  if (s.type === 'line' || s.type === 'arrow') {
    const l = s as DRCELineShape;
    return { x: Math.min(l.x1, l.x2), y: Math.min(l.y1, l.y2) };
  }
  if (s.type === 'path') {
    const p = s as DRCEPathShape;
    let mnx = Infinity, mny = Infinity;
    for (const n of p.nodes) { if (n.x < mnx) mnx = n.x; if (n.y < mny) mny = n.y; }
    return { x: Number.isFinite(mnx) ? mnx : 0, y: Number.isFinite(mny) ? mny : 0 };
  }
  const r = s as DRCERectShape;
  return { x: r.x, y: r.y };
}

/**
 * Reduce a drag delta so a shape's top-left corner can't cross the page origin
 * (0,0) — the common cause of "dragged a component off-canvas and it vanished".
 * Unit-safe: 0 is the page origin in the SAME coordinate space as shape coords
 * (getScreenCTM already normalised zoom/scroll), so this never mis-clamps.
 * Only the lower bound is enforced here; the upper (page width/height) bound is
 * intentionally left for a page-dimension-aware follow-up.
 */
function clampDeltaToOrigin(orig: DRCEShape, dx: number, dy: number): { dx: number; dy: number } {
  const min = shapeMinCorner(orig);
  return {
    dx: min.x + dx < 0 ? -min.x : dx,
    dy: min.y + dy < 0 ? -min.y : dy,
  };
}

function getHandles(s: DRCEShape): { id: HandleId; cx: number; cy: number }[] {
  if (s.type === 'line' || s.type === 'arrow') {
    return [
      { id: 'p1', cx: (s as DRCELineShape).x1, cy: (s as DRCELineShape).y1 },
      { id: 'p2', cx: (s as DRCELineShape).x2, cy: (s as DRCELineShape).y2 },
    ];
  }
  // Path shapes use a computed bounding box.
  let x: number, y: number, w: number, h: number;
  if (s.type === 'path') {
    const b = (s as DRCEPathShape);
    // Tiny inline bbox so we avoid importing the helper twice in this file.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of b.nodes) {
      if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
    }
    x = minX; y = minY; w = Math.max(1, maxX - minX); h = Math.max(1, maxY - minY);
  } else {
    ({ x, y, w, h } = s as DRCERectShape | DRCEEllipseShape | DRCETextShape);
  }
  return [
    { id: 'nw', cx: x,       cy: y       }, { id: 'n',  cx: x+w/2, cy: y       },
    { id: 'ne', cx: x+w,     cy: y       }, { id: 'e',  cx: x+w,   cy: y+h/2   },
    { id: 'se', cx: x+w,     cy: y+h     }, { id: 's',  cx: x+w/2, cy: y+h     },
    { id: 'sw', cx: x,       cy: y+h     }, { id: 'w',  cx: x,     cy: y+h/2   },
  ];
}

function handleCursor(h: HandleId) {
  switch (h) {
    case 'nw': case 'se': return 'nwse-resize';
    case 'ne': case 'sw': return 'nesw-resize';
    case 'n':  case 's':  return 'ns-resize';
    case 'e':  case 'w':  return 'ew-resize';
    default: return 'crosshair';
  }
}

/** Return the shape with drag delta visually applied (without mutating the store). */
function applyDrag(s: DRCEShape, drag: DragState): DRCEShape {
  if (!drag) return s;
  // Only 'moving' and 'resizing' have a shape id + cx/cy/sx/sy.
  if (drag.kind === 'drawing' || drag.kind === 'pen-handle') return s;
  if (drag.id !== s.id) return s;
  const dx = drag.cx - drag.sx;
  const dy = drag.cy - drag.sy;

  if (drag.kind === 'path-node') {
    if (s.type !== 'path') return s;
    const p = drag.orig as DRCEPathShape;
    const target = p.nodes[drag.nodeIdx];
    if (!target) return s;
    return setNodeAnchor(s as DRCEPathShape, drag.nodeIdx, target.x + dx, target.y + dy) as DRCEShape;
  }

  if (drag.kind === 'bezier') {
    if (s.type !== 'path') return s;
    const p = (s as DRCEPathShape);
    const node = p.nodes[drag.nodeIdx];
    if (!node) return s;
    const handleX = (drag.which === 'in' ? (node.cpInX ?? node.x) : (node.cpOutX ?? node.x)) + dx;
    const handleY = (drag.which === 'in' ? (node.cpInY ?? node.y) : (node.cpOutY ?? node.y)) + dy;
    const nodes = p.nodes.slice();
    nodes[drag.nodeIdx] = drag.which === 'in'
      ? { ...node, cpInX:  handleX, cpInY:  handleY,
          // Mirror the opposite handle when symmetric, so the curve stays smooth.
          ...(drag.symmetric ? { cpOutX: node.x - (handleX - node.x), cpOutY: node.y - (handleY - node.y) } : {}) }
      : { ...node, cpOutX: handleX, cpOutY: handleY,
          ...(drag.symmetric ? { cpInX:  node.x - (handleX - node.x), cpInY:  node.y - (handleY - node.y) } : {}) };
    return { ...s, nodes, d: nodesToPathD(nodes, p.closed) } as DRCEShape;
  }

  if (drag.kind === 'moving') {
    // Keep the shape's top-left inside the page origin so it can't be dragged
    // off-canvas and lost (Phase 4 drag-stability fix).
    const { dx: mdx, dy: mdy } = clampDeltaToOrigin(drag.orig, dx, dy);
    if (s.type === 'line' || s.type === 'arrow') {
      const l = drag.orig as DRCELineShape;
      return { ...s, x1: l.x1 + mdx, y1: l.y1 + mdy, x2: l.x2 + mdx, y2: l.y2 + mdy } as DRCEShape;
    }
    if (s.type === 'path') {
      const p = drag.orig as DRCEPathShape;
      const nodes = p.nodes.map(n => ({
        x: n.x + mdx, y: n.y + mdy,
        cpInX:  n.cpInX  != null ? n.cpInX  + mdx : undefined,
        cpInY:  n.cpInY  != null ? n.cpInY  + mdy : undefined,
        cpOutX: n.cpOutX != null ? n.cpOutX + mdx : undefined,
        cpOutY: n.cpOutY != null ? n.cpOutY + mdy : undefined,
      }));
      return { ...s, nodes, d: nodesToPathD(nodes, p.closed) } as DRCEShape;
    }
    const b = drag.orig as DRCERectShape;
    return { ...s, x: b.x + mdx, y: b.y + mdy } as DRCEShape;
  }

  if (drag.kind === 'resizing') {
    if (s.type === 'line' || s.type === 'arrow') {
      const l = drag.orig as DRCELineShape;
      if (drag.handle === 'p1') return { ...s, x1: l.x1 + dx, y1: l.y1 + dy } as DRCEShape;
      return { ...s, x2: l.x2 + dx, y2: l.y2 + dy } as DRCEShape;
    }
    if (s.type === 'path') {
      const resized = resizePathByHandle(drag.orig as DRCEPathShape, drag.handle as RectHandle, dx, dy);
      return { ...s, ...resized } as DRCEShape;
    }
    const { x, y, w, h } = drag.orig as DRCERectShape;
    let [nx, ny, nw, nh] = [x, y, w, h];
    switch (drag.handle as RectHandle) {
      case 'nw': nx += dx; ny += dy; nw -= dx; nh -= dy; break;
      case 'n':             ny += dy;           nh -= dy; break;
      case 'ne':            ny += dy; nw += dx; nh -= dy; break;
      case 'e':                       nw += dx;           break;
      case 'se':                      nw += dx; nh += dy; break;
      case 's':                                 nh += dy; break;
      case 'sw': nx += dx;            nw -= dx; nh += dy; break;
      case 'w':  nx += dx;            nw -= dx;           break;
    }
    return { ...s, x: nx, y: ny, w: Math.max(nw, 10), h: Math.max(nh, 10) } as DRCEShape;
  }
  return s;
}

// ── Smart alignment guides ─────────────────────────────────────────────────

const SNAP_PX = 5;

/** Axis-aligned bounding box for any shape, for snap math. */
function shapeBBox(s: DRCEShape): { l: number; r: number; t: number; b: number; cx: number; cy: number } {
  if (s.type === 'line' || s.type === 'arrow') {
    const l = Math.min(s.x1, s.x2), r = Math.max(s.x1, s.x2);
    const t = Math.min(s.y1, s.y2), b = Math.max(s.y1, s.y2);
    return { l, r, t, b, cx: (l + r) / 2, cy: (t + b) / 2 };
  }
  if (s.type === 'path') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of (s as DRCEPathShape).nodes) {
      if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
    }
    return { l: minX, r: maxX, t: minY, b: maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }
  const { x, y, w, h } = s as DRCERectShape;
  return { l: x, r: x + w, t: y, b: y + h, cx: x + w / 2, cy: y + h / 2 };
}

/**
 * For a shape being moved by (dx,dy), compute snap-adjustment for both axes
 * AND the guide lines to render. Returns the EXTRA delta to add so the
 * shape's edges/centre line up with sibling edges/centres within SNAP_PX.
 */
function computeSnap(
  orig: DRCEShape, dx: number, dy: number, all: readonly DRCEShape[],
): { adjustX: number; adjustY: number; guides: { orientation: 'v' | 'h'; coord: number }[] } {
  const before = shapeBBox(orig);
  // Move the bbox by the drag delta.
  const moving = {
    l: before.l + dx, r: before.r + dx, cx: before.cx + dx,
    t: before.t + dy, b: before.b + dy, cy: before.cy + dy,
  };
  // Targets = bbox edges/centres of every OTHER shape.
  const others = all.filter(s => s.id !== orig.id).map(shapeBBox);

  let bestX: { delta: number; coord: number } | null = null;
  let bestY: { delta: number; coord: number } | null = null;
  const movingXs = [['l', moving.l], ['cx', moving.cx], ['r', moving.r]] as const;
  const movingYs = [['t', moving.t], ['cy', moving.cy], ['b', moving.b]] as const;

  for (const o of others) {
    const targetXs = [o.l, o.cx, o.r];
    const targetYs = [o.t, o.cy, o.b];
    for (const [, mx] of movingXs) {
      for (const tx of targetXs) {
        const d = tx - mx;
        if (Math.abs(d) <= SNAP_PX && (bestX === null || Math.abs(d) < Math.abs(bestX.delta))) {
          bestX = { delta: d, coord: tx };
        }
      }
    }
    for (const [, my] of movingYs) {
      for (const ty of targetYs) {
        const d = ty - my;
        if (Math.abs(d) <= SNAP_PX && (bestY === null || Math.abs(d) < Math.abs(bestY.delta))) {
          bestY = { delta: d, coord: ty };
        }
      }
    }
  }

  const guides: { orientation: 'v' | 'h'; coord: number }[] = [];
  if (bestX) guides.push({ orientation: 'v', coord: bestX.coord });
  if (bestY) guides.push({ orientation: 'h', coord: bestY.coord });

  return {
    adjustX: bestX?.delta ?? 0,
    adjustY: bestY?.delta ?? 0,
    guides,
  };
}

/** Scale a path's nodes + bezier handles to match a bbox-handle drag. */
function resizePathByHandle(p: DRCEPathShape, h: RectHandle, dx: number, dy: number): Partial<DRCEPathShape> {
  // Compute the original bbox once.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of p.nodes) {
    if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
  }
  const ow = Math.max(1, maxX - minX);
  const oh = Math.max(1, maxY - minY);
  // Target bbox after the drag.
  let nx = minX, ny = minY, nw = ow, nh = oh;
  switch (h) {
    case 'nw': nx += dx; ny += dy; nw -= dx; nh -= dy; break;
    case 'n':             ny += dy;           nh -= dy; break;
    case 'ne':            ny += dy; nw += dx; nh -= dy; break;
    case 'e':                       nw += dx;           break;
    case 'se':                      nw += dx; nh += dy; break;
    case 's':                                 nh += dy; break;
    case 'sw': nx += dx;            nw -= dx; nh += dy; break;
    case 'w':  nx += dx;            nw -= dx;           break;
  }
  nw = Math.max(nw, 8); nh = Math.max(nh, 8);
  const sx = nw / ow, sy = nh / oh;
  const map = (x: number) => nx + (x - minX) * sx;
  const mapY = (y: number) => ny + (y - minY) * sy;
  const nodes = p.nodes.map(n => ({
    x: map(n.x), y: mapY(n.y),
    cpInX:  n.cpInX  != null ? map(n.cpInX)  : undefined,
    cpInY:  n.cpInY  != null ? mapY(n.cpInY) : undefined,
    cpOutX: n.cpOutX != null ? map(n.cpOutX) : undefined,
    cpOutY: n.cpOutY != null ? mapY(n.cpOutY) : undefined,
  }));
  return { nodes, d: nodesToPathD(nodes, p.closed) };
}

/** Build a ghost shape from the current draw drag state. */
function makeDraft(tool: DrawTool, x1: number, y1: number, x2: number, y2: number): DRCEShape | null {
  const mx = Math.min(x1, x2), my = Math.min(y1, y2);
  const w = Math.max(Math.abs(x2 - x1), 4), h = Math.max(Math.abs(y2 - y1), 4);
  switch (tool) {
    case 'rect':
      return { id: '__d', type: 'rect', x: mx, y: my, w, h, fill: 'rgba(79,70,229,0.08)', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, radius: 0, rotation: 0 };
    case 'ellipse':
      return { id: '__d', type: 'ellipse', x: mx, y: my, w, h, fill: 'rgba(79,70,229,0.08)', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, rotation: 0 };
    case 'arrow':
      return { id: '__d', type: 'arrow', x1, y1, x2, y2, stroke: '#ef4444', strokeWidth: 2, opacity: 1, dashed: false, endArrow: true, startArrow: false, arrowSize: 8 };
    case 'line':
      return { id: '__d', type: 'line', x1, y1, x2, y2, stroke: '#374151', strokeWidth: 2, opacity: 1, dashed: false, endArrow: false, startArrow: false, arrowSize: 8 };
    case 'text':
      return { id: '__d', type: 'text', x: mx, y: my, w: Math.max(w, 80), h: Math.max(h, 28), content: 'Text', fontSize: 14, color: '#1f2937', background: 'transparent', bold: false, italic: false, align: 'left', rotation: 0 };
    case 'image':
      // P3 — ghost rectangle while drawing the placement box.
      return { id: '__d', type: 'image', x: mx, y: my, w, h, src: '', fit: 'contain', opacity: 0.7, rotation: 0 };
    default:
      if (isPolygonTool(tool)) {
        return { id: '__d', type: tool, x: mx, y: my, w, h, fill: 'rgba(79,70,229,0.08)', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, rotation: 0 } as DRCEShape;
      }
      return null;
  }
}

// ─── Shape Renderer ───────────────────────────────────────────────────────────

function renderShapeEl(
  s: DRCEShape,
  isSelected: boolean,
  isDraft: boolean,
  onMouseDown: ((e: React.MouseEvent) => void) | undefined,
) {
  const selStroke = '#4f46e5';
  const moveCursor = isDraft ? 'crosshair' : 'move';

  if (s.type === 'rect') {
    const rotation = s.rotation || 0;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    return (
      <g
        style={{ cursor: moveCursor }}
        transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
        onMouseDown={onMouseDown}
      >
        <rect
          x={s.x} y={s.y} width={s.w} height={s.h}
          fill={s.fill} stroke={isSelected ? selStroke : s.stroke}
          strokeWidth={isSelected ? Math.max(s.strokeWidth, 1.5) : s.strokeWidth}
          strokeDasharray={isSelected ? '5 3' : undefined}
          rx={s.radius}
          opacity={s.opacity}
          style={{ pointerEvents: 'auto' }}
        />
      </g>
    );
  }
  if (s.type === 'ellipse') {
    const rotation = s.rotation || 0;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    return (
      <g
        style={{ cursor: moveCursor }}
        transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
        onMouseDown={onMouseDown}
      >
        <ellipse
          cx={cx} cy={cy}
          rx={s.w / 2} ry={s.h / 2}
          fill={s.fill} stroke={isSelected ? selStroke : s.stroke}
          strokeWidth={isSelected ? Math.max(s.strokeWidth, 1.5) : s.strokeWidth}
          strokeDasharray={isSelected ? '5 3' : undefined}
          opacity={s.opacity}
          style={{ pointerEvents: 'auto' }}
        />
      </g>
    );
  }
  if (s.type === 'line' || s.type === 'arrow') {
    const markId = `mkr_${s.id}`;
    const markStartId = `mkrs_${s.id}`;
    return (
      <g style={{ cursor: moveCursor }} onMouseDown={onMouseDown}>
        <defs>
          {s.endArrow && (
            <marker id={markId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={isSelected ? selStroke : s.stroke} />
            </marker>
          )}
          {s.startArrow && (
            <marker id={markStartId} markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
              <polygon points="0 0, 10 3.5, 0 7" fill={isSelected ? selStroke : s.stroke} />
            </marker>
          )}
        </defs>
        {/* Wide transparent hit area */}
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={Math.max(s.strokeWidth + 8, 12)} />
        <line
          x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          stroke={isSelected ? selStroke : s.stroke}
          strokeWidth={s.strokeWidth}
          strokeDasharray={s.dashed ? '6 3' : undefined}
          strokeLinecap="round"
          markerEnd={s.endArrow ? `url(#${markId})` : undefined}
          markerStart={s.startArrow ? `url(#${markStartId})` : undefined}
          opacity={s.opacity}
        />
      </g>
    );
  }
  if (s.type === 'text') {
    const rotation = s.rotation || 0;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    return (
      <g
        style={{ cursor: moveCursor }}
        transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
        onMouseDown={onMouseDown}
      >
        {s.background !== 'transparent' && s.background && (
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.background} />
        )}
        {isSelected && (
          <rect x={s.x} y={s.y} width={s.w} height={s.h}
            fill="none" stroke={selStroke} strokeWidth={1.5} strokeDasharray="5 3" />
        )}
        <foreignObject x={s.x} y={s.y} width={s.w} height={s.h}>
          {/* @ts-expect-error xmlns needed for SVG foreignObject */}
          <div xmlns="http://www.w3.org/1999/xhtml"
            style={{
              width: '100%', height: '100%', padding: '2px 4px', boxSizing: 'border-box',
              fontSize: s.fontSize, color: s.color,
              fontWeight: s.bold ? 'bold' : 'normal',
              fontStyle: s.italic ? 'italic' : 'normal',
              textAlign: s.align,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              pointerEvents: 'none', userSelect: 'none',
            }}
          >
            {s.content || 'Text'}
          </div>
        </foreignObject>
      </g>
    );
  }
  // P3 — image shape (interactive render). Crop is applied via SVG
  // preserveAspectRatio + viewBox-style clipping: we map the crop window
  // by drawing the image inside a <clipPath> sized to the shape.
  if (s.type === 'image') {
    const rotation = s.rotation || 0;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const cl = s.cropLeft   ?? 0, ct = s.cropTop    ?? 0;
    const cr = s.cropRight  ?? 0, cb = s.cropBottom ?? 0;
    const fit: 'contain' | 'cover' | 'stretch' = s.fit ?? 'contain';
    // For "crop" we use a clipPath sized to the visible box. For "cover"/"contain"
    // we let SVG handle aspect via preserveAspectRatio.
    const preserve = fit === 'stretch' ? 'none'
                   : fit === 'cover'   ? 'xMidYMid slice'
                   : 'xMidYMid meet';
    const hasCrop = cl + ct + cr + cb > 0;
    const clipId = `img_clip_${s.id}`;
    const placeholderId = `img_ph_${s.id}`;
    const src = s.src || '';
    return (
      <g
        style={{ cursor: moveCursor }}
        transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
        onMouseDown={onMouseDown}
        opacity={s.opacity}
      >
        <defs>
          {hasCrop && (
            <clipPath id={clipId}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} />
            </clipPath>
          )}
        </defs>
        {/* Placeholder while src missing — gives the rect something to click. */}
        {!src && (
          <rect id={placeholderId} x={s.x} y={s.y} width={s.w} height={s.h}
            fill="rgba(99,102,241,0.06)" stroke="#a5b4fc" strokeDasharray="4 3" />
        )}
        {src && (
          <image
            href={src}
            x={s.x - (cl * s.w)}
            y={s.y - (ct * s.h)}
            width={s.w * (1 + cl + cr) || s.w}
            height={s.h * (1 + ct + cb) || s.h}
            preserveAspectRatio={preserve}
            clipPath={hasCrop ? `url(#${clipId})` : undefined}
            style={{ pointerEvents: 'auto' }}
          />
        )}
        {isSelected && (
          <rect x={s.x} y={s.y} width={s.w} height={s.h}
            fill="none" stroke={selStroke} strokeWidth={1.5} strokeDasharray="5 3"
            style={{ pointerEvents: 'none' }} />
        )}
      </g>
    );
  }
  // Polygon shapes
  if (s.type === 'triangle' || s.type === 'diamond' || s.type === 'pentagon' || s.type === 'hexagon' || s.type === 'star') {
    const poly = s as DRCEPolygonShape;
    const pts = polygonPoints(poly.type, poly.x, poly.y, poly.w, poly.h);
    const cx = poly.x + poly.w / 2;
    const cy = poly.y + poly.h / 2;
    return (
      <g
        style={{ cursor: moveCursor }}
        transform={poly.rotation ? `rotate(${poly.rotation} ${cx} ${cy})` : undefined}
        onMouseDown={onMouseDown}
      >
        <polygon
          points={pts}
          fill={poly.fill} stroke={isSelected ? selStroke : poly.stroke}
          strokeWidth={isSelected ? Math.max(poly.strokeWidth, 1.5) : poly.strokeWidth}
          strokeDasharray={isSelected ? '5 3' : undefined}
          opacity={poly.opacity}
          style={{ pointerEvents: 'auto' }}
        />
      </g>
    );
  }
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ShapeCanvas({
  shapes, activeTool, selectedShapeId, onAddShape, onUpdateShape, onSelectShape,
  pendingImageSrc, onFileDropUpload,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  // Phase-vector: in-progress path drawn by Pen / Custom Polygon tools.
  const [pathDraft, setPathDraft] = useState<DRCEPathShape | null>(null);
  // Live cursor position (path mode only) — drives the guide line from the
  // last anchor to the cursor while the user is composing the path.
  const [pathCursor, setPathCursor] = useState<{ x: number; y: number } | null>(null);
  // Smart alignment guide lines drawn during a 'moving' drag.
  const [guides, setGuides] = useState<{ orientation: 'v' | 'h'; coord: number }[]>([]);
  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when entering text edit mode
  useEffect(() => {
    if (textEditId && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [textEditId]);

  // Cancel any in-progress path draft when switching away from pen/polygon.
  useEffect(() => {
    if (activeTool !== 'pen' && activeTool !== 'polygon') {
      if (pathDraft) setPathDraft(null);
      if (pathCursor) setPathCursor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  // Enter commits the in-progress path open; Escape discards it.
  useEffect(() => {
    if (!pathDraft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPathDraft(null); setPathCursor(null); }
      else if (e.key === 'Enter') {
        if (pathDraft.nodes.length < 2) { setPathDraft(null); return; }
        commitDraft({ closed: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathDraft]);

  function commitDraft({ closed }: { closed: boolean }) {
    if (!pathDraft || pathDraft.nodes.length < 2) {
      setPathDraft(null);
      setPathCursor(null);
      return;
    }
    const finished = refreshPathD({ ...pathDraft, closed });
    onAddShape(finished);
    setPathDraft(null);
    setPathCursor(null);
  }

  function pt(e: React.MouseEvent) {
    return svgRef.current ? getSVGPoint(e, svgRef.current) : { x: 0, y: 0 };
  }

  function onSVGMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (activeTool === 'select') {
      // Clicking blank canvas deselects
      if ((e.target as SVGElement).hasAttribute('data-canvas-bg')) {
        onSelectShape(null);
      }
      return;
    }

    // ── Pen / Custom Polygon — both build a DRCEPathShape vertex by vertex.
    if (activeTool === 'pen' || activeTool === 'polygon') {
      e.stopPropagation();
      const { x, y } = pt(e);
      // Close + commit when clicking near the first node.
      if (pathDraft && pathDraft.nodes.length >= 2) {
        const first = pathDraft.nodes[0];
        if (Math.hypot(first.x - x, first.y - y) < 8) {
          commitDraft({ closed: true });
          return;
        }
      }
      const newNode: DRCEPathNode = { x, y };
      const next: DRCEPathShape = pathDraft
        ? refreshPathD({ ...pathDraft, nodes: [...pathDraft.nodes, newNode] })
        : refreshPathD({
            id: uid(), type: 'path',
            nodes: [newNode], closed: false,
            fill: 'transparent', stroke: '#4f46e5', strokeWidth: 2,
            opacity: 1, rotation: 0,
          });
      setPathDraft(next);
      // Pen tool also allows click-and-drag to extrude a bezier OUT handle.
      if (activeTool === 'pen') {
        setDrag({ kind: 'pen-handle', nodeIdx: next.nodes.length - 1, anchorX: x, anchorY: y });
      }
      return;
    }

    e.stopPropagation();
    const { x, y } = pt(e);
    setDrag({ kind: 'drawing', x1: x, y1: y, x2: x, y2: y });
  }

  function onSVGMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const p = pt(e);
    // Always track cursor in pen/polygon mode so we can draw the guide line.
    if (activeTool === 'pen' || activeTool === 'polygon') setPathCursor(p);

    if (!drag) return;
    if (drag.kind === 'drawing') {
      setDrag({ ...drag, x2: p.x, y2: p.y });
    } else if (drag.kind === 'moving' || drag.kind === 'resizing' || drag.kind === 'path-node' || drag.kind === 'bezier') {
      setDrag({ ...drag, cx: p.x, cy: p.y });
      // Live alignment guides while moving (not while resizing — that gets a
      // separate snap pass in a future commit).
      if (drag.kind === 'moving') {
        const snap = computeSnap(drag.orig, p.x - drag.sx, p.y - drag.sy, shapes);
        setGuides(snap.guides);
      }
    } else if (drag.kind === 'pen-handle' && pathDraft) {
      // Live-update the OUT handle of the latest node as the user drags.
      const idx = drag.nodeIdx;
      const next = pathDraft.nodes.slice();
      next[idx] = { ...next[idx], cpOutX: p.x, cpOutY: p.y };
      // Symmetric IN handle on the OPPOSITE side gives the smooth-curve UX
      // pen-tool users expect (mirror around the anchor).
      next[idx].cpInX = drag.anchorX - (p.x - drag.anchorX);
      next[idx].cpInY = drag.anchorY - (p.y - drag.anchorY);
      setPathDraft(refreshPathD({ ...pathDraft, nodes: next }));
    }
  }

  function onSVGMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    if (!drag) return;
    const { x, y } = pt(e);
    if (drag.kind === 'pen-handle') {
      // The dragged-out bezier is now baked into pathDraft; nothing else to do.
      setDrag(null);
      return;
    }
    if (drag.kind === 'drawing') {
      commitDraw(drag.x1, drag.y1, x, y);
    } else if (drag.kind === 'moving') {
      let dx = x - drag.sx, dy = y - drag.sy;
      // Smart snap commit — collapse small residual drift into a clean snap.
      const snap = computeSnap(drag.orig, dx, dy, shapes);
      dx += snap.adjustX; dy += snap.adjustY;
      const orig = drag.orig;
      // Phase 4 — clamp so the committed position can't cross the page origin
      // (prevents saving a component off-canvas where it disappears).
      ({ dx, dy } = clampDeltaToOrigin(orig, dx, dy));
      if (orig.type === 'line' || orig.type === 'arrow') {
        const l = orig as DRCELineShape;
        onUpdateShape(orig.id, { x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy } as Partial<DRCEShape>);
      } else if (orig.type === 'path') {
        const p = orig as DRCEPathShape;
        const nodes = p.nodes.map(n => ({
          x: n.x + dx, y: n.y + dy,
          cpInX:  n.cpInX  != null ? n.cpInX  + dx : undefined,
          cpInY:  n.cpInY  != null ? n.cpInY  + dy : undefined,
          cpOutX: n.cpOutX != null ? n.cpOutX + dx : undefined,
          cpOutY: n.cpOutY != null ? n.cpOutY + dy : undefined,
        }));
        onUpdateShape(orig.id, { nodes, d: nodesToPathD(nodes, p.closed) } as Partial<DRCEShape>);
      } else {
        const b = orig as DRCERectShape;
        onUpdateShape(orig.id, { x: b.x + dx, y: b.y + dy } as Partial<DRCEShape>);
      }
    } else if (drag.kind === 'path-node') {
      const dx = x - drag.sx, dy = y - drag.sy;
      const target = drag.orig.nodes[drag.nodeIdx];
      if (target) {
        const updated = setNodeAnchor(drag.orig, drag.nodeIdx, target.x + dx, target.y + dy);
        onUpdateShape(drag.id, { nodes: updated.nodes, d: updated.d } as Partial<DRCEShape>);
      }
    } else if (drag.kind === 'bezier') {
      const dx = x - drag.sx, dy = y - drag.sy;
      const orig = drag.orig;
      const node = orig.nodes[drag.nodeIdx];
      if (node) {
        const handleX = (drag.which === 'in' ? (node.cpInX ?? node.x) : (node.cpOutX ?? node.x)) + dx;
        const handleY = (drag.which === 'in' ? (node.cpInY ?? node.y) : (node.cpOutY ?? node.y)) + dy;
        const nodes = orig.nodes.slice();
        nodes[drag.nodeIdx] = drag.which === 'in'
          ? { ...node, cpInX: handleX, cpInY: handleY,
              ...(drag.symmetric ? { cpOutX: node.x - (handleX - node.x), cpOutY: node.y - (handleY - node.y) } : {}) }
          : { ...node, cpOutX: handleX, cpOutY: handleY,
              ...(drag.symmetric ? { cpInX: node.x - (handleX - node.x), cpInY: node.y - (handleY - node.y) } : {}) };
        onUpdateShape(drag.id, { nodes, d: nodesToPathD(nodes, orig.closed) } as Partial<DRCEShape>);
      }
    } else if (drag.kind === 'resizing') {
      const dx = x - drag.sx, dy = y - drag.sy;
      const orig = drag.orig;
      if (orig.type === 'line' || orig.type === 'arrow') {
        const l = orig as DRCELineShape;
        if (drag.handle === 'p1') onUpdateShape(orig.id, { x1: l.x1 + dx, y1: l.y1 + dy } as Partial<DRCEShape>);
        else onUpdateShape(orig.id, { x2: l.x2 + dx, y2: l.y2 + dy } as Partial<DRCEShape>);
      } else if (orig.type === 'path') {
        const patch = resizePathByHandle(orig as DRCEPathShape, drag.handle as RectHandle, dx, dy);
        onUpdateShape(orig.id, patch as Partial<DRCEShape>);
      } else {
        const { x: bx, y: by, w: bw, h: bh } = orig as DRCERectShape;
        let [nx, ny, nw, nh] = [bx, by, bw, bh];
        switch (drag.handle as RectHandle) {
          case 'nw': nx += dx; ny += dy; nw -= dx; nh -= dy; break;
          case 'n':             ny += dy;           nh -= dy; break;
          case 'ne':            ny += dy; nw += dx; nh -= dy; break;
          case 'e':                       nw += dx;           break;
          case 'se':                      nw += dx; nh += dy; break;
          case 's':                                 nh += dy; break;
          case 'sw': nx += dx;            nw -= dx; nh += dy; break;
          case 'w':  nx += dx;            nw -= dx;           break;
        }
        onUpdateShape(orig.id, { x: nx, y: ny, w: Math.max(nw, 10), h: Math.max(nh, 10) } as Partial<DRCEShape>);
      }
    }
    setDrag(null);
    setGuides([]);
  }

  function commitDraw(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    if (dx < 5 && dy < 5) return; // accidental click

    const id = uid();
    const mx = Math.min(x1, x2), my = Math.min(y1, y2);
    const w = Math.max(Math.abs(x2 - x1), 10), h = Math.max(Math.abs(y2 - y1), 10);

    switch (activeTool) {
      case 'rect':
        onAddShape({ id, type: 'rect', x: mx, y: my, w, h, fill: 'transparent', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, radius: 0, rotation: 0 });
        break;
      case 'ellipse':
        onAddShape({ id, type: 'ellipse', x: mx, y: my, w, h, fill: 'transparent', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, rotation: 0 });
        break;
      case 'arrow':
        onAddShape({ id, type: 'arrow', x1, y1, x2, y2, stroke: '#ef4444', strokeWidth: 2, opacity: 1, dashed: false, endArrow: true, startArrow: false, arrowSize: 8 });
        break;
      case 'line':
        onAddShape({ id, type: 'line', x1, y1, x2, y2, stroke: '#374151', strokeWidth: 2, opacity: 1, dashed: false, endArrow: false, startArrow: false, arrowSize: 8 });
        break;
      case 'text': {
        const shape: DRCETextShape = { id, type: 'text', x: mx, y: my, w: Math.max(w, 90), h: Math.max(h, 30), content: '', fontSize: 14, color: '#1f2937', background: 'transparent', bold: false, italic: false, align: 'left', rotation: 0 };
        onAddShape(shape);
        setTextEditId(id);
        setTextDraft('');
        break;
      }
      case 'image': {
        // P3 — placement box committed; use whichever URL the parent uploaded.
        const src = pendingImageSrc ?? '';
        onAddShape({ id, type: 'image', x: mx, y: my, w: Math.max(w, 40), h: Math.max(h, 40),
          src, fit: 'contain', opacity: 1, rotation: 0 });
        break;
      }
      case 'qrcode': {
        // QR shape — square by default, takes the smaller of (w,h).
        const sz = Math.max(Math.min(w, h), 60);
        onAddShape({ id, type: 'qrcode', x: mx, y: my, w: sz, h: sz,
          value: '', binding: 'meta.verificationUrl',
          fg: '#000', bg: '#fff', level: 'M', includeMargin: false,
          opacity: 1, rotation: 0 });
        break;
      }
      case 'barcode': {
        // Barcode — sized exactly to the drag rect; bars + label fill it
        // edge-to-edge.
        onAddShape({ id, type: 'barcode', x: mx, y: my,
          w: Math.max(w, 80), h: Math.max(h, 32),
          value: '', binding: 'student.admissionNo',
          fg: '#111', bg: '#fff', showLabel: true,
          opacity: 1, rotation: 0 });
        break;
      }
      default:
        if (isPolygonTool(activeTool)) {
          onAddShape({ id, type: activeTool, x: mx, y: my, w, h, fill: 'transparent', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, rotation: 0 } as DRCEShape);
        }
        break;
    }
    onSelectShape(id);
  }

  // P3 — OS drag-and-drop: receive an image file dropped on the canvas,
  // upload it via the parent-supplied handler, then drop a default-sized
  // image shape at the drop coordinates.
  async function onSvgDrop(e: React.DragEvent<SVGSVGElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/') || !onFileDropUpload) return;
    const p = pt(e as unknown as React.MouseEvent);
    const url = await onFileDropUpload(file, p.x, p.y);
    if (!url) return;
    const id = uid();
    onAddShape({ id, type: 'image', x: p.x - 80, y: p.y - 60, w: 160, h: 120,
      src: url, fit: 'contain', opacity: 1, rotation: 0 });
    onSelectShape(id);
  }
  function onSvgDragOver(e: React.DragEvent<SVGSVGElement>) {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  }

  function onShapeMouseDown(e: React.MouseEvent, shape: DRCEShape) {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    if (textEditId && textEditId !== shape.id) commitTextEdit();
    onSelectShape(shape.id);
    const { x, y } = pt(e);
    setDrag({ kind: 'moving', id: shape.id, orig: structuredClone(shape), sx: x, sy: y, cx: x, cy: y });
  }

  function onHandleMouseDown(e: React.MouseEvent, shape: DRCEShape, handle: HandleId) {
    e.stopPropagation();
    const { x, y } = pt(e);
    setDrag({ kind: 'resizing', id: shape.id, orig: structuredClone(shape), handle, sx: x, sy: y, cx: x, cy: y });
  }

  function onShapeDblClick(shape: DRCEShape) {
    if (shape.type === 'text') {
      setTextEditId(shape.id);
      setTextDraft((shape as DRCETextShape).content);
    }
  }

  function commitTextEdit() {
    if (!textEditId) return;
    onUpdateShape(textEditId, { content: textDraft } as Partial<DRCEShape>);
    setTextEditId(null);
  }

  // Find the text shape being edited (for positioning the textarea)
  const editShape = textEditId ? shapes.find(s => s.id === textEditId) as DRCETextShape | undefined : undefined;

  const cursor = activeTool !== 'select' ? 'crosshair' : 'default';
  const draftShape = drag?.kind === 'drawing' ? makeDraft(activeTool, drag.x1, drag.y1, drag.x2, drag.y2) : null;
  const allShapes = shapes.map(s => applyDrag(s, drag));

  // SVG should receive pointer events in draw mode, or when shapes exist (for selection)
  const svgPointerEvents = activeTool !== 'select' || shapes.length > 0 ? 'all' : 'none';

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      {/* SVG layer */}
      <svg
        ref={svgRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', cursor, pointerEvents: svgPointerEvents }}
        onMouseDown={onSVGMouseDown}
        onMouseMove={onSVGMouseMove}
        onMouseUp={onSVGMouseUp}
        onDrop={onSvgDrop}
        onDragOver={onSvgDragOver}
      >
        {/* Transparent background rect for click-to-deselect in select mode */}
        <rect
          data-canvas-bg="1"
          x={-9999} y={-9999} width={99999} height={99999}
          fill="transparent"
          style={{ pointerEvents: activeTool === 'select' ? 'all' : 'none' }}
          onClick={() => { if (activeTool === 'select') onSelectShape(null); }}
        />

        {/* Committed shapes */}
        {allShapes.map(s => {
          const isSelected = s.id === selectedShapeId && s.id !== '__d';
          const handles = isSelected ? getHandles(s) : [];
          return (
            <g key={s.id} data-drce-shape-id={s.id}>
              {renderShapeEl(s, isSelected, false,
                (e) => onShapeMouseDown(e, s),
              )}
              {/* Double-click for text edit */}
              {s.type === 'text' && (
                <rect
                  x={(s as DRCETextShape).x} y={(s as DRCETextShape).y}
                  width={(s as DRCETextShape).w} height={(s as DRCETextShape).h}
                  fill="transparent" style={{ cursor: 'text', pointerEvents: 'all' }}
                  onMouseDown={(e) => onShapeMouseDown(e, s)}
                  onDoubleClick={() => onShapeDblClick(s)}
                />
              )}
              {/* Resize handles */}
              {handles.map(h => (
                <circle
                  key={h.id}
                  cx={h.cx} cy={h.cy} r={5}
                  fill="white" stroke="#4f46e5" strokeWidth={1.5}
                  style={{ cursor: handleCursor(h.id), pointerEvents: 'all' }}
                  onMouseDown={(e) => { e.stopPropagation(); onHandleMouseDown(e, s, h.id); }}
                />
              ))}
              {/* Path node-edit handles (selected path only) */}
              {isSelected && s.type === 'path' && (s as DRCEPathShape).nodes.map((n, idx) => (
                <React.Fragment key={`node-${idx}`}>
                  {/* IN bezier handle arm + pill */}
                  {n.cpInX != null && n.cpInY != null && (
                    <>
                      <line x1={n.x} y1={n.y} x2={n.cpInX} y2={n.cpInY} stroke="#a5b4fc" strokeWidth={1} pointerEvents="none" />
                      <circle
                        cx={n.cpInX} cy={n.cpInY} r={3.5}
                        fill="#fff" stroke="#6366f1" strokeWidth={1.5}
                        style={{ cursor: 'move', pointerEvents: 'all' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const p = pt(e as unknown as React.MouseEvent<SVGSVGElement>);
                          setDrag({
                            kind: 'bezier', id: s.id, orig: s as DRCEPathShape,
                            nodeIdx: idx, which: 'in', symmetric: !e.altKey,
                            sx: p.x, sy: p.y, cx: p.x, cy: p.y,
                          });
                        }}
                      />
                    </>
                  )}
                  {/* OUT bezier handle arm + pill */}
                  {n.cpOutX != null && n.cpOutY != null && (
                    <>
                      <line x1={n.x} y1={n.y} x2={n.cpOutX} y2={n.cpOutY} stroke="#a5b4fc" strokeWidth={1} pointerEvents="none" />
                      <circle
                        cx={n.cpOutX} cy={n.cpOutY} r={3.5}
                        fill="#fff" stroke="#6366f1" strokeWidth={1.5}
                        style={{ cursor: 'move', pointerEvents: 'all' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const p = pt(e as unknown as React.MouseEvent<SVGSVGElement>);
                          setDrag({
                            kind: 'bezier', id: s.id, orig: s as DRCEPathShape,
                            nodeIdx: idx, which: 'out', symmetric: !e.altKey,
                            sx: p.x, sy: p.y, cx: p.x, cy: p.y,
                          });
                        }}
                      />
                    </>
                  )}
                  {/* Anchor (drag = move just this vertex; alt-drag = extrude bezier handles) */}
                  <rect
                    x={n.x - 4} y={n.y - 4} width={8} height={8}
                    fill="#fff" stroke="#10b981" strokeWidth={1.5}
                    style={{ cursor: 'move', pointerEvents: 'all' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const p = pt(e as unknown as React.MouseEvent<SVGSVGElement>);
                      // Alt-drag from an anchor without handles → start extruding a new OUT handle.
                      if (e.altKey && (n.cpOutX == null || n.cpOutY == null)) {
                        setDrag({
                          kind: 'bezier', id: s.id, orig: s as DRCEPathShape,
                          nodeIdx: idx, which: 'out', symmetric: true,
                          sx: p.x, sy: p.y, cx: p.x, cy: p.y,
                        });
                      } else {
                        setDrag({
                          kind: 'path-node', id: s.id, orig: s as DRCEPathShape,
                          nodeIdx: idx, sx: p.x, sy: p.y, cx: p.x, cy: p.y,
                        });
                      }
                    }}
                  />
                </React.Fragment>
              ))}
            </g>
          );
        })}

        {/* Smart alignment guides while moving */}
        {guides.map((g, i) => (
          g.orientation === 'v' ? (
            <line key={`guide-${i}`} x1={g.coord} y1={-9999} x2={g.coord} y2={9999}
              stroke="#ec4899" strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
          ) : (
            <line key={`guide-${i}`} x1={-9999} y1={g.coord} x2={9999} y2={g.coord}
              stroke="#ec4899" strokeWidth={1} strokeDasharray="3 3" pointerEvents="none" />
          )
        ))}

        {/* Draft shape while drawing */}
        {draftShape && renderShapeEl(draftShape, false, true, undefined)}

        {/* Pen / Custom Polygon — in-progress path preview */}
        {pathDraft && (
          <g pointerEvents="none">
            <path
              d={nodesToPathD(pathDraft.nodes, false)}
              fill="none"
              stroke="#4f46e5"
              strokeWidth={2}
              strokeDasharray={pathDraft.nodes.length > 1 ? undefined : '4 3'}
            />
            {/* Live guide from the last anchor to the cursor */}
            {pathCursor && pathDraft.nodes.length > 0 && (() => {
              const last = pathDraft.nodes[pathDraft.nodes.length - 1];
              return (
                <line
                  x1={last.x} y1={last.y} x2={pathCursor.x} y2={pathCursor.y}
                  stroke="#a5b4fc" strokeWidth={1} strokeDasharray="3 3"
                />
              );
            })()}
            {/* Anchor dots */}
            {pathDraft.nodes.map((n, i) => (
              <circle
                key={i}
                cx={n.x} cy={n.y} r={i === 0 ? 5 : 3.5}
                fill={i === 0 ? '#4f46e5' : 'white'}
                stroke="#4f46e5"
                strokeWidth={1.5}
              />
            ))}
            {/* Bezier control handles (pen tool) */}
            {pathDraft.nodes.map((n, i) => {
              const arms: React.ReactNode[] = [];
              if (n.cpInX != null && n.cpInY != null) {
                arms.push(
                  <g key={`in-${i}`}>
                    <line x1={n.x} y1={n.y} x2={n.cpInX} y2={n.cpInY} stroke="#a5b4fc" strokeWidth={1} />
                    <circle cx={n.cpInX} cy={n.cpInY} r={3} fill="#fff" stroke="#a5b4fc" strokeWidth={1.5} />
                  </g>
                );
              }
              if (n.cpOutX != null && n.cpOutY != null) {
                arms.push(
                  <g key={`out-${i}`}>
                    <line x1={n.x} y1={n.y} x2={n.cpOutX} y2={n.cpOutY} stroke="#a5b4fc" strokeWidth={1} />
                    <circle cx={n.cpOutX} cy={n.cpOutY} r={3} fill="#fff" stroke="#a5b4fc" strokeWidth={1.5} />
                  </g>
                );
              }
              return <React.Fragment key={`arms-${i}`}>{arms}</React.Fragment>;
            })}
          </g>
        )}
      </svg>

      {/* Path-draft floating action bar */}
      {pathDraft && (
        <div
          style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', zIndex: 60 }}
          className="flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg px-2 py-1 text-xs"
        >
          <span className="text-gray-500 dark:text-gray-300 px-2 hidden sm:inline">
            {activeTool === 'pen' ? 'Pen' : 'Polygon'} · {pathDraft.nodes.length} node{pathDraft.nodes.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => commitDraft({ closed: false })}
            disabled={pathDraft.nodes.length < 2}
            className="px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
            title="Finish as an open path (Enter)"
          >
            Finish
          </button>
          <button
            type="button"
            onClick={() => commitDraft({ closed: true })}
            disabled={pathDraft.nodes.length < 3}
            className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            title="Close the path back to the first node and finish"
          >
            Close & finish
          </button>
          <button
            type="button"
            onClick={() => { setPathDraft(null); setPathCursor(null); }}
            className="px-2 py-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
            title="Cancel (Escape)"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Floating textarea for text shape editing */}
      {editShape && (
        <textarea
          ref={textareaRef}
          value={textDraft}
          onChange={e => setTextDraft(e.target.value)}
          onBlur={commitTextEdit}
          onKeyDown={e => { if (e.key === 'Escape') { setTextEditId(null); } }}
          style={{
            position: 'absolute',
            left: editShape.x,
            top: editShape.y,
            width: editShape.w,
            minHeight: editShape.h,
            padding: '2px 4px',
            fontSize: editShape.fontSize,
            color: editShape.color,
            fontWeight: editShape.bold ? 'bold' : 'normal',
            fontStyle: editShape.italic ? 'italic' : 'normal',
            textAlign: editShape.align,
            background: editShape.background === 'transparent' ? 'rgba(255,255,255,0.9)' : editShape.background,
            border: '2px solid #4f46e5',
            borderRadius: 2,
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            pointerEvents: 'all',
            zIndex: 20,
          }}
        />
      )}
    </div>
  );
}
