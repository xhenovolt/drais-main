"use client";
/**
 * SelectionLayer — DOM overlay that gives any selected SECTION the same
 * drag + 8-handle resize affordance shapes already enjoy.
 *
 * Free positioning is opt-in: until the user drags or resizes, sections
 * render in document flow exactly as before. The first drag promotes the
 * section to `style.position = 'absolute'` with explicit left/top (and on
 * resize, width/height). The renderer's getSectionWrapperStyle already
 * honours those fields, so no schema or render-pipeline change is required.
 *
 * Print determinism is preserved: a section with no positional override
 * still flows; a positioned section persists those coords in style.*.
 */
import React, { useEffect, useRef, useState } from 'react';
import { selection, useSelection } from './selectionStore';
import type { DRCEDocument, DRCEMutation, DRCESection } from '@/lib/drce/schema';

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface Props {
  document:     DRCEDocument;
  onMutate:     (m: DRCEMutation) => void;
  canvasRef:    React.RefObject<HTMLDivElement | null>;
  previewScale: number;
}

interface Rect { left: number; top: number; width: number; height: number }

function findSectionEl(canvas: HTMLElement, id: string): HTMLElement | null {
  return canvas.querySelector<HTMLElement>(`[data-drce-section-id="${id}"]`);
}
function findSectionDeep(arr: DRCESection[], id: string): DRCESection | null {
  for (const s of arr) {
    if (s.id === id) return s;
    if (s.type === 'container') {
      const hit = findSectionDeep((s as { children?: DRCESection[] }).children ?? [], id);
      if (hit) return hit;
    }
  }
  return null;
}

export function SelectionLayer({ document: doc, onMutate, canvasRef, previewScale }: Props) {
  const sel = useSelection();
  const [rect, setRect] = useState<Rect | null>(null);
  // Drag bookkeeping; held in a ref so move/up handlers always read fresh state.
  const dragRef = useRef<{
    mode: 'move' | HandleId;
    sectionId: string;
    startX: number;          // page coords
    startY: number;
    startRect: Rect;         // canvas-relative
  } | null>(null);

  useEffect(() => {
    if (sel.primary?.kind !== 'section' || !canvasRef.current) { setRect(null); return; }
    const canvas = canvasRef.current;

    function measure() {
      if (!sel.primary || !canvas) { setRect(null); return; }
      const el = findSectionEl(canvas, sel.primary.id);
      if (!el) { setRect(null); return; }
      const r  = el.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      setRect({ left: r.left - cr.left, top: r.top - cr.top, width: r.width, height: r.height });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const raf = requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
    };
  }, [sel.primary, canvasRef, doc]);

  // Global mousemove/up while dragging to support drag-outside-window.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      // Canvas is CSS-scaled by previewScale; convert page-px deltas back to
      // the document's authored px coordinate space.
      const dx = (e.pageX - d.startX) / previewScale;
      const dy = (e.pageY - d.startY) / previewScale;

      const sec = findSectionDeep(doc.sections, d.sectionId);
      if (!sec) return;
      const style = ((sec as { style?: Record<string, unknown> }).style ?? {}) as Record<string, unknown>;
      const curLeft   = numOr(style.left,   d.startRect.left   / previewScale);
      const curTop    = numOr(style.top,    d.startRect.top    / previewScale);
      const curWidth  = numOr(style.width,  d.startRect.width  / previewScale);
      const curHeight = numOr(style.height, d.startRect.height / previewScale);

      if (d.mode === 'move') {
        // Promote to absolute + update left/top.
        emit(d.sectionId, [
          ['position', 'absolute'],
          ['left', round(curLeft + dx)],
          ['top',  round(curTop  + dy)],
        ]);
        return;
      }
      // Resize from a handle.
      let nx = curLeft, ny = curTop, nw = curWidth, nh = curHeight;
      switch (d.mode) {
        case 'nw': nx += dx; ny += dy; nw -= dx; nh -= dy; break;
        case 'n':             ny += dy;           nh -= dy; break;
        case 'ne':            ny += dy; nw += dx; nh -= dy; break;
        case 'e':                       nw += dx;           break;
        case 'se':                      nw += dx; nh += dy; break;
        case 's':                                 nh += dy; break;
        case 'sw': nx += dx;            nw -= dx; nh += dy; break;
        case 'w':  nx += dx;            nw -= dx;           break;
      }
      nw = Math.max(40, nw);
      nh = Math.max(20, nh);
      emit(d.sectionId, [
        ['position', 'absolute'],
        ['left', round(nx)], ['top', round(ny)],
        ['width', round(nw)], ['height', round(nh)],
      ]);
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // emit closes over onMutate; capture once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, previewScale]);

  function emit(sectionId: string, patches: [string, unknown][]) {
    for (const [path, value] of patches) {
      onMutate({ type: 'SET_SECTION_STYLE', sectionId, path, value });
    }
  }

  if (!rect || sel.primary?.kind !== 'section') return null;

  const handleHit = (mode: 'move' | HandleId) =>
    (e: React.MouseEvent) => {
      if (!sel.primary || sel.primary.kind !== 'section') return;
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        mode, sectionId: sel.primary.id,
        startX: e.pageX, startY: e.pageY,
        startRect: rect,
      };
    };

  const H = 8;  // handle box size in screen px (pre-scale)
  const handles: { id: HandleId; cx: number; cy: number; cursor: string }[] = [
    { id: 'nw', cx: 0,            cy: 0,              cursor: 'nwse-resize' },
    { id: 'n',  cx: rect.width/2, cy: 0,              cursor: 'ns-resize'   },
    { id: 'ne', cx: rect.width,   cy: 0,              cursor: 'nesw-resize' },
    { id: 'e',  cx: rect.width,   cy: rect.height/2,  cursor: 'ew-resize'   },
    { id: 'se', cx: rect.width,   cy: rect.height,    cursor: 'nwse-resize' },
    { id: 's',  cx: rect.width/2, cy: rect.height,    cursor: 'ns-resize'   },
    { id: 'sw', cx: 0,            cy: rect.height,    cursor: 'nesw-resize' },
    { id: 'w',  cx: 0,            cy: rect.height/2,  cursor: 'ew-resize'   },
  ];

  return (
    <div
      style={{
        position: 'absolute', zIndex: 65, pointerEvents: 'none',
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      }}
    >
      {/* Bounding box outline + move handle (the whole rect) */}
      <div
        onMouseDown={handleHit('move')}
        style={{
          position: 'absolute', inset: 0,
          border: '1.5px solid #6366f1',
          background: 'transparent',
          cursor: 'move',
          pointerEvents: 'auto',
        }}
        title="Drag to position section"
      />
      {handles.map(h => (
        <div
          key={h.id}
          onMouseDown={handleHit(h.id)}
          style={{
            position: 'absolute',
            left: h.cx - H/2, top: h.cy - H/2,
            width: H, height: H,
            background: '#fff',
            border: '1.5px solid #6366f1',
            borderRadius: 2,
            cursor: h.cursor,
            pointerEvents: 'auto',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
          }}
        />
      ))}
    </div>
  );
}

// ── utils ──────────────────────────────────────────────────────────────────
function numOr(v: unknown, fb: number): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fb;
  }
  return fb;
}
function round(n: number): number { return Math.round(n * 10) / 10; }
