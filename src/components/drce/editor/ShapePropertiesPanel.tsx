// src/components/drce/editor/ShapePropertiesPanel.tsx
// Properties panel shown in the right sidebar when a canvas shape is selected.
'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import type {
  DRCEShape, DRCERectShape, DRCEEllipseShape, DRCELineShape, DRCETextShape,
  DRCEImageShape,
} from '@/lib/drce/schema';
import { useAvailableBindings } from '@/components/drce/hooks/useAvailableBindings';

interface Props {
  shape: DRCEShape | null;
  onUpdate: (updates: Partial<DRCEShape>) => void;
  onDelete: () => void;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <label className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 w-20">{label}</label>
      <div className="flex-1 flex items-center gap-1">{children}</div>
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative flex items-center gap-1">
      <div
        style={{ width: 20, height: 20, borderRadius: 3, background: value === 'transparent' ? 'transparent' : value, border: '1.5px solid rgba(0,0,0,0.15)' }}
        className="flex-shrink-0"
      />
      <input
        type="color"
        value={value === 'transparent' ? '#ffffff' : value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-6 cursor-pointer border rounded text-xs"
        title={value}
      />
    </div>
  );
}

function NumberInput({ value, min, max, step, onChange }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={min} max={max} step={step ?? 1}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full border rounded px-1.5 py-0.5 text-xs dark:bg-slate-800 dark:border-slate-600"
    />
  );
}

function SelectInput({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full border rounded px-1.5 py-0.5 text-xs dark:bg-slate-800 dark:border-slate-600"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Per-type panels ──────────────────────────────────────────────────────────

function BoxPanel({ shape, onUpdate }: { shape: DRCERectShape | DRCEEllipseShape; onUpdate: (u: Partial<DRCEShape>) => void }) {
  return (
    <>
      <Row label="Fill">
        <ColorInput value={shape.fill} onChange={v => onUpdate({ fill: v } as Partial<DRCEShape>)} />
        <button
          type="button" title="Set transparent"
          onClick={() => onUpdate({ fill: 'transparent' } as Partial<DRCEShape>)}
          className="text-[10px] border rounded px-1 py-0.5 text-gray-500 hover:bg-gray-50"
        >none</button>
      </Row>
      <Row label="Stroke">
        <ColorInput value={shape.stroke} onChange={v => onUpdate({ stroke: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Thickness">
        <NumberInput value={shape.strokeWidth} min={0} max={20} onChange={v => onUpdate({ strokeWidth: v } as Partial<DRCEShape>)} />
      </Row>
      {shape.type === 'rect' && (
        <Row label="Radius">
          <NumberInput value={(shape as DRCERectShape).radius} min={0} max={100} onChange={v => onUpdate({ radius: v } as Partial<DRCEShape>)} />
        </Row>
      )}
      <Row label="Opacity">
        <input type="range" min={0} max={1} step={0.05} value={shape.opacity}
          onChange={e => onUpdate({ opacity: Number(e.target.value) } as Partial<DRCEShape>)}
          className="w-full" />
        <span className="text-xs text-gray-400 flex-shrink-0 w-6">{Math.round(shape.opacity * 100)}%</span>
      </Row>
      <Row label="X">
        <NumberInput value={Math.round(shape.x)} onChange={v => onUpdate({ x: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Y">
        <NumberInput value={Math.round(shape.y)} onChange={v => onUpdate({ y: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Width">
        <NumberInput value={Math.round(shape.w)} min={10} onChange={v => onUpdate({ w: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Height">
        <NumberInput value={Math.round(shape.h)} min={10} onChange={v => onUpdate({ h: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Rotation">
        <NumberInput value={Math.round(shape.rotation)} min={0} max={360} onChange={v => onUpdate({ rotation: v } as Partial<DRCEShape>)} />
        <span className="text-xs text-gray-400 flex-shrink-0">°</span>
      </Row>
    </>
  );
}

function LinePanel({ shape, onUpdate }: { shape: DRCELineShape; onUpdate: (u: Partial<DRCEShape>) => void }) {
  return (
    <>
      <Row label="Color">
        <ColorInput value={shape.stroke} onChange={v => onUpdate({ stroke: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Thickness">
        <NumberInput value={shape.strokeWidth} min={1} max={20} onChange={v => onUpdate({ strokeWidth: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Opacity">
        <input type="range" min={0} max={1} step={0.05} value={shape.opacity}
          onChange={e => onUpdate({ opacity: Number(e.target.value) } as Partial<DRCEShape>)}
          className="w-full" />
        <span className="text-xs text-gray-400 w-6">{Math.round(shape.opacity * 100)}%</span>
      </Row>
      {shape.type === 'arrow' && (
        <>
          <Row label="Start →">
            <input type="checkbox" checked={shape.startArrow}
              onChange={e => onUpdate({ startArrow: e.target.checked } as Partial<DRCEShape>)} />
            <span className="text-xs text-gray-500">Arrowhead at start</span>
          </Row>
          <Row label="End →">
            <input type="checkbox" checked={shape.endArrow}
              onChange={e => onUpdate({ endArrow: e.target.checked } as Partial<DRCEShape>)} />
            <span className="text-xs text-gray-500">Arrowhead at end</span>
          </Row>
          <Row label="Arrow size">
            <NumberInput value={shape.arrowSize} min={4} max={30} onChange={v => onUpdate({ arrowSize: v } as Partial<DRCEShape>)} />
          </Row>
        </>
      )}
      <Row label="Dashed">
        <input type="checkbox" checked={shape.dashed}
          onChange={e => onUpdate({ dashed: e.target.checked } as Partial<DRCEShape>)} />
        <span className="text-xs text-gray-500">Dashed line</span>
      </Row>
      <Row label="Rotation">
        <NumberInput value={Math.round(shape.rotation)} min={0} max={360} onChange={v => onUpdate({ rotation: v } as Partial<DRCEShape>)} />
        <span className="text-xs text-gray-400 flex-shrink-0">°</span>
      </Row>
    </>
  );
}

function TextPanel({ shape, onUpdate }: { shape: DRCETextShape; onUpdate: (u: Partial<DRCEShape>) => void }) {
  return (
    <>
      <Row label="Content">
        <textarea
          value={shape.content}
          onChange={e => onUpdate({ content: e.target.value } as Partial<DRCEShape>)}
          className="w-full border rounded px-1.5 py-0.5 text-xs resize-none dark:bg-slate-800 dark:border-slate-600"
          rows={2}
        />
      </Row>
      <Row label="Font size">
        <NumberInput value={shape.fontSize} min={6} max={72} onChange={v => onUpdate({ fontSize: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Color">
        <ColorInput value={shape.color} onChange={v => onUpdate({ color: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Background">
        <ColorInput value={shape.background} onChange={v => onUpdate({ background: v } as Partial<DRCEShape>)} />
        <button type="button" title="Transparent background"
          onClick={() => onUpdate({ background: 'transparent' } as Partial<DRCEShape>)}
          className="text-[10px] border rounded px-1 py-0.5 text-gray-500 hover:bg-gray-50">none</button>
      </Row>
      <Row label="Align">
        <SelectInput
          value={shape.align}
          options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
          onChange={v => onUpdate({ align: v as 'left' | 'center' | 'right' } as Partial<DRCEShape>)}
        />
      </Row>
      <Row label="Style">
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={shape.bold} onChange={e => onUpdate({ bold: e.target.checked } as Partial<DRCEShape>)} />
          Bold
        </label>
        <label className="flex items-center gap-1 text-xs cursor-pointer ml-2">
          <input type="checkbox" checked={shape.italic} onChange={e => onUpdate({ italic: e.target.checked } as Partial<DRCEShape>)} />
          Italic
        </label>
      </Row>
      <Row label="Width">
        <NumberInput value={Math.round(shape.w)} min={20} onChange={v => onUpdate({ w: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Rotation">
        <NumberInput value={Math.round(shape.rotation)} min={0} max={360} onChange={v => onUpdate({ rotation: v } as Partial<DRCEShape>)} />
        <span className="text-xs text-gray-400 flex-shrink-0">°</span>
      </Row>
    </>
  );
}

function PolygonPanel({ shape, onUpdate }: { shape: DRCEShape & { type: 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' }; onUpdate: (u: Partial<DRCEShape>) => void }) {
  const s = shape;
  return (
    <>
      <Row label="Fill">
        <ColorInput value={s.fill} onChange={v => onUpdate({ fill: v } as Partial<DRCEShape>)} />
        <button
          type="button" title="Set transparent"
          onClick={() => onUpdate({ fill: 'transparent' } as Partial<DRCEShape>)}
          className="text-[10px] border rounded px-1 py-0.5 text-gray-500 hover:bg-gray-50"
        >none</button>
      </Row>
      <Row label="Stroke">
        <ColorInput value={s.stroke} onChange={v => onUpdate({ stroke: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Thickness">
        <NumberInput value={s.strokeWidth} min={0} max={20} onChange={v => onUpdate({ strokeWidth: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Opacity">
        <input type="range" min={0} max={1} step={0.05} value={s.opacity}
          onChange={e => onUpdate({ opacity: Number(e.target.value) } as Partial<DRCEShape>)}
          className="w-full" />
        <span className="text-xs text-gray-400 flex-shrink-0 w-6">{Math.round(s.opacity * 100)}%</span>
      </Row>
      <Row label="X">
        <NumberInput value={Math.round(s.x)} onChange={v => onUpdate({ x: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Y">
        <NumberInput value={Math.round(s.y)} onChange={v => onUpdate({ y: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Width">
        <NumberInput value={Math.round(s.w)} min={10} onChange={v => onUpdate({ w: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Height">
        <NumberInput value={Math.round(s.h)} min={10} onChange={v => onUpdate({ h: v } as Partial<DRCEShape>)} />
      </Row>
      <Row label="Rotation">
        <NumberInput value={Math.round(s.rotation)} min={0} max={360} onChange={v => onUpdate({ rotation: v } as Partial<DRCEShape>)} />
        <span className="text-xs text-gray-400 flex-shrink-0">°</span>
      </Row>
    </>
  );
}

// ─── Image ────────────────────────────────────────────────────────────────────

function ImagePanel({ shape, onUpdate }: {
  shape: DRCEImageShape;
  onUpdate: (u: Partial<DRCEShape>) => void;
}) {
  const bindings = useAvailableBindings();
  // Filter to bindings that plausibly hold a URL string.
  const urlBindings = bindings.filter(b =>
    b.binding.endsWith('Url') || b.binding.endsWith('_url') ||
    b.binding === 'student.photoUrl' || b.binding === 'meta.logoUrl' ||
    b.group === 'Custom Field',  // any custom field could hold a URL
  );

  async function pickReplacementFile(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'drais/drce-images');
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data?.success && data.url) onUpdate({ src: data.url } as Partial<DRCEShape>);
  }

  return (
    <div className="py-2 space-y-2 text-xs">
      <div>
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Source URL</label>
        <input
          type="text" value={shape.src ?? ''}
          onChange={e => onUpdate({ src: e.target.value } as Partial<DRCEShape>)}
          placeholder="https://… (or upload below)"
          className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Or upload</label>
        <input
          type="file" accept="image/*"
          onChange={e => { const f = e.target.files?.[0]; if (f) pickReplacementFile(f); }}
          className="text-[11px]"
        />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">
          Bind to data (overrides URL when set)
        </label>
        <select
          value={shape.binding ?? ''}
          onChange={e => onUpdate({ binding: e.target.value || undefined } as Partial<DRCEShape>)}
          className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900"
        >
          <option value="">— none (use static URL) —</option>
          {urlBindings.map(b => (
            <option key={b.binding} value={b.binding}>{b.group}: {b.label}</option>
          ))}
        </select>
        <p className="text-[10px] text-gray-400 mt-0.5">
          When set, the printed image comes from this binding per learner (e.g. student photo, school logo).
        </p>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Fit</label>
        <select
          value={shape.fit ?? 'contain'}
          onChange={e => onUpdate({ fit: e.target.value as DRCEImageShape['fit'] } as Partial<DRCEShape>)}
          className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900"
        >
          <option value="contain">Contain (keep aspect, fit inside)</option>
          <option value="cover">Cover (keep aspect, fill, crop overflow)</option>
          <option value="stretch">Stretch (ignore aspect)</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Crop L</label>
          <input type="number" step="0.05" min={0} max={0.9}
            value={shape.cropLeft ?? 0}
            onChange={e => onUpdate({ cropLeft: Number(e.target.value) } as Partial<DRCEShape>)}
            className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Crop T</label>
          <input type="number" step="0.05" min={0} max={0.9}
            value={shape.cropTop ?? 0}
            onChange={e => onUpdate({ cropTop: Number(e.target.value) } as Partial<DRCEShape>)}
            className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Crop R</label>
          <input type="number" step="0.05" min={0} max={0.9}
            value={shape.cropRight ?? 0}
            onChange={e => onUpdate({ cropRight: Number(e.target.value) } as Partial<DRCEShape>)}
            className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900" />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Crop B</label>
          <input type="number" step="0.05" min={0} max={0.9}
            value={shape.cropBottom ?? 0}
            onChange={e => onUpdate({ cropBottom: Number(e.target.value) } as Partial<DRCEShape>)}
            className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900" />
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Opacity</label>
        <input type="range" min={0} max={1} step={0.05}
          value={shape.opacity}
          onChange={e => onUpdate({ opacity: Number(e.target.value) } as Partial<DRCEShape>)}
          className="w-full" />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Rotation (°)</label>
        <input type="number"
          value={shape.rotation}
          onChange={e => onUpdate({ rotation: Number(e.target.value) || 0 } as Partial<DRCEShape>)}
          className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900" />
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">Alt text</label>
        <input type="text"
          value={shape.alt ?? ''}
          onChange={e => onUpdate({ alt: e.target.value || undefined } as Partial<DRCEShape>)}
          placeholder="signature of principal"
          className="w-full px-2 py-1 border border-gray-200 dark:border-slate-700 rounded text-[11px] bg-white dark:bg-slate-900" />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ShapePropertiesPanel({ shape, onUpdate, onDelete }: Props) {
  if (!shape) {
    return (
      <div className="p-4 text-xs text-gray-400 text-center">
        No shape selected.<br />Click a shape or use a drawing tool to add one.
      </div>
    );
  }

  const typeLabel =
    shape.type === 'rect' ? 'Rectangle' :
    shape.type === 'ellipse' ? 'Circle' :
    shape.type === 'arrow' ? 'Arrow' :
    shape.type === 'line' ? 'Line' :
    shape.type === 'text' ? 'Text Box' :
    shape.type === 'triangle' ? 'Triangle' :
    shape.type === 'diamond' ? 'Diamond' :
    shape.type === 'pentagon' ? 'Pentagon' :
    shape.type === 'hexagon' ? 'Hexagon' :
    shape.type === 'star' ? 'Star' :
    shape.type === 'image' ? 'Image' : 'Shape';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 dark:bg-slate-800 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{typeLabel} Properties</span>
        <button
          type="button"
          onClick={onDelete}
          title="Delete shape"
          className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="px-3 py-2 divide-y divide-gray-100 dark:divide-slate-700">
        {(shape.type === 'rect' || shape.type === 'ellipse') && (
          <BoxPanel shape={shape as DRCERectShape | DRCEEllipseShape} onUpdate={onUpdate} />
        )}
        {(shape.type === 'line' || shape.type === 'arrow') && (
          <LinePanel shape={shape as DRCELineShape} onUpdate={onUpdate} />
        )}
        {shape.type === 'text' && (
          <TextPanel shape={shape as DRCETextShape} onUpdate={onUpdate} />
        )}
        {(shape.type === 'triangle' || shape.type === 'diamond' || shape.type === 'pentagon' || shape.type === 'hexagon' || shape.type === 'star') && (
          <PolygonPanel shape={shape as DRCEShape & { type: 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' }} onUpdate={onUpdate} />
        )}
        {shape.type === 'image' && (
          <ImagePanel shape={shape as DRCEImageShape} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}
