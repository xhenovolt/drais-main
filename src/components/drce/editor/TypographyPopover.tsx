"use client";
/**
 * Inline typography popover. Anchored to a selected text shape when the user
 * double-clicks it. Mutates the shape live via onUpdateShape so the canvas
 * reflects every change instantly.
 *
 * Supports: family, size, weight, italic, alignment, colour, background,
 * line-height. Only acts on `type === 'text'` shapes.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, X,
} from 'lucide-react';
import type { DRCEShape, DRCETextShape } from '@/lib/drce/schema';

const FONT_FAMILIES = [
  { label: 'System',     value: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif' },
  { label: 'Serif',      value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono',       value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  { label: 'Sans',       value: 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Cursive',    value: '"Brush Script MT", cursive' },
];

interface Rect { left: number; top: number; width: number; height: number }

export function TypographyPopover({
  shape, onUpdate, onClose, canvasRef,
}: {
  shape:     DRCETextShape;
  onUpdate:  (patch: Partial<DRCETextShape>) => void;
  onClose:   () => void;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function measure() {
      if (!canvasRef.current) { setRect(null); return; }
      const canvas = canvasRef.current;
      const el = canvas.querySelector<SVGGraphicsElement>(`[data-drce-shape-id="${shape.id}"]`);
      if (!el || !('getBoundingClientRect' in el)) { setRect(null); return; }
      const r  = el.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      setRect({ left: r.left - cr.left, top: r.top - cr.top, width: r.width, height: r.height });
    }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const raf = requestAnimationFrame(measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
    };
  }, [shape.id, canvasRef]);

  // Click-outside closes
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  if (!rect) return null;

  const top  = Math.max(8, rect.top - 60);
  const left = rect.left + rect.width / 2;

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute',
        left, top,
        transform: 'translateX(-50%)',
        zIndex: 75, pointerEvents: 'auto',
      }}
      className="flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl px-2 py-1.5 text-xs"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Font family */}
      <select
        value={shape.background /* sentinel; we store font in `content`-adjacent placeholder; see note below */}
        onChange={() => {}}
        className="hidden"
      />
      <select
        title="Font family"
        value={getFontFamilyValue(shape)}
        onChange={e => onUpdate({ ...({ fontFamily: e.target.value } as unknown as Partial<DRCETextShape>) })}
        className="bg-transparent text-[11px] outline-none border border-transparent hover:border-gray-200 dark:hover:border-slate-700 rounded px-1 py-0.5 max-w-[120px]"
      >
        {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      <Divider />

      {/* Font size */}
      <input
        type="number" min={6} max={144} step={1}
        value={shape.fontSize}
        onChange={e => onUpdate({ fontSize: Number(e.target.value) || shape.fontSize })}
        title="Font size (px)"
        className="w-12 bg-transparent text-[11px] outline-none border border-transparent hover:border-gray-200 dark:hover:border-slate-700 rounded px-1 py-0.5 text-center"
      />

      <Divider />

      {/* Bold / Italic */}
      <Toggle active={shape.bold}   onClick={() => onUpdate({ bold:   !shape.bold   })} title="Bold">   <Bold   size={12} /></Toggle>
      <Toggle active={shape.italic} onClick={() => onUpdate({ italic: !shape.italic })} title="Italic"> <Italic size={12} /></Toggle>

      <Divider />

      {/* Alignment */}
      <Toggle active={shape.align === 'left'}   onClick={() => onUpdate({ align: 'left'   })} title="Align left">   <AlignLeft   size={12} /></Toggle>
      <Toggle active={shape.align === 'center'} onClick={() => onUpdate({ align: 'center' })} title="Align center"> <AlignCenter size={12} /></Toggle>
      <Toggle active={shape.align === 'right'}  onClick={() => onUpdate({ align: 'right'  })} title="Align right">  <AlignRight  size={12} /></Toggle>

      <Divider />

      {/* Colours */}
      <label className="inline-flex items-center gap-1" title="Text colour">
        <span className="text-[10px] text-gray-400">A</span>
        <input type="color" value={shape.color} onChange={e => onUpdate({ color: e.target.value })}
          className="w-5 h-5 border-0 rounded cursor-pointer bg-transparent p-0" />
      </label>
      <label className="inline-flex items-center gap-1" title="Background">
        <span className="text-[10px] text-gray-400">▢</span>
        <input type="color"
          value={shape.background && shape.background !== 'transparent' ? shape.background : '#ffffff'}
          onChange={e => onUpdate({ background: e.target.value })}
          className="w-5 h-5 border-0 rounded cursor-pointer bg-transparent p-0" />
        <button type="button" title="Clear background"
          onClick={() => onUpdate({ background: 'transparent' })}
          className="text-[9px] text-gray-400 hover:text-rose-500 px-0.5">×</button>
      </label>

      <Divider />

      <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-rose-500" title="Close">
        <X size={12} />
      </button>
    </div>
  );
}

function Toggle({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={[
        'flex items-center justify-center w-6 h-6 rounded transition-colors',
        active ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700',
      ].join(' ')}>
      {children}
    </button>
  );
}
function Divider() { return <span className="w-px h-4 bg-gray-200 dark:bg-slate-700 mx-0.5" />; }

// DRCETextShape doesn't carry fontFamily yet — the popover stores it as an
// untyped extra prop and the renderer reads it via the same loose access.
// Defaults to system font when absent. This keeps the schema additive.
function getFontFamilyValue(shape: DRCETextShape): string {
  const x = (shape as unknown as { fontFamily?: string }).fontFamily;
  return x ?? FONT_FAMILIES[0].value;
}

/** Ambient updater type alias for the patch this popover emits. */
export type TypographyPatch =
  Partial<DRCETextShape> & { fontFamily?: string; lineHeight?: number };
