/**
 * Pure helpers for the DRCEPathShape vector type (Pen Tool + Custom Polygon).
 *
 * No React, no DOM, no I/O — safe to import from /lib, tests, and SSR.
 */
import type { DRCEPathNode, DRCEPathShape } from './schema';

/** Serialise nodes to an SVG `d` attribute. Bezier handles are absolute. */
export function nodesToPathD(nodes: DRCEPathNode[], closed: boolean): string {
  if (!nodes.length) return '';
  const parts: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (i === 0) {
      parts.push(`M ${n.x.toFixed(2)} ${n.y.toFixed(2)}`);
      continue;
    }
    const prev = nodes[i - 1];
    const outHandle = (prev.cpOutX != null && prev.cpOutY != null);
    const inHandle  = (n.cpInX  != null && n.cpInY  != null);
    if (outHandle || inHandle) {
      const c1x = outHandle ? prev.cpOutX! : prev.x;
      const c1y = outHandle ? prev.cpOutY! : prev.y;
      const c2x = inHandle  ? n.cpInX!     : n.x;
      const c2y = inHandle  ? n.cpInY!     : n.y;
      parts.push(`C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${n.x.toFixed(2)} ${n.y.toFixed(2)}`);
    } else {
      parts.push(`L ${n.x.toFixed(2)} ${n.y.toFixed(2)}`);
    }
  }
  if (closed && nodes.length > 1) parts.push('Z');
  return parts.join(' ');
}

/** Recompute the cached `d` field after mutating nodes. */
export function refreshPathD(shape: DRCEPathShape): DRCEPathShape {
  return { ...shape, d: nodesToPathD(shape.nodes, shape.closed) };
}

/** Axis-aligned bounding box that covers anchors AND control handles. */
export function pathBounds(shape: DRCEPathShape): { x: number; y: number; w: number; h: number } {
  if (!shape.nodes.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const consume = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const n of shape.nodes) {
    consume(n.x, n.y);
    if (n.cpInX  != null && n.cpInY  != null) consume(n.cpInX,  n.cpInY);
    if (n.cpOutX != null && n.cpOutY != null) consume(n.cpOutX, n.cpOutY);
  }
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    w: Math.max(1, Math.ceil(maxX - minX)),
    h: Math.max(1, Math.ceil(maxY - minY)),
  };
}

/** Translate every node + handle by (dx,dy). */
export function translatePath(shape: DRCEPathShape, dx: number, dy: number): DRCEPathShape {
  const next = shape.nodes.map(n => ({
    x: n.x + dx,
    y: n.y + dy,
    cpInX:  n.cpInX  != null ? n.cpInX  + dx : undefined,
    cpInY:  n.cpInY  != null ? n.cpInY  + dy : undefined,
    cpOutX: n.cpOutX != null ? n.cpOutX + dx : undefined,
    cpOutY: n.cpOutY != null ? n.cpOutY + dy : undefined,
  }));
  return refreshPathD({ ...shape, nodes: next });
}

/** Update one node's anchor (drags handles with it for visual continuity). */
export function setNodeAnchor(shape: DRCEPathShape, idx: number, x: number, y: number): DRCEPathShape {
  if (idx < 0 || idx >= shape.nodes.length) return shape;
  const n  = shape.nodes[idx];
  const dx = x - n.x, dy = y - n.y;
  const next = shape.nodes.slice();
  next[idx] = {
    x, y,
    cpInX:  n.cpInX  != null ? n.cpInX  + dx : undefined,
    cpInY:  n.cpInY  != null ? n.cpInY  + dy : undefined,
    cpOutX: n.cpOutX != null ? n.cpOutX + dx : undefined,
    cpOutY: n.cpOutY != null ? n.cpOutY + dy : undefined,
  };
  return refreshPathD({ ...shape, nodes: next });
}

/** Set / clear a node's IN or OUT bezier control handle (absolute coords). */
export function setNodeHandle(
  shape: DRCEPathShape, idx: number, which: 'in' | 'out',
  x: number | null, y: number | null,
): DRCEPathShape {
  if (idx < 0 || idx >= shape.nodes.length) return shape;
  const n = shape.nodes[idx];
  const patched: DRCEPathNode = which === 'in'
    ? { ...n, cpInX:  x ?? undefined, cpInY:  y ?? undefined }
    : { ...n, cpOutX: x ?? undefined, cpOutY: y ?? undefined };
  const next = shape.nodes.slice();
  next[idx] = patched;
  return refreshPathD({ ...shape, nodes: next });
}
