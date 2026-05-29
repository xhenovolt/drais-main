// src/components/drce/editor/DrawingToolbar.tsx
// Compact tool strip + categorized shape fly-out.
// Replaces the wrap-prone label row ("Arro w", "Rec t") with a clean Select
// toggle, a single "Shapes ▾" button that opens a grouped panel, plus the
// always-visible Text tool and Delete affordance.
'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { DrawTool } from '../canvas/ShapeCanvas';
import {
  MousePointer2, MoveUpRight, Minus, Square, Circle, Type, Trash2,
  Triangle, Diamond, Star, Pentagon, Hexagon, Shapes, ChevronDown,
  Search, PenTool, Spline, Sparkles, Image as ImageIcon, Loader2,
} from 'lucide-react';

// ── Categorized shape catalogue ────────────────────────────────────────────

type Group = 'basic' | 'polygon_star' | 'banner_badge' | 'custom_vector';

interface ShapeEntry {
  id:        DrawTool;
  label:     string;
  shortcut?: string;
  icon:      React.ReactNode;
  group:     Group;
  keywords?: string[];
  /** Marked when the tool is registered but its drawing UX hasn't landed yet. */
  preview?:  boolean;
}

const ENTRIES: ShapeEntry[] = [
  // Basic geometrics
  { id: 'line',     label: 'Line',      shortcut: 'L', icon: <Minus       size={16} />, group: 'basic', keywords: ['stroke', 'rule'] },
  { id: 'arrow',    label: 'Arrow',     shortcut: 'A', icon: <MoveUpRight size={16} />, group: 'basic', keywords: ['pointer'] },
  { id: 'rect',     label: 'Rectangle', shortcut: 'R', icon: <Square      size={16} />, group: 'basic', keywords: ['square', 'box'] },
  { id: 'ellipse',  label: 'Circle',    shortcut: 'E', icon: <Circle      size={16} />, group: 'basic', keywords: ['oval', 'ellipse'] },
  { id: 'triangle', label: 'Triangle',  shortcut: '3', icon: <Triangle    size={16} />, group: 'basic' },

  // Polygons & stars
  { id: 'diamond',  label: 'Diamond',   shortcut: 'D', icon: <Diamond  size={16} />, group: 'polygon_star', keywords: ['rhombus'] },
  { id: 'pentagon', label: 'Pentagon',  shortcut: '5', icon: <Pentagon size={16} />, group: 'polygon_star' },
  { id: 'hexagon',  label: 'Hexagon',   shortcut: '6', icon: <Hexagon  size={16} />, group: 'polygon_star' },
  { id: 'star',     label: 'Star',      shortcut: '*', icon: <Star     size={16} />, group: 'polygon_star', keywords: ['rating'] },

  // Banners & badges (real ribbon/badge/wave primitives land alongside the path engine).
  { id: 'rect',     label: 'Ribbon',    icon: <Sparkles size={16} />, group: 'banner_badge', preview: true, keywords: ['banner', 'header'] },

  // Custom vectors (drawing UX lands in commit 2)
  { id: 'pen',      label: 'Pen Tool',          icon: <PenTool size={16} />, group: 'custom_vector', preview: true, keywords: ['bezier', 'path', 'vector'] },
  { id: 'polygon',  label: 'Custom Polygon',    icon: <Spline  size={16} />, group: 'custom_vector', preview: true, keywords: ['path', 'lasso'] },
];

const GROUPS: { id: Group; label: string }[] = [
  { id: 'basic',          label: 'Basic geometrics' },
  { id: 'polygon_star',   label: 'Polygons & stars' },
  { id: 'banner_badge',   label: 'Banners & badges' },
  { id: 'custom_vector',  label: 'Custom vectors' },
];

interface Props {
  /** P3 — invoked after a file is picked + uploaded; parent inserts the image
   *  shape with the returned URL. */
  onAddImage?:      (url: string) => void;
  activeTool:       DrawTool;
  selectedShapeId:  string | null;
  onToolChange:     (t: DrawTool) => void;
  onDeleteShape:    () => void;
}

export function DrawingToolbar({ activeTool, selectedShapeId, onToolChange, onDeleteShape, onAddImage }: Props) {
  const [shapesOpen, setShapesOpen] = useState(false);
  const [filter, setFilter]         = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleImagePick(file: File) {
    if (!onAddImage) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'drais/drce-images');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data?.success && data.url) onAddImage(data.url);
    } finally {
      setUploading(false);
    }
  }

  // Click-outside close
  useEffect(() => {
    if (!shapesOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) setShapesOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [shapesOpen]);

  const filtered = ENTRIES.filter(e => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return e.label.toLowerCase().includes(q)
      || e.id.toLowerCase().includes(q)
      || (e.keywords ?? []).some(k => k.includes(q));
  });

  const activeIsShape = !['select', 'text'].includes(activeTool);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-white dark:bg-slate-900 flex-shrink-0 select-none">
      <ToolPill
        active={activeTool === 'select'}
        label="Select"
        shortcut="V"
        onClick={() => onToolChange('select')}
        icon={<MousePointer2 size={15} />}
      />

      <div className="w-px h-5 bg-gray-200 dark:bg-slate-600 mx-0.5" />

      {/* Shapes fly-out */}
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setShapesOpen(v => !v)}
          title="Open shape library"
          className={[
            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors',
            activeIsShape || shapesOpen
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700',
          ].join(' ')}
        >
          <Shapes size={15} />
          <span>Shapes</span>
          <ChevronDown size={12} className={shapesOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>

        {shapesOpen && (
          <div
            className="absolute top-9 left-0 z-50 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Shape library"
          >
            <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
              <Search size={13} className="text-gray-400" />
              <input
                autoFocus
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter shapes…"
                className="flex-1 bg-transparent text-xs outline-none placeholder-gray-400 text-gray-700 dark:text-gray-200"
              />
              {filter && (
                <button onClick={() => setFilter('')} className="text-[10px] text-gray-400 hover:text-gray-600">clear</button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3">
              {GROUPS.map(g => {
                const items = filtered.filter(e => e.group === g.id);
                if (!items.length) return null;
                return (
                  <div key={g.id}>
                    <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{g.label}</div>
                    <div className="grid grid-cols-3 gap-1">
                      {items.map((e, i) => (
                        <button
                          key={`${e.group}-${e.id}-${i}`}
                          type="button"
                          onClick={() => { onToolChange(e.id); setShapesOpen(false); setFilter(''); }}
                          title={e.preview ? `${e.label} — preview` : e.label + (e.shortcut ? ` (${e.shortcut})` : '')}
                          className={[
                            'relative flex flex-col items-center justify-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-colors',
                            activeTool === e.id && !e.preview
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                              : 'border-transparent hover:border-gray-200 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300',
                          ].join(' ')}
                        >
                          {e.icon}
                          <span className="truncate w-full text-center px-1">{e.label}</span>
                          {e.preview && (
                            <span className="absolute top-0.5 right-0.5 text-[8px] uppercase font-bold bg-amber-400 text-amber-900 rounded-sm px-1 py-px leading-none">soon</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-6">No shapes match &quot;{filter}&quot;.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-gray-200 dark:bg-slate-600 mx-0.5" />

      <ToolPill
        active={activeTool === 'text'}
        label="Text"
        shortcut="T"
        onClick={() => onToolChange('text')}
        icon={<Type size={15} />}
      />

      {/* P3 — image: file picker → upload → place. */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleImagePick(f); e.target.value = ''; }}
      />
      <ToolPill
        active={false}
        label={uploading ? 'Uploading…' : 'Image'}
        onClick={() => !uploading && imageInputRef.current?.click()}
        icon={uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
      />

      {selectedShapeId && (
        <>
          <div className="w-px h-5 bg-gray-200 dark:bg-slate-600 mx-0.5" />
          <button
            type="button"
            title="Delete shape (Delete)"
            onClick={onDeleteShape}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </>
      )}

      <div className="flex-1" />

      <span className="text-[10px] text-gray-400 hidden md:inline-flex items-center gap-1">
        {activeTool === 'select'
          ? 'Click to select · Double-click text to edit'
          : (activeTool === 'pen' || activeTool === 'polygon')
            ? <><Sparkles size={11} className="text-amber-500" /> {activeTool === 'pen' ? 'Pen Tool — drawing lands in the next update.' : 'Custom Polygon — drawing lands in the next update.'}</>
            : `Click and drag to draw · ${activeTool}`}
      </span>
    </div>
  );
}

function ToolPill({ active, label, shortcut, onClick, icon }: {
  active:    boolean;
  label:     string;
  shortcut?: string;
  onClick:   () => void;
  icon:      React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={[
        'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors',
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700',
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
