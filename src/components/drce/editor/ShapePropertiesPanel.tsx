// src/components/drce/editor/ShapePropertiesPanel.tsx
// Properties panel shown in the right sidebar when a canvas shape is selected.
'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import type {
  DRCEShape, DRCERectShape, DRCEEllipseShape, DRCELineShape, DRCETextShape,
} from '@/lib/drce/schema';

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
    </>
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
    shape.type === 'ellipse' ? 'Ellipse' :
    shape.type === 'arrow' ? 'Arrow' :
    shape.type === 'line' ? 'Line' :
    shape.type === 'text' ? 'Text Box' : 'Shape';

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
      </div>
    </div>
  );
}
