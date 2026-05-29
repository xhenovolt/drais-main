"use client";
/**
 * Floating contextual toolbar for the selected element. Anchors above the
 * element's DOM rect (sections via `data-drce-section-id`, shapes via the
 * SVG element's bbox). Holds the common verbs that used to live only in
 * the right-hand panel:
 *
 *   duplicate · delete · bring forward · send backward · copy · paste
 *
 * Re-positions on selection change, on document mutation (which may move
 * the element), and on window resize/scroll.
 */
import React, { useEffect, useState } from 'react';
import {
  Copy, Clipboard, Trash2, ArrowUp, ArrowDown, MoveDiagonal2,
} from 'lucide-react';
import { useSelection, selection } from './selectionStore';
import type { DRCEDocument, DRCEMutation, DRCESection, DRCEShape } from '@/lib/drce/schema';

interface Props {
  document: DRCEDocument;
  onMutate: (m: DRCEMutation) => void;
  /** The canvas DOM container — anchor coordinates are computed relative to this. */
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

interface Rect { left: number; top: number; width: number; height: number }

function findSectionEl(canvas: HTMLElement, id: string): HTMLElement | null {
  return canvas.querySelector<HTMLElement>(`[data-drce-section-id="${id}"]`);
}
function findShapeEl(canvas: HTMLElement, id: string): SVGGraphicsElement | null {
  return canvas.querySelector<SVGGraphicsElement>(`[data-drce-shape-id="${id}"]`);
}

export function ContextualToolbar({ document: doc, onMutate, canvasRef }: Props) {
  const sel = useSelection();
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!sel.primary || !canvasRef.current) { setRect(null); return; }
    const canvas = canvasRef.current;

    function measure() {
      if (!sel.primary || !canvas) { setRect(null); return; }
      const cr = canvas.getBoundingClientRect();
      let r: DOMRect | null = null;
      if (sel.primary.kind === 'section') {
        const el = findSectionEl(canvas, sel.primary.id);
        if (el) r = el.getBoundingClientRect();
      } else {
        const el = findShapeEl(canvas, sel.primary.id);
        if (el && 'getBoundingClientRect' in el) r = el.getBoundingClientRect();
      }
      if (!r) { setRect(null); return; }
      setRect({
        left:   r.left - cr.left,
        top:    r.top  - cr.top,
        width:  r.width,
        height: r.height,
      });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    // Re-measure after one frame so layout settles when the doc mutates.
    const raf = requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
    };
  }, [sel.primary, canvasRef, doc]);

  if (!sel.primary || !rect) return null;

  // Helpers operating on the primary selection.
  function duplicate() {
    if (!sel.primary) return;
    if (sel.primary.kind === 'section') {
      const s = findSectionDeep(doc.sections, sel.primary.id);
      if (!s) return;
      const clone = deepClone(s);
      clone.id = `${s.type}-${Date.now()}`;
      onMutate({ type: 'ADD_SECTION', section: clone, afterId: s.id });
      selection.select('section', clone.id);
    } else {
      const sh = doc.shapes?.find(x => x.id === sel.primary!.id);
      if (!sh) return;
      const clone = deepClone(sh);
      clone.id = 'sh_' + Math.random().toString(36).slice(2, 9);
      // Nudge so it doesn't overlap exactly.
      const offset = 20;
      if ('x' in clone) (clone as { x: number }).x += offset;
      if ('y' in clone) (clone as { y: number }).y += offset;
      if ('x1' in clone) { (clone as { x1: number }).x1 += offset; (clone as { x2: number }).x2 += offset; }
      if ('y1' in clone) { (clone as { y1: number }).y1 += offset; (clone as { y2: number }).y2 += offset; }
      onMutate({ type: 'ADD_SHAPE', shape: clone });
      selection.select('shape', clone.id);
    }
  }

  function del() {
    if (!sel.primary) return;
    if (sel.primary.kind === 'section') {
      onMutate({ type: 'DELETE_SECTION', sectionId: sel.primary.id });
    } else {
      onMutate({ type: 'DELETE_SHAPE', id: sel.primary.id });
    }
    selection.clear();
  }

  function copy() {
    const sections = [...sel.sectionIds]
      .map(id => findSectionDeep(doc.sections, id))
      .filter((x): x is DRCESection => !!x);
    const shapes = [...sel.shapeIds]
      .map(id => doc.shapes?.find(s => s.id === id))
      .filter((x): x is DRCEShape => !!x);
    if (sections.length || shapes.length) selection.copy(sections, shapes);
  }

  function paste() {
    const cb = selection.getClipboard();
    if (!cb) return;
    let lastId: string | null = null;
    cb.sections.forEach(s => {
      const clone = deepClone(s);
      clone.id = `${s.type}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      onMutate({ type: 'ADD_SECTION', section: clone, afterId: null });
      lastId = clone.id;
    });
    cb.shapes.forEach(sh => {
      const clone = deepClone(sh);
      clone.id = 'sh_' + Math.random().toString(36).slice(2, 9);
      if ('x' in clone) (clone as { x: number }).x += 20;
      if ('y' in clone) (clone as { y: number }).y += 20;
      onMutate({ type: 'ADD_SHAPE', shape: clone });
    });
    if (lastId) selection.select('section', lastId);
  }

  function reorder(direction: 'up' | 'down') {
    if (!sel.primary || sel.primary.kind !== 'section') return;
    // Move ±1 in the top-level sections array via REORDER_SECTIONS.
    const ids = doc.sections.map(s => s.id);
    const i = ids.indexOf(sel.primary.id);
    if (i < 0) return;
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    const reordered = ids.slice();
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    onMutate({ type: 'REORDER_SECTIONS', ids: reordered });
  }

  // Position above the element, falling to below if there's no room above.
  const padding = 8;
  const toolbarH = 36;
  const tooLowAbove = rect.top < toolbarH + padding;
  const top  = tooLowAbove ? rect.top + rect.height + padding : rect.top - toolbarH - padding;
  const left = rect.left + rect.width / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left, top,
        transform: 'translateX(-50%)',
        zIndex: 70,
        pointerEvents: 'auto',
      }}
      className="flex items-center gap-0.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl px-1 py-1 text-xs select-none"
      onMouseDown={e => e.stopPropagation()}
    >
      <ToolBtn icon={<MoveDiagonal2 size={13} />} title="Duplicate (Ctrl+D)"      onClick={duplicate} />
      <ToolBtn icon={<Copy          size={13} />} title="Copy (Ctrl+C)"           onClick={copy} />
      <ToolBtn icon={<Clipboard     size={13} />} title="Paste (Ctrl+V)"          onClick={paste} disabled={!selection.hasClipboard()} />
      {sel.primary.kind === 'section' && (
        <>
          <Divider />
          <ToolBtn icon={<ArrowUp   size={13} />} title="Move up"                 onClick={() => reorder('up')} />
          <ToolBtn icon={<ArrowDown size={13} />} title="Move down"               onClick={() => reorder('down')} />
        </>
      )}
      <Divider />
      <ToolBtn icon={<Trash2 size={13} />} title="Delete (Del)" danger onClick={del} />
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function ToolBtn({ icon, title, onClick, danger, disabled }: {
  icon: React.ReactNode; title: string; onClick: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex items-center justify-center w-7 h-7 rounded-md transition-colors disabled:opacity-30',
        danger
          ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700',
      ].join(' ')}
    >
      {icon}
    </button>
  );
}
function Divider() { return <span className="w-px h-4 bg-gray-200 dark:bg-slate-700 mx-0.5" />; }

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

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
