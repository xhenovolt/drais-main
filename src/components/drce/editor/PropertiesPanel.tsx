// src/components/drce/editor/PropertiesPanel.tsx
// Right-side panel: per-section + theme + watermark + rules property controls.
// Full coverage: every section type, field management, comment items, spacing.
'use client';

import React, { useState, useEffect } from 'react';
import type {
  DRCEDocument, DRCESection, DRCEMutation,
  DRCEResultsTableSection, DRCEColumn,
  DRCEStudentInfoSection, DRCEAssessmentSection, DRCECommentsSection,
  DRCEField, DRCECommentItem, DRCEGradeTableSection, DRCEGradeRow,
  DRCECommentRule, DRCETeacherMapping,
} from '@/lib/drce/schema';
import { DEFAULT_GRADE_ROWS } from '@/lib/drce/defaults';
import { AVAILABLE_BINDINGS } from '@/lib/drce/bindingResolver';
import { useAvailableBindings } from '@/components/drce/hooks/useAvailableBindings';
import { Palette, Type, Layers, GripVertical, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TablePropertiesPanel } from './TablePropertiesPanel';
import { newFieldId, newColumnId, newItemId, newId } from '@/lib/drce/ids';
import { VisibilityRuleEditor } from './VisibilityRuleEditor';
import type { VisibilityRule } from '@/lib/drce/visibility';

// ─── Primitives ───────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mb-2">
      <label className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0 pt-1">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 flex-shrink-0" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 font-mono" />
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step }: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number; max?: number; step?: number;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') {
      onChange(undefined);
    } else {
      const num = Number(val);
      onChange(isNaN(num) ? undefined : num);
    }
  };
  return (
    <input type="number" value={value ?? ''} onChange={handleChange}
      min={min} max={max} step={step ?? 1}
      className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800" />
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800" />
  );
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function PanelSection({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-100 dark:border-slate-700 rounded-lg mb-2 overflow-hidden">
      <button type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-800 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300"
        onClick={() => setOpen(v => !v)}>
        {title}
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

// ─── Shared: Spacing Section ──────────────────────────────────────────────────

function SpacingSection({ section, onMutate }: { section: DRCESection; onMutate: (m: DRCEMutation) => void }) {
  // DRCEBlockRefSection has no style; SpacingSection's number inputs simply
  // show 0 in that case and writes to a style field the renderer ignores.
  const style = ((section as { style?: Record<string, unknown> }).style ?? {}) as Record<string, unknown>;
  const set = (k: string, v: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path: k, value: v });
  return (
    <PanelSection title="Spacing" defaultOpen={false}>
      <Row label="Margin top"><NumberInput value={Number(style.spacingTop ?? 0)} onChange={v => set('spacingTop', v)} min={0} max={100} /></Row>
      <Row label="Margin bottom"><NumberInput value={Number(style.spacingBottom ?? 0)} onChange={v => set('spacingBottom', v)} min={0} max={100} /></Row>
    </PanelSection>
  );
}

// ─── Shared: Delete Section ───────────────────────────────────────────────────

/**
 * "Move to…" picker — the accessible counterpart to drag-into-container.
 * Lists every container in the document tree (with depth indent) plus
 * "Top level". Picking a target dispatches MOVE_SECTION; the source
 * section is found and re-inserted at the end of the destination list.
 *
 * Containers cannot host themselves — the picker filters out the selected
 * section's own subtree if it is a container.
 */
function MoveToPicker({ section, doc, onMutate }: {
  section:  DRCESection;
  doc:      DRCEDocument;
  onMutate: (m: DRCEMutation) => void;
}) {
  type Target = { id: string | null; label: string; depth: number };
  const subtreeIds = new Set<string>();
  const collectSubtree = (s: DRCESection) => {
    subtreeIds.add(s.id);
    if (s.type === 'container') (s as { children?: DRCESection[] }).children?.forEach(collectSubtree);
  };
  collectSubtree(section);

  const targets: Target[] = [{ id: null, label: '↑ Top level', depth: 0 }];
  const walk = (arr: DRCESection[], depth: number) => {
    for (const s of arr) {
      if (s.type === 'container' && !subtreeIds.has(s.id)) {
        const labelHint = (s as { id: string }).id.slice(-6);
        targets.push({ id: s.id, label: `${'  '.repeat(depth)}↳ Container · ${labelHint}`, depth });
        walk(((s as { children?: DRCESection[] }).children ?? []), depth + 1);
      }
    }
  };
  walk(doc.sections, 1);

  if (targets.length <= 1) return null;  // no eligible containers

  return (
    <div className="mt-3 px-1">
      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Move to</span>
        <select
          value=""
          onChange={e => {
            const v = e.target.value;
            const target: string | null = v === '' ? null : (v === 'TOP' ? null : v);
            onMutate({
              type: 'MOVE_SECTION',
              sectionId: section.id,
              targetContainerId: target,
              position: Number.MAX_SAFE_INTEGER,  // append at end
            });
          }}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none"
        >
          <option value="">— pick destination —</option>
          {targets.map((t, i) => (
            <option key={i} value={t.id === null ? 'TOP' : t.id}>{t.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DeleteSectionBtn({ section, onMutate }: { section: DRCESection; onMutate: (m: DRCEMutation) => void }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <div className="mt-3 flex gap-2">
        <button type="button" className="flex-1 text-xs bg-red-500 text-white rounded-lg py-1.5 font-medium"
          onClick={() => onMutate({ type: 'DELETE_SECTION', sectionId: section.id })}>
          Confirm Delete
        </button>
        <button type="button" className="flex-1 text-xs bg-gray-100 dark:bg-slate-700 rounded-lg py-1.5"
          onClick={() => setConfirm(false)}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button type="button"
      className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-red-400 hover:text-red-600 border border-dashed border-red-200 dark:border-red-800 rounded-lg py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20"
      onClick={() => setConfirm(true)}>
      <Trash2 size={12} /> Delete Section
    </button>
  );
}

// ─── Shared: Field Manager (student_info, assessment) ─────────────────────────

function SortableField({
  field, allBindings, onDelete, onPropChange,
}: {
  field: DRCEField;
  allBindings: { label: string; value: string }[];
  onDelete: () => void;
  onPropChange: (path: string, value: unknown) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const s: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const [expanded, setExpanded] = useState(false);

  return (
    <div ref={setNodeRef} style={s} className="border border-gray-100 dark:border-slate-700 rounded-lg mb-1.5">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span {...attributes} {...listeners} className="text-gray-400 cursor-grab"><GripVertical size={12} /></span>
        <span className="flex-1 text-xs truncate font-medium">{field.label}</span>
        <button type="button" onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 mr-1">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-gray-50 dark:border-slate-700 pt-1.5">
          <Row label="Label"><TextInput value={field.label} onChange={v => onPropChange('label', v)} /></Row>
          <Row label="Binding">
            <SelectInput value={field.binding} onChange={v => onPropChange('binding', v)} options={allBindings} />
          </Row>
          <Row label="Visible">
            <input type="checkbox" checked={field.visible} onChange={e => onPropChange('visible', e.target.checked)} className="w-4 h-4" />
          </Row>
        </div>
      )}
    </div>
  );
}

function FieldManager({ section, sectionId, fields, onMutate }: {
  section: DRCESection;
  sectionId: string;
  fields: DRCEField[];
  onMutate: (m: DRCEMutation) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sorted = [...(fields ?? [])].sort((a, b) => a.order - b.order);

  // P1 — merged static + custom-field bindings so newly-defined custom
  // fields appear immediately in every field-picker dropdown.
  const allBindings = useAvailableBindings()
    .filter(b => b.group !== 'Subject Result')
    .map(b => ({ label: `${b.group}: ${b.label}`, value: b.binding }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sorted.map(f => f.id);
    const oi = ids.indexOf(String(active.id));
    const ni = ids.indexOf(String(over.id));
    if (oi === -1 || ni === -1) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(oi, 1);
    reordered.splice(ni, 0, moved);
    onMutate({ type: 'REORDER_FIELDS', sectionId, ids: reordered });
  }

  return (
    <PanelSection title="Fields">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map(f => f.id)} strategy={verticalListSortingStrategy}>
          {sorted.map(f => (
            <SortableField
              key={f.id}
              field={f}
              allBindings={allBindings}
              onDelete={() => onMutate({ type: 'DELETE_FIELD', sectionId, fieldId: f.id })}
              onPropChange={(path, value) => onMutate({ type: 'SET_FIELD_PROP', sectionId, fieldId: f.id, path, value })}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button type="button"
        className="w-full mt-1 flex items-center justify-center gap-1 text-xs border border-dashed border-indigo-300 dark:border-indigo-600 rounded-lg py-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
        onClick={() => onMutate({
          type: 'ADD_FIELD',
          sectionId,
          field: {
            id: newFieldId(),
            label: 'New Field',
            binding: 'student.fullName',
            visible: true,
            order: fields.length,
          },
        })}>
        <Plus size={12} /> Add Field
      </button>
    </PanelSection>
  );
}

// ─── Comment Item Manager ─────────────────────────────────────────────────────

function SortableCommentItem({
  item, allBindings, onDelete, onPropChange,
}: {
  item: DRCECommentItem;
  allBindings: { label: string; value: string }[];
  onDelete: () => void;
  onPropChange: (path: string, value: unknown) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const s: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const [expanded, setExpanded] = useState(false);

  return (
    <div ref={setNodeRef} style={s} className="border border-gray-100 dark:border-slate-700 rounded-lg mb-1.5">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span {...attributes} {...listeners} className="text-gray-400 cursor-grab"><GripVertical size={12} /></span>
        <span className="flex-1 text-xs truncate font-medium">{item.label}</span>
        <button type="button" onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 mr-1">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-gray-50 dark:border-slate-700 pt-1.5">
          <Row label="Label"><TextInput value={item.label} onChange={v => onPropChange('label', v)} /></Row>
          <Row label="Binding">
            <SelectInput value={item.binding} onChange={v => onPropChange('binding', v)} options={allBindings} />
          </Row>
          <Row label="Visible">
            <input type="checkbox" checked={item.visible} onChange={e => onPropChange('visible', e.target.checked)} className="w-4 h-4" />
          </Row>
        </div>
      )}
    </div>
  );
}

// ─── Header Panel ─────────────────────────────────────────────────────────────

function HeaderPanel({ section, onMutate }: { section: DRCESection & { type: 'header' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const { style } = section;
  return (
    <div className="p-3 space-y-4">
      {/* Layout */}
      <PanelSection title="Layout">
        <Row label="Layout">
          <SelectInput value={style.layout} onChange={v => set('layout', v)} options={[
            { label: 'Three Column', value: 'three-column' },
            { label: 'Centered', value: 'centered' },
            { label: 'Left Logo', value: 'left-logo' },
            { label: 'Flex Grid (Custom)', value: 'flex-grid' },
            { label: 'Custom', value: 'custom' },
          ]} />
        </Row>
        <Row label="Padding bottom"><NumberInput value={Number(style.paddingBottom ?? 0)} onChange={v => set('paddingBottom', Number(v))} min={0} max={40} /></Row>
        <Row label="Opacity"><NumberInput value={Number(style.opacity ?? 1)} onChange={v => set('opacity', v)} min={0.1} max={1} step={0.05} /></Row>
        <Row label="Border bottom"><TextInput value={String(style.borderBottom ?? '')} onChange={v => set('borderBottom', v)} placeholder="1px solid #eee" /></Row>
        <Row label="Gap (px)"><NumberInput value={Number(style.gap ?? 12)} onChange={v => set('gap', v)} min={0} max={48} /></Row>
      </PanelSection>

      {/* Header border */}
      <PanelSection title="Header Border" defaultOpen={false}>
        <Row label="Enable border">
          <input type="checkbox" checked={style.headerBorder?.enabled ?? false} onChange={e => set('headerBorder', { ...(style.headerBorder as any), enabled: e.target.checked })} className="w-4 h-4" />
        </Row>
        {style.headerBorder?.enabled && (
          <>
            <Row label="Color"><ColorInput value={style.headerBorder.color ?? '#ccc'} onChange={v => set('headerBorder', { ...(style.headerBorder as any), color: v })} /></Row>
            <Row label="Width"><NumberInput value={Number(style.headerBorder.width ?? 1)} onChange={v => set('headerBorder', { ...(style.headerBorder as any), width: Number(v) })} min={1} max={5} /></Row>
            <Row label="Style">
              <SelectInput value={style.headerBorder.style ?? 'solid'} onChange={v => set('headerBorder', { ...(style.headerBorder as any), style: v })} options={[
                { label: 'Solid', value: 'solid' },
                { label: 'Dashed', value: 'dashed' },
                { label: 'Dotted', value: 'dotted' },
                { label: 'Double', value: 'double' },
              ]} />
            </Row>
            <Row label="Radius"><NumberInput value={Number(style.headerBorder.radius ?? 0)} onChange={v => set('headerBorder', { ...(style.headerBorder as any), radius: Number(v) })} min={0} max={16} /></Row>
            <Row label="Padding"><TextInput value={String(style.headerBorder.padding ?? '12px')} onChange={v => set('headerBorder', { ...(style.headerBorder as any), padding: v })} placeholder="12px" /></Row>
          </>
        )}
      </PanelSection>

      {/* Component visibility */}
      <PanelSection title="Components">
        <Row label="Show logo"><input type="checkbox" checked={style.showLogo !== false} onChange={e => set('showLogo', e.target.checked)} className="w-4 h-4" /></Row>
        <Row label="Show name"><input type="checkbox" checked={style.showName !== false} onChange={e => set('showName', e.target.checked)} className="w-4 h-4" /></Row>
        <Row label="Show Arabic name"><input type="checkbox" checked={style.showArabicName !== false} onChange={e => set('showArabicName', e.target.checked)} className="w-4 h-4" /></Row>
        <Row label="Show address"><input type="checkbox" checked={style.showAddress !== false} onChange={e => set('showAddress', e.target.checked)} className="w-4 h-4" /></Row>
        <Row label="Show contact"><input type="checkbox" checked={style.showContact !== false} onChange={e => set('showContact', e.target.checked)} className="w-4 h-4" /></Row>
        <Row label="Show centre no"><input type="checkbox" checked={style.showCentreNo !== false} onChange={e => set('showCentreNo', e.target.checked)} className="w-4 h-4" /></Row>
        <Row label="Show registration no"><input type="checkbox" checked={style.showRegistrationNo !== false} onChange={e => set('showRegistrationNo', e.target.checked)} className="w-4 h-4" /></Row>
      </PanelSection>

      {/* Component styles */}
      <PanelSection title="Component Styles" defaultOpen={false}>
        {/* Logo style */}
        <div className="border-b border-gray-100 dark:border-slate-700 pb-2 mb-2">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Logo</h4>
           <Row label="Position"><SelectInput value={style.logoStyle?.position ?? 'auto'} onChange={v => set('logoStyle', { ...(style.logoStyle || {}), position: v })} options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Align"><SelectInput value={style.logoStyle?.align ?? 'left'} onChange={v => set('logoStyle', { ...(style.logoStyle || {}), align: v })} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Border"><TextInput value={style.logoStyle?.border ? `${style.logoStyle.border.width}px ${style.logoStyle.border.style} ${style.logoStyle.border.color}` : ''} onChange={v => {
             const parts = v.split(' ');
             set('logoStyle', { ...(style.logoStyle || {}), border: parts.length >= 3 ? { enabled: true, width: Number(parts[0]) || 1, style: parts[1] as any, color: parts[2], radius: 0 } : undefined });
           }} placeholder="2px solid #000" /></Row>
           <Row label="Padding"><TextInput value={String(style.logoStyle?.padding ?? '')} onChange={v => set('logoStyle', { ...(style.logoStyle || {}), padding: v })} placeholder="8px" /></Row>
           <Row label="Margin"><TextInput value={String(style.logoStyle?.margin ?? '')} onChange={v => set('logoStyle', { ...(style.logoStyle || {}), margin: v })} placeholder="4px" /></Row>
           <Row label="Background"><ColorInput value={style.logoStyle?.background ?? '#ffffff'} onChange={v => set('logoStyle', { ...(style.logoStyle || {}), background: v })} /></Row>
           <Row label="Font size"><NumberInput value={style.logoStyle?.fontSize} onChange={v => set('logoStyle', { ...(style.logoStyle || {}), fontSize: v })} min={8} max={72} /></Row>
           <Row label="Color"><ColorInput value={style.logoStyle?.color ?? '#000000'} onChange={v => set('logoStyle', { ...(style.logoStyle || {}), color: v })} /></Row>
           <Row label="Font weight"><TextInput value={String(style.logoStyle?.fontWeight ?? '')} onChange={v => set('logoStyle', { ...(style.logoStyle || {}), fontWeight: v })} placeholder="bold" /></Row>
        </div>

        {/* Name style */}
        <div className="border-b border-gray-100 dark:border-slate-700 pb-2 mb-2">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">School Name</h4>
           <Row label="Position"><SelectInput value={style.nameStyle?.position ?? 'auto'} onChange={v => set('nameStyle', { ...(style.nameStyle || {}), position: v })} options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Align"><SelectInput value={style.nameStyle?.align ?? 'left'} onChange={v => set('nameStyle', { ...(style.nameStyle || {}), align: v })} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Border"><TextInput value={style.nameStyle?.border ? `${style.nameStyle.border.width}px ${style.nameStyle.border.style} ${style.nameStyle.border.color}` : ''} onChange={v => {
             const parts = v.split(' ');
             set('nameStyle', { ...(style.nameStyle || {}), border: parts.length >= 3 ? { enabled: true, width: Number(parts[0]) || 1, style: parts[1] as any, color: parts[2], radius: 0 } : undefined });
           }} placeholder="2px solid #000" /></Row>
           <Row label="Padding"><TextInput value={String(style.nameStyle?.padding ?? '')} onChange={v => set('nameStyle', { ...(style.nameStyle || {}), padding: v })} placeholder="8px" /></Row>
           <Row label="Margin"><TextInput value={String(style.nameStyle?.margin ?? '')} onChange={v => set('nameStyle', { ...(style.nameStyle || {}), margin: v })} placeholder="4px" /></Row>
           <Row label="Background"><ColorInput value={style.nameStyle?.background ?? '#ffffff'} onChange={v => set('nameStyle', { ...(style.nameStyle || {}), background: v })} /></Row>
           <Row label="Font size"><NumberInput value={style.nameStyle?.fontSize} onChange={v => set('nameStyle', { ...(style.nameStyle || {}), fontSize: v })} min={8} max={72} /></Row>
           <Row label="Color"><ColorInput value={style.nameStyle?.color ?? '#000000'} onChange={v => set('nameStyle', { ...(style.nameStyle || {}), color: v })} /></Row>
           <Row label="Font weight"><TextInput value={String(style.nameStyle?.fontWeight ?? '')} onChange={v => set('nameStyle', { ...(style.nameStyle || {}), fontWeight: v })} placeholder="bold" /></Row>
        </div>

        {/* Arabic name style */}
        <div className="border-b border-gray-100 dark:border-slate-700 pb-2 mb-2">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Arabic Name</h4>
           <Row label="Position"><SelectInput value={style.arabicNameStyle?.position ?? 'auto'} onChange={v => set('arabicNameStyle', { ...(style.arabicNameStyle || {}), position: v })} options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Align"><SelectInput value={style.arabicNameStyle?.align ?? 'left'} onChange={v => set('arabicNameStyle', { ...(style.arabicNameStyle || {}), align: v })} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
          <Row label="Border"><TextInput value={style.arabicNameStyle?.border ? `${style.arabicNameStyle.border.width}px ${style.arabicNameStyle.border.style} ${style.arabicNameStyle.border.color}` : ''} onChange={v => {
            const parts = v.split(' ');
            set('arabicNameStyle', { ...(style.arabicNameStyle as any), border: parts.length >= 3 ? { enabled: true, width: Number(parts[0]) || 1, style: parts[1] as any, color: parts[2], radius: 0 } : undefined });
          }} placeholder="2px solid #000" /></Row>
          <Row label="Padding"><TextInput value={String(style.arabicNameStyle?.padding ?? '')} onChange={v => set('arabicNameStyle', { ...(style.arabicNameStyle as any), padding: v })} placeholder="8px" /></Row>
          <Row label="Margin"><TextInput value={String(style.arabicNameStyle?.margin ?? '')} onChange={v => set('arabicNameStyle', { ...(style.arabicNameStyle as any), margin: v })} placeholder="4px" /></Row>
          <Row label="Background"><ColorInput value={style.arabicNameStyle?.background ?? '#ffffff'} onChange={v => set('arabicNameStyle', { ...(style.arabicNameStyle as any), background: v })} /></Row>
          <Row label="Font size"><NumberInput value={style.arabicNameStyle?.fontSize} onChange={v => set('arabicNameStyle', { ...(style.arabicNameStyle as any), fontSize: v })} min={8} max={72} /></Row>
          <Row label="Color"><ColorInput value={style.arabicNameStyle?.color ?? '#000000'} onChange={v => set('arabicNameStyle', { ...(style.arabicNameStyle as any), color: v })} /></Row>
          <Row label="Font weight"><TextInput value={String(style.arabicNameStyle?.fontWeight ?? '')} onChange={v => set('arabicNameStyle', { ...(style.arabicNameStyle as any), fontWeight: v })} placeholder="bold" /></Row>
        </div>

        {/* Address style */}
        <div className="border-b border-gray-100 dark:border-slate-700 pb-2 mb-2">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Address</h4>
           <Row label="Position"><SelectInput value={style.addressStyle?.position ?? 'auto'} onChange={v => set('addressStyle', { ...(style.addressStyle || {}), position: v })} options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Align"><SelectInput value={style.addressStyle?.align ?? 'left'} onChange={v => set('addressStyle', { ...(style.addressStyle || {}), align: v })} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
          <Row label="Border"><TextInput value={style.addressStyle?.border ? `${style.addressStyle.border.width}px ${style.addressStyle.border.style} ${style.addressStyle.border.color}` : ''} onChange={v => {
            const parts = v.split(' ');
            set('addressStyle', { ...(style.addressStyle as any), border: parts.length >= 3 ? { enabled: true, width: Number(parts[0]) || 1, style: parts[1] as any, color: parts[2], radius: 0 } : undefined });
          }} placeholder="2px solid #000" /></Row>
          <Row label="Padding"><TextInput value={String(style.addressStyle?.padding ?? '')} onChange={v => set('addressStyle', { ...(style.addressStyle as any), padding: v })} placeholder="8px" /></Row>
          <Row label="Margin"><TextInput value={String(style.addressStyle?.margin ?? '')} onChange={v => set('addressStyle', { ...(style.addressStyle as any), margin: v })} placeholder="4px" /></Row>
          <Row label="Background"><ColorInput value={style.addressStyle?.background ?? '#ffffff'} onChange={v => set('addressStyle', { ...(style.addressStyle as any), background: v })} /></Row>
          <Row label="Font size"><NumberInput value={style.addressStyle?.fontSize} onChange={v => set('addressStyle', { ...(style.addressStyle as any), fontSize: v })} min={8} max={72} /></Row>
          <Row label="Color"><ColorInput value={style.addressStyle?.color ?? '#666666'} onChange={v => set('addressStyle', { ...(style.addressStyle as any), color: v })} /></Row>
          <Row label="Font weight"><TextInput value={String(style.addressStyle?.fontWeight ?? '')} onChange={v => set('addressStyle', { ...(style.addressStyle as any), fontWeight: v })} placeholder="normal" /></Row>
        </div>

        {/* Contact style */}
        <div className="border-b border-gray-100 dark:border-slate-700 pb-2 mb-2">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Contact</h4>
           <Row label="Position"><SelectInput value={style.contactStyle?.position ?? 'auto'} onChange={v => set('contactStyle', { ...(style.contactStyle || {}), position: v })} options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Align"><SelectInput value={style.contactStyle?.align ?? 'left'} onChange={v => set('contactStyle', { ...(style.contactStyle || {}), align: v })} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
          <Row label="Border"><TextInput value={style.contactStyle?.border ? `${style.contactStyle.border.width}px ${style.contactStyle.border.style} ${style.contactStyle.border.color}` : ''} onChange={v => {
            const parts = v.split(' ');
            set('contactStyle', { ...(style.contactStyle as any), border: parts.length >= 3 ? { enabled: true, width: Number(parts[0]) || 1, style: parts[1] as any, color: parts[2], radius: 0 } : undefined });
          }} placeholder="2px solid #000" /></Row>
          <Row label="Padding"><TextInput value={String(style.contactStyle?.padding ?? '')} onChange={v => set('contactStyle', { ...(style.contactStyle as any), padding: v })} placeholder="8px" /></Row>
          <Row label="Margin"><TextInput value={String(style.contactStyle?.margin ?? '')} onChange={v => set('contactStyle', { ...(style.contactStyle as any), margin: v })} placeholder="4px" /></Row>
          <Row label="Background"><ColorInput value={style.contactStyle?.background ?? '#ffffff'} onChange={v => set('contactStyle', { ...(style.contactStyle as any), background: v })} /></Row>
          <Row label="Font size"><NumberInput value={style.contactStyle?.fontSize} onChange={v => set('contactStyle', { ...(style.contactStyle as any), fontSize: v })} min={8} max={72} /></Row>
          <Row label="Color"><ColorInput value={style.contactStyle?.color ?? '#666666'} onChange={v => set('contactStyle', { ...(style.contactStyle as any), color: v })} /></Row>
          <Row label="Font weight"><TextInput value={String(style.contactStyle?.fontWeight ?? '')} onChange={v => set('contactStyle', { ...(style.contactStyle as any), fontWeight: v })} placeholder="normal" /></Row>
        </div>

        {/* Centre No style */}
        <div className="border-b border-gray-100 dark:border-slate-700 pb-2 mb-2">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Centre No</h4>
           <Row label="Position"><SelectInput value={style.centreNoStyle?.position ?? 'auto'} onChange={v => set('centreNoStyle', { ...(style.centreNoStyle || {}), position: v })} options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Align"><SelectInput value={style.centreNoStyle?.align ?? 'left'} onChange={v => set('centreNoStyle', { ...(style.centreNoStyle || {}), align: v })} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
          <Row label="Border"><TextInput value={style.centreNoStyle?.border ? `${style.centreNoStyle.border.width}px ${style.centreNoStyle.border.style} ${style.centreNoStyle.border.color}` : ''} onChange={v => {
            const parts = v.split(' ');
            set('centreNoStyle', { ...(style.centreNoStyle as any), border: parts.length >= 3 ? { enabled: true, width: Number(parts[0]) || 1, style: parts[1] as any, color: parts[2], radius: 0 } : undefined });
          }} placeholder="2px solid #000" /></Row>
          <Row label="Padding"><TextInput value={String(style.centreNoStyle?.padding ?? '')} onChange={v => set('centreNoStyle', { ...(style.centreNoStyle as any), padding: v })} placeholder="8px" /></Row>
          <Row label="Margin"><TextInput value={String(style.centreNoStyle?.margin ?? '')} onChange={v => set('centreNoStyle', { ...(style.centreNoStyle as any), margin: v })} placeholder="4px" /></Row>
          <Row label="Background"><ColorInput value={style.centreNoStyle?.background ?? '#ffffff'} onChange={v => set('centreNoStyle', { ...(style.centreNoStyle as any), background: v })} /></Row>
          <Row label="Font size"><NumberInput value={style.centreNoStyle?.fontSize} onChange={v => set('centreNoStyle', { ...(style.centreNoStyle as any), fontSize: v })} min={8} max={72} /></Row>
          <Row label="Color"><ColorInput value={style.centreNoStyle?.color ?? '#666666'} onChange={v => set('centreNoStyle', { ...(style.centreNoStyle as any), color: v })} /></Row>
          <Row label="Font weight"><TextInput value={String(style.centreNoStyle?.fontWeight ?? '')} onChange={v => set('centreNoStyle', { ...(style.centreNoStyle as any), fontWeight: v })} placeholder="normal" /></Row>
        </div>

        {/* Registration No style */}
        <div className="border-b border-gray-100 dark:border-slate-700 pb-2 mb-2">
          <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Registration No</h4>
           <Row label="Position"><SelectInput value={style.registrationNoStyle?.position ?? 'auto'} onChange={v => set('registrationNoStyle', { ...(style.registrationNoStyle || {}), position: v })} options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
           <Row label="Align"><SelectInput value={style.registrationNoStyle?.align ?? 'left'} onChange={v => set('registrationNoStyle', { ...(style.registrationNoStyle || {}), align: v })} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} /></Row>
          <Row label="Border"><TextInput value={style.registrationNoStyle?.border ? `${style.registrationNoStyle.border.width}px ${style.registrationNoStyle.border.style} ${style.registrationNoStyle.border.color}` : ''} onChange={v => {
            const parts = v.split(' ');
            set('registrationNoStyle', { ...(style.registrationNoStyle as any), border: parts.length >= 3 ? { enabled: true, width: Number(parts[0]) || 1, style: parts[1] as any, color: parts[2], radius: 0 } : undefined });
          }} placeholder="2px solid #000" /></Row>
          <Row label="Padding"><TextInput value={String(style.registrationNoStyle?.padding ?? '')} onChange={v => set('registrationNoStyle', { ...(style.registrationNoStyle as any), padding: v })} placeholder="8px" /></Row>
          <Row label="Margin"><TextInput value={String(style.registrationNoStyle?.margin ?? '')} onChange={v => set('registrationNoStyle', { ...(style.registrationNoStyle as any), margin: v })} placeholder="4px" /></Row>
          <Row label="Background"><ColorInput value={style.registrationNoStyle?.background ?? '#ffffff'} onChange={v => set('registrationNoStyle', { ...(style.registrationNoStyle as any), background: v })} /></Row>
          <Row label="Font size"><NumberInput value={style.registrationNoStyle?.fontSize} onChange={v => set('registrationNoStyle', { ...(style.registrationNoStyle as any), fontSize: v })} min={8} max={72} /></Row>
          <Row label="Color"><ColorInput value={style.registrationNoStyle?.color ?? '#666666'} onChange={v => set('registrationNoStyle', { ...(style.registrationNoStyle as any), color: v })} /></Row>
          <Row label="Font weight"><TextInput value={String(style.registrationNoStyle?.fontWeight ?? '')} onChange={v => set('registrationNoStyle', { ...(style.registrationNoStyle as any), fontWeight: v })} placeholder="normal" /></Row>
        </div>
      </PanelSection>

      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Banner Panel ─────────────────────────────────────────────────────────────

function BannerPanel({ section, onMutate }: { section: DRCESection & { type: 'banner' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const setContent = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_CONTENT', sectionId: section.id, path, value });
  const { style } = section;
  return (
    <div className="p-3">
      <PanelSection title="Content">
        <Row label="Text"><TextInput value={section.content.text} onChange={v => setContent('text', v)} /></Row>
      </PanelSection>
      <PanelSection title="Colours">
        <Row label="Background"><ColorInput value={style.backgroundColor} onChange={v => set('backgroundColor', v)} /></Row>
        <Row label="Text colour"><ColorInput value={style.color} onChange={v => set('color', v)} /></Row>
      </PanelSection>
      <PanelSection title="Typography">
        <Row label="Font size"><NumberInput value={style.fontSize} onChange={v => set('fontSize', v)} min={8} max={36} /></Row>
        <Row label="Font weight"><TextInput value={style.fontWeight} onChange={v => set('fontWeight', v)} placeholder="bold" /></Row>
        <Row label="Letter spacing"><TextInput value={style.letterSpacing} onChange={v => set('letterSpacing', v)} /></Row>
        <Row label="Transform">
          <SelectInput value={style.textTransform} onChange={v => set('textTransform', v)} options={[
            { label: 'Uppercase', value: 'uppercase' },
            { label: 'None', value: 'none' },
            { label: 'Capitalize', value: 'capitalize' },
          ]} />
        </Row>
        <Row label="Alignment">
          <SelectInput value={style.textAlign} onChange={v => set('textAlign', v)} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} />
        </Row>
      </PanelSection>
      <PanelSection title="Dimensions">
        <Row label="Padding"><TextInput value={style.padding} onChange={v => set('padding', v)} placeholder="8px" /></Row>
        <Row label="Border radius"><NumberInput value={style.borderRadius} onChange={v => set('borderRadius', v)} min={0} max={32} /></Row>
      </PanelSection>
      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Ribbon Panel ─────────────────────────────────────────────────────────────

function RibbonPanel({ section, onMutate }: { section: DRCESection & { type: 'ribbon' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const setContent = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_CONTENT', sectionId: section.id, path, value });
  const { style, content } = section;
  return (
    <div className="p-3">
      <PanelSection title="Content">
        <Row label="Text"><TextInput value={content.text} onChange={v => setContent('text', v)} /></Row>
        <Row label="Shape">
          <SelectInput value={content.shape} onChange={v => setContent('shape', v)} options={[
            { label: 'Arrow Down', value: 'arrow-down' },
            { label: 'Flat', value: 'flat' },
            { label: 'Chevron', value: 'chevron' },
          ]} />
        </Row>
      </PanelSection>
      <PanelSection title="Colours">
        <Row label="Background"><ColorInput value={style.background} onChange={v => set('background', v)} /></Row>
        <Row label="Text colour"><ColorInput value={style.color} onChange={v => set('color', v)} /></Row>
      </PanelSection>
      <PanelSection title="Typography">
        <Row label="Font size"><NumberInput value={style.fontSize} onChange={v => set('fontSize', v)} min={8} max={24} /></Row>
        <Row label="Font weight"><TextInput value={style.fontWeight} onChange={v => set('fontWeight', v)} placeholder="bold" /></Row>
        <Row label="Alignment">
          <SelectInput value={style.textAlign} onChange={v => set('textAlign', v)} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} />
        </Row>
      </PanelSection>
      <PanelSection title="Dimensions">
        <Row label="Padding"><TextInput value={style.padding} onChange={v => set('padding', v)} placeholder="4px 12px" /></Row>
        <Row label="Width (vb)"><NumberInput value={style.width} onChange={v => set('width', v)} min={120} max={1200} /></Row>
        <Row label="Height (px)"><NumberInput value={style.height} onChange={v => set('height', v)} min={18} max={200} /></Row>
        <Row label="Chevron depth"><NumberInput value={style.chevronDepth} onChange={v => set('chevronDepth', v)} min={0} max={120} /></Row>
        <Row label="Tail depth"><NumberInput value={style.tailDepth} onChange={v => set('tailDepth', v)} min={0} max={120} /></Row>
        <Row label="Tail angle"><NumberInput value={style.tailAngle} onChange={v => set('tailAngle', v)} min={10} max={80} /></Row>
        <Row label="Corner radius"><NumberInput value={style.cornerRadius} onChange={v => set('cornerRadius', v)} min={0} max={40} /></Row>
      </PanelSection>
      <PanelSection title="SVG / Layering">
        <Row label="Stroke colour"><ColorInput value={style.strokeColor ?? '#000000'} onChange={v => set('strokeColor', v)} /></Row>
        <Row label="Stroke width"><NumberInput value={style.strokeWidth} onChange={v => set('strokeWidth', v)} min={0} max={10} step={0.2} /></Row>
        <Row label="Text Y offset"><NumberInput value={style.textOffsetY} onChange={v => set('textOffsetY', v)} min={-40} max={40} /></Row>
        <Row label="Scale"><NumberInput value={style.svgScale} onChange={v => set('svgScale', v)} min={0.5} max={2} step={0.05} /></Row>
        <Row label="Rotation"><NumberInput value={style.rotation} onChange={v => set('rotation', v)} min={-180} max={180} step={1} /></Row>
        <Row label="Layers"><NumberInput value={style.layerCount} onChange={v => set('layerCount', v)} min={1} max={6} /></Row>
        <Row label="Layer offset"><NumberInput value={style.layerOffset} onChange={v => set('layerOffset', v)} min={0} max={20} /></Row>
      </PanelSection>
      <PanelSection title="Shadow" defaultOpen={false}>
        <Row label="Enable">
          <input type="checkbox" checked={style.shadowEnabled ?? false} onChange={e => set('shadowEnabled', e.target.checked)} className="w-4 h-4" />
        </Row>
        <Row label="Shadow color"><ColorInput value={style.shadowColor ?? '#000000'} onChange={v => set('shadowColor', v)} /></Row>
        <Row label="Shadow blur"><NumberInput value={style.shadowBlur} onChange={v => set('shadowBlur', v)} min={0} max={24} /></Row>
      </PanelSection>
      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Student Info Panel ───────────────────────────────────────────────────────

function StudentInfoPanel({ section, onMutate }: { section: DRCEStudentInfoSection; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const { style } = section;
  return (
    <div className="p-3">
      <PanelSection title="Style">
        <Row label="Background"><ColorInput value={style.background} onChange={v => set('background', v)} /></Row>
        <Row label="Label colour"><ColorInput value={style.labelColor} onChange={v => set('labelColor', v)} /></Row>
        <Row label="Value colour"><ColorInput value={style.valueColor} onChange={v => set('valueColor', v)} /></Row>
        <Row label="Value size"><NumberInput value={style.valueFontSize} onChange={v => set('valueFontSize', v)} min={8} max={24} /></Row>
        <Row label="Value weight"><TextInput value={style.valueFontWeight ?? 'bolder'} onChange={v => set('valueFontWeight', v)} placeholder="bolder" /></Row>
        <Row label="Border"><TextInput value={style.border} onChange={v => set('border', v)} placeholder="2px solid #ccc" /></Row>
        <Row label="Border radius"><NumberInput value={style.borderRadius} onChange={v => set('borderRadius', v)} min={0} max={32} /></Row>
        <Row label="Padding"><TextInput value={style.padding} onChange={v => set('padding', v)} placeholder="14px 16px" /></Row>
      </PanelSection>
      <PanelSection title="Barcode">
        <Row label="Show barcode">
          <input type="checkbox" checked={style.showBarcode !== false}
            onChange={e => set('showBarcode', e.target.checked)} className="w-4 h-4" />
        </Row>
        <Row label="Rotation (°)">
          <div className="space-y-1">
            <NumberInput
              value={style.barcodeRotation ?? 0}
              onChange={v => set('barcodeRotation', v)}
              min={-180} max={180} step={5}
            />
            <div className="flex gap-1 flex-wrap">
              {[0, 45, 90, -90, 180].map(deg => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => set('barcodeRotation', deg)}
                  className={[
                    'text-xs px-2 py-0.5 rounded border',
                    (style.barcodeRotation ?? 0) === deg
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
        </Row>
        <Row label="Width (px)">
          <NumberInput value={style.barcodeWidth ?? 36} onChange={v => set('barcodeWidth', v)} min={20} max={120} />
        </Row>
        <Row label="Height (px)">
          <NumberInput value={style.barcodeHeight ?? 52} onChange={v => set('barcodeHeight', v)} min={20} max={160} />
        </Row>
        <Row label="Label spacing">
          <NumberInput value={style.barcodeLabelSpacing ?? 1} onChange={v => set('barcodeLabelSpacing', v)} min={0} max={20} />
        </Row>
        <Row label="Label size">
          <NumberInput value={style.barcodeLabelFontSize ?? 7} onChange={v => set('barcodeLabelFontSize', v)} min={5} max={20} />
        </Row>
        <Row label="Show photo">
          <input type="checkbox" checked={style.showPhoto !== false}
            onChange={e => set('showPhoto', e.target.checked)} className="w-4 h-4" />
        </Row>
        <Row label="Fields/row">
          <NumberInput value={style.fieldsPerRow ?? 4} onChange={v => set('fieldsPerRow', v)} min={1} max={8} />
        </Row>
      </PanelSection>
      <FieldManager section={section} sectionId={section.id} fields={section.fields} onMutate={onMutate} />
      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Assessment Panel ─────────────────────────────────────────────────────────

function AssessmentPanel({ section, onMutate }: { section: DRCEAssessmentSection; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const style = section.style as Record<string, unknown>;
  return (
    <div className="p-3">
      <PanelSection title="Layout">
        <Row label="Layout">
          <SelectInput value={String(style.layout ?? 'table')} onChange={v => set('layout', v)} options={[
            { label: 'Table', value: 'table' },
            { label: 'Flex', value: 'flex' },
          ]} />
        </Row>
        <Row label="Width">
          <TextInput value={String(style.width ?? '100%')} onChange={v => set('width', v)} placeholder="100% or 520px" />
        </Row>
        <Row label="Min width">
          <TextInput value={String(style.minWidth ?? '')} onChange={v => set('minWidth', v)} placeholder="240px" />
        </Row>
        <Row label="Max width">
          <TextInput value={String(style.maxWidth ?? '')} onChange={v => set('maxWidth', v)} placeholder="100%" />
        </Row>
        <Row label="Min height">
          <TextInput value={String(style.minHeight ?? '')} onChange={v => set('minHeight', v)} placeholder="80px" />
        </Row>
        <Row label="Inner padding">
          <TextInput value={String(style.padding ?? '10px 20px')} onChange={v => set('padding', v)} placeholder="10px 20px" />
        </Row>
        <Row label="Outer margin">
          <TextInput value={String(style.margin ?? '')} onChange={v => set('margin', v)} placeholder="0 auto" />
        </Row>
      </PanelSection>
      <PanelSection title="Table">
        <Row label="Split fields">
          <NumberInput value={Number(style.positionFields ?? 2)} onChange={v => set('positionFields', v)} min={0} max={Math.max(section.fields.length, 1)} />
        </Row>
        <Row label="Position label">
          <TextInput value={String(style.positionLabel ?? 'Position')} onChange={v => set('positionLabel', v)} placeholder="Position" />
        </Row>
        <Row label="Grade label">
          <TextInput value={String(style.assessmentLabel ?? 'Grade Assessment')} onChange={v => set('assessmentLabel', v)} placeholder="Grade Assessment" />
        </Row>
        <Row label="Table layout">
          <SelectInput value={String(style.tableLayout ?? 'fixed')} onChange={v => set('tableLayout', v)} options={[
            { label: 'Fixed', value: 'fixed' },
            { label: 'Auto', value: 'auto' },
          ]} />
        </Row>
        <Row label="Cell padding">
          <TextInput value={String(style.cellPadding ?? '2px 8px')} onChange={v => set('cellPadding', v)} placeholder="2px 8px" />
        </Row>
      </PanelSection>
      <PanelSection title="Flex Layout">
        <Row label="Item min width">
          <NumberInput value={Number(style.itemMinWidth ?? 160)} onChange={v => set('itemMinWidth', v)} min={80} max={480} />
        </Row>
        <Row label="Row gap">
          <NumberInput value={Number(style.rowGap ?? 4)} onChange={v => set('rowGap', v)} min={0} max={40} />
        </Row>
        <Row label="Column gap">
          <NumberInput value={Number(style.columnGap ?? 16)} onChange={v => set('columnGap', v)} min={0} max={60} />
        </Row>
      </PanelSection>
      <PanelSection title="Typography">
        <Row label="Header size">
          <NumberInput value={Number(style.headerFontSize ?? 11)} onChange={v => set('headerFontSize', v)} min={8} max={24} />
        </Row>
        <Row label="Label size">
          <NumberInput value={Number(style.labelFontSize ?? 10)} onChange={v => set('labelFontSize', v)} min={8} max={24} />
        </Row>
        <Row label="Value size">
          <NumberInput value={Number(style.valueFontSize ?? 12)} onChange={v => set('valueFontSize', v)} min={8} max={28} />
        </Row>
        <Row label="Value weight">
          <SelectInput value={String(style.valueFontWeight ?? 'bold')} onChange={v => set('valueFontWeight', v)} options={[
            { label: 'Bold', value: 'bold' },
            { label: 'Normal', value: 'normal' },
            { label: 'Semibold', value: '600' },
          ]} />
        </Row>
      </PanelSection>
      <PanelSection title="Style">
        <Row label="Border"><TextInput value={String(style.border ?? '1px solid #ccc')} onChange={v => set('border', v)} placeholder="1px solid #ccc" /></Row>
        <Row label="Border radius"><NumberInput value={Number(style.borderRadius ?? 8)} onChange={v => set('borderRadius', v)} min={0} max={32} /></Row>
        <Row label="Background"><ColorInput value={String(style.background ?? '#f9f9f9')} onChange={v => set('background', v)} /></Row>
        <Row label="Header bg"><ColorInput value={String(style.headerBackground ?? '#f2f2f2')} onChange={v => set('headerBackground', v)} /></Row>
        <Row label="Border colour"><ColorInput value={String(style.borderColor ?? '#cccccc')} onChange={v => set('borderColor', v)} /></Row>
        <Row label="Label colour"><ColorInput value={String(style.labelColor ?? '#444444')} onChange={v => set('labelColor', v)} /></Row>
        <Row label="Value colour"><ColorInput value={String(style.valueColor ?? '#000000')} onChange={v => set('valueColor', v)} /></Row>
      </PanelSection>
      <FieldManager section={section} sectionId={section.id} fields={section.fields} onMutate={onMutate} />
      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Comments Panel ───────────────────────────────────────────────────────────

function CommentsPanel({ section, onMutate }: { section: DRCECommentsSection; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const { style, items } = section;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sorted = [...(items ?? [])].sort((a, b) => a.order - b.order);

  const commentBindings = AVAILABLE_BINDINGS
    .filter(b => b.group === 'Comments')
    .map(b => ({ label: b.label, value: b.binding }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sorted.map(it => it.id);
    const oi = ids.indexOf(String(active.id));
    const ni = ids.indexOf(String(over.id));
    if (oi === -1 || ni === -1) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(oi, 1);
    reordered.splice(ni, 0, moved);
    onMutate({ type: 'REORDER_COMMENT_ITEMS', sectionId: section.id, ids: reordered });
  }

  return (
    <div className="p-3">
      <PanelSection title="Style">
        <Row label="Ribbon bg"><ColorInput value={style.ribbonBackground} onChange={v => set('ribbonBackground', v)} /></Row>
        <Row label="Ribbon text"><ColorInput value={style.ribbonColor} onChange={v => set('ribbonColor', v)} /></Row>
        <Row label="Ribbon font size"><NumberInput value={style.ribbonFontSize ?? 10} onChange={v => set('ribbonFontSize', v)} min={7} max={20} /></Row>
        <Row label="Text colour"><ColorInput value={style.textColor} onChange={v => set('textColor', v)} /></Row>
        <Row label="Text font size"><NumberInput value={style.textFontSize ?? 10} onChange={v => set('textFontSize', v)} min={7} max={20} /></Row>
        <Row label="Text style">
          <SelectInput value={style.textFontStyle} onChange={v => set('textFontStyle', v)} options={[
            { label: 'Italic', value: 'italic' },
            { label: 'Normal', value: 'normal' },
          ]} />
        </Row>
      </PanelSection>
      <PanelSection title="Comment Items">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map(it => it.id)} strategy={verticalListSortingStrategy}>
            {sorted.map(item => (
              <SortableCommentItem
                key={item.id}
                item={item}
                allBindings={commentBindings}
                onDelete={() => onMutate({ type: 'DELETE_COMMENT_ITEM', sectionId: section.id, itemId: item.id })}
                onPropChange={(path, value) => onMutate({ type: 'SET_COMMENT_ITEM_PROP', sectionId: section.id, itemId: item.id, path, value })}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button type="button"
          className="w-full mt-1 flex items-center justify-center gap-1 text-xs border border-dashed border-indigo-300 dark:border-indigo-600 rounded-lg py-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
          onClick={() => onMutate({
            type: 'ADD_COMMENT_ITEM',
            sectionId: section.id,
            item: {
              id: newItemId(),
              label: 'New Comment',
              binding: 'comments.classTeacher',
              visible: true,
              order: items.length,
            },
          })}>
          <Plus size={12} /> Add Comment Item
        </button>
      </PanelSection>
      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Results Table Panel ──────────────────────────────────────────────────────

function SortableColumn({
  col, onDelete, onPropChange,
}: {
  col: DRCEColumn;
  onDelete: () => void;
  onPropChange: (path: string, value: unknown) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [expanded, setExpanded] = useState(false);
  const bindingOptions = AVAILABLE_BINDINGS
    .filter(b => b.group === 'Subject Result')
    .map(b => ({ label: b.label, value: b.binding }));

  return (
    <div ref={setNodeRef} style={style} className="border border-gray-100 dark:border-slate-700 rounded-lg mb-1.5">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span {...attributes} {...listeners} className="text-gray-400 cursor-grab"><GripVertical size={12} /></span>
        <span className="flex-1 text-xs truncate font-medium">{col.header}</span>
        <button type="button" onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 mr-1">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-gray-50 dark:border-slate-700 pt-1.5">
          <Row label="Header"><TextInput value={col.header} onChange={v => onPropChange('header', v)} /></Row>
          <Row label="Binding">
            <SelectInput value={col.binding} onChange={v => onPropChange('binding', v)} options={bindingOptions} />
          </Row>
          <Row label="Width"><TextInput value={col.width} onChange={v => onPropChange('width', v)} placeholder="15%" /></Row>
          <Row label="Align">
            <SelectInput value={col.align} onChange={v => onPropChange('align', v)} options={[
              { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
            ]} />
          </Row>
        </div>
      )}
    </div>
  );
}

function ResultsTablePanel({ section, onMutate }: {
  section: DRCEResultsTableSection;
  onMutate: (m: DRCEMutation) => void;
}) {
  const { style } = section;
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const sortedCols = [...(section.columns ?? [])].sort((a, b) => a.order - b.order);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sortedCols.map(c => c.id);
    const oi = ids.indexOf(String(active.id));
    const ni = ids.indexOf(String(over.id));
    if (oi === -1 || ni === -1) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(oi, 1);
    reordered.splice(ni, 0, moved);
    onMutate({ type: 'REORDER_COLUMNS', sectionId: section.id, ids: reordered });
  }

  return (
    <div className="p-3">
      <PanelSection title="Filter">
        <Row label="Show subjects">
          <SelectInput
            value={section.subjectFilter ?? 'all'}
            onChange={v => onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'subjectFilter', value: v })}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Primary (core) only', value: 'primary' },
              { label: 'Secondary (electives) only', value: 'secondary' },
            ]}
          />
        </Row>
      </PanelSection>
      <PanelSection title="Columns">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortedCols.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {sortedCols.map(col => (
              <SortableColumn
                key={col.id}
                col={col}
                onDelete={() => onMutate({ type: 'DELETE_COLUMN', sectionId: section.id, columnId: col.id })}
                onPropChange={(path, value) => onMutate({ type: 'SET_COLUMN_PROP', sectionId: section.id, columnId: col.id, path, value })}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button type="button"
          className="w-full mt-1 flex items-center justify-center gap-1 text-xs border border-dashed border-indigo-300 dark:border-indigo-600 rounded-lg py-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
          onClick={() => onMutate({
            type: 'ADD_COLUMN',
            sectionId: section.id,
            column: {
              id: newColumnId(),
              header: 'New Column',
              binding: 'result.subjectName',
              width: '10%',
              visible: true,
              order: section.columns.length,
              align: 'center',
            },
          })}>
          <Plus size={12} /> Add Column
        </button>
      </PanelSection>
      <PanelSection title="Header Style">
        <Row label="Background"><ColorInput value={style.headerBackground} onChange={v => set('headerBackground', v)} /></Row>
        <Row label="Border"><TextInput value={style.headerBorder} onChange={v => set('headerBorder', v)} placeholder="1px solid #ccc" /></Row>
        <Row label="Font size"><NumberInput value={style.headerFontSize} onChange={v => set('headerFontSize', v)} min={7} max={18} /></Row>
        <Row label="Transform">
          <SelectInput value={style.headerTextTransform} onChange={v => set('headerTextTransform', v)} options={[
            { label: 'Uppercase', value: 'uppercase' }, { label: 'None', value: 'none' }, { label: 'Capitalize', value: 'capitalize' },
          ]} />
        </Row>
      </PanelSection>
      <PanelSection title="Row Style">
        <Row label="Border"><TextInput value={style.rowBorder} onChange={v => set('rowBorder', v)} placeholder="1px solid #ccc" /></Row>
        <Row label="Font size"><NumberInput value={style.rowFontSize} onChange={v => set('rowFontSize', v)} min={7} max={18} /></Row>
        <Row label="Cell padding"><NumberInput value={style.padding} onChange={v => set('padding', v)} min={0} max={20} /></Row>
      </PanelSection>
      <PanelSection title="Totals Configuration">
        <Row label="Show totals row">
          <input type="checkbox"
            checked={section.totalsConfig?.enabled ?? true}
            onChange={e => onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'totalsConfig.enabled', value: e.target.checked })}
          />
        </Row>
        <Row label="Label text"><TextInput value={section.totalsConfig?.labelText ?? 'TOTAL'} onChange={v => onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'totalsConfig.labelText', value: v })} /></Row>
        <Row label="Show total obtained">
          <input type="checkbox"
            checked={section.totalsConfig?.showTotalObtained ?? true}
            onChange={e => onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'totalsConfig.showTotalObtained', value: e.target.checked })}
          />
        </Row>
        <Row label="Show total possible">
          <input type="checkbox"
            checked={section.totalsConfig?.showTotalPossible ?? true}
            onChange={e => onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'totalsConfig.showTotalPossible', value: e.target.checked })}
          />
        </Row>
        <Row label="Show percentage">
          <input type="checkbox"
            checked={section.totalsConfig?.showPercentage ?? true}
            onChange={e => onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'totalsConfig.showPercentage', value: e.target.checked })}
          />
        </Row>
        <Row label="Show average">
          <input type="checkbox"
            checked={section.totalsConfig?.showAverage ?? false}
            onChange={e => onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'totalsConfig.showAverage', value: e.target.checked })}
          />
        </Row>
        <Row label="Show grand grade">
          <input type="checkbox"
            checked={section.totalsConfig?.showGrandGrade ?? false}
            onChange={e => onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'totalsConfig.showGrandGrade', value: e.target.checked })}
          />
        </Row>
      </PanelSection>
      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Grade Table Panel ────────────────────────────────────────────────────────

function GradeTablePanel({ section, onMutate }: { section: DRCEGradeTableSection; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const { style } = section;
  const grades: DRCEGradeRow[] = section.grades?.length ? section.grades : DEFAULT_GRADE_ROWS;

  function setGrades(newGrades: DRCEGradeRow[]) {
    onMutate({ type: 'SET_GRADE_ROWS', sectionId: section.id, grades: newGrades });
  }
  function updateGrade(idx: number, field: keyof DRCEGradeRow, value: string | number) {
    const next = grades.map((g, i) => i === idx ? { ...g, [field]: value } : g);
    setGrades(next);
  }
  function addGrade() {
    setGrades([...grades, { label: 'X', min: 0, max: 0, remark: 'New grade' }]);
  }
  function deleteGrade(idx: number) {
    setGrades(grades.filter((_, i) => i !== idx));
  }

  return (
    <div className="p-3">
      <PanelSection title="Style">
        <Row label="Header bg"><ColorInput value={style.headerBackground} onChange={v => set('headerBackground', v)} /></Row>
        <Row label="Border"><TextInput value={style.border} onChange={v => set('border', v)} placeholder="1px solid #ccc" /></Row>
      </PanelSection>
      <PanelSection title="Grade Ranges" defaultOpen={true}>
        <div className="space-y-1.5 mt-1">
          {grades.map((g, idx) => (
            <div key={idx} className="bg-gray-50 dark:bg-slate-800 rounded p-1.5 space-y-1">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={g.label}
                  onChange={e => updateGrade(idx, 'label', e.target.value)}
                  className="w-10 text-xs border rounded px-1 py-0.5 font-bold dark:bg-slate-700 dark:border-slate-600"
                  placeholder="D1"
                />
                <input type="number" value={g.min} onChange={e => updateGrade(idx, 'min', Number(e.target.value))}
                  className="w-12 text-xs border rounded px-1 py-0.5 dark:bg-slate-700 dark:border-slate-600" placeholder="min" />
                <span className="text-xs text-gray-400">–</span>
                <input type="number" value={g.max} onChange={e => updateGrade(idx, 'max', Number(e.target.value))}
                  className="w-12 text-xs border rounded px-1 py-0.5 dark:bg-slate-700 dark:border-slate-600" placeholder="max" />
                <button type="button" onClick={() => deleteGrade(idx)}
                  className="ml-auto text-red-400 hover:text-red-600"><Trash2 size={11} /></button>
              </div>
              <input type="text" value={g.remark} onChange={e => updateGrade(idx, 'remark', e.target.value)}
                className="w-full text-xs border rounded px-1 py-0.5 dark:bg-slate-700 dark:border-slate-600" placeholder="Remark" />
            </div>
          ))}
          <button type="button" onClick={addGrade}
            className="w-full flex items-center justify-center gap-1 py-1 text-xs text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
            <Plus size={11} /> Add Grade
          </button>
        </div>
      </PanelSection>
      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Spacer Panel ─────────────────────────────────────────────────────────────

function SpacerPanel({ section, onMutate }: { section: DRCESection & { type: 'spacer' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  return (
    <div className="p-3">
      <PanelSection title="Dimensions">
        <Row label="Height (px)"><NumberInput value={section.style.height} onChange={v => set('height', v)} min={4} max={200} /></Row>
      </PanelSection>
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Divider Panel ────────────────────────────────────────────────────────────

function DividerPanel({ section, onMutate }: { section: DRCESection & { type: 'divider' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const { style } = section;
  return (
    <div className="p-3">
      <PanelSection title="Style">
        <Row label="Colour"><ColorInput value={style.color} onChange={v => set('color', v)} /></Row>
        <Row label="Thickness"><NumberInput value={style.thickness} onChange={v => set('thickness', v)} min={1} max={12} /></Row>
        <Row label="Margin"><TextInput value={style.margin} onChange={v => set('margin', v)} placeholder="8px 0" /></Row>
      </PanelSection>
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Next Term Begins Panel ───────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// Phase H — Inheritance (parent template) selector
// ───────────────────────────────────────────────────────────────────────────
interface DocOption { id: number; name: string }

function InheritancePanel({ doc }: { doc: DRCEDocument }) {
  const docId = Number(doc.meta.id);
  const hasDbId = Number.isFinite(docId) && docId > 0;
  const [options, setOptions] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [parentId, setParentId] = useState<number | null>(doc.meta.parent_id ?? null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { setParentId(doc.meta.parent_id ?? null); }, [doc.meta.parent_id]);

  useEffect(() => {
    if (!hasDbId) return;
    setLoading(true);
    fetch('/api/dvcf/documents')
      .then(r => r.json())
      .then(data => {
        const docs = Array.isArray(data?.documents) ? data.documents : (Array.isArray(data) ? data : []);
        setOptions(docs
          .filter((d: { id: number }) => Number(d.id) !== docId)
          .map((d: { id: number; name: string }) => ({ id: Number(d.id), name: d.name })));
      })
      .finally(() => setLoading(false));
  }, [docId, hasDbId]);

  if (!hasDbId) return null;

  async function save(nextParent: number | null) {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/dvcf/documents/${docId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: nextParent }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error ?? 'Failed to save parent'); return; }
      setParentId(nextParent);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Inheritance (Phase H)</div>
      <p className="text-[11px] text-gray-500">
        Pick a parent template. Sections from the parent appear automatically;
        sections you author here OVERRIDE matching parent sections by id and
        new ids append. Theme + watermark fall through to the parent when
        unset locally.
      </p>
      {error && <div className="text-[11px] text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded px-2 py-1">{error}</div>}
      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Parent template</span>
        <select
          value={parentId ?? ''}
          disabled={loading || saving}
          onChange={e => save(e.target.value ? Number(e.target.value) : null)}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none"
        >
          <option value="">— none (standalone) —</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.name} (#{o.id})</option>)}
        </select>
      </label>
      {saving && <p className="text-[11px] text-gray-400">Saving…</p>}
      {!saving && parentId && (
        <p className="text-[11px] text-emerald-600">
          Linked to parent #{parentId}. The merged tree is what the renderer/print sees;
          the editor preview deliberately shows only this document's own sections so
          you edit deltas without visual confusion.
        </p>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Phase H — Shared block reference panel
// ───────────────────────────────────────────────────────────────────────────
interface BlockOption { id: number; name: string; kind: string; description: string; school_id: number | null }

function BlockRefPanel({ section, onMutate }: { section: DRCESection & { type: 'block_ref' }; onMutate: (m: DRCEMutation) => void }) {
  const [blocks, setBlocks] = useState<BlockOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/drce/blocks').then(r => r.json()).then(data => {
      if (cancelled) return;
      if (data?.success) setBlocks(data.blocks ?? []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const setBlockId = (id: number) =>
    onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'block_id', value: id });

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Shared block</div>
      <p className="text-[11px] text-gray-500">
        Pick a block from the library. Its contents are inlined at render time;
        editing the block updates every document that references it.
      </p>
      {loading ? (
        <p className="text-[11px] text-gray-400">Loading library…</p>
      ) : blocks.length === 0 ? (
        <p className="text-[11px] text-amber-600">No blocks yet. POST a section to /api/drce/blocks to seed the library.</p>
      ) : (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Block</span>
          <select
            value={section.block_id || ''}
            onChange={e => setBlockId(Number(e.target.value))}
            className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none"
          >
            <option value="">— pick a block —</option>
            {blocks.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} {b.school_id === null ? '· global' : ''} ({b.kind})
              </option>
            ))}
          </select>
        </label>
      )}
      {section.block_id ? (
        <p className="text-[11px] text-gray-500">
          Currently linked: <code className="font-mono">#{section.block_id}</code>
        </p>
      ) : null}
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Phase E — Header block properties panel
// ───────────────────────────────────────────────────────────────────────────
function HeaderBlockPanel({ section, onMutate }: { section: DRCESection & { type: 'header_block' }; onMutate: (m: DRCEMutation) => void }) {
  const setKind = (kind: string) =>
    onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: 'kind', value: kind });
  const setProp = (path: string, value: unknown) =>
    onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path, value });
  const setStyle = (path: string, value: unknown) =>
    onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const s = section.style ?? {};
  const showText  = section.kind === 'custom_text' || section.kind === 'motto';
  const showImage = section.kind === 'custom_image';
  const showQr    = section.kind === 'qr';

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Header block</div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Kind</span>
        <select
          value={section.kind}
          onChange={e => setKind(e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none"
        >
          <option value="logo">Logo (image)</option>
          <option value="school_name">School name</option>
          <option value="arabic_name">Arabic name</option>
          <option value="address">Address</option>
          <option value="contact">Contact</option>
          <option value="center_no">Center number</option>
          <option value="registration_no">Registration number</option>
          <option value="motto">Motto</option>
          <option value="qr">QR code</option>
          <option value="custom_text">Custom text</option>
          <option value="custom_image">Custom image</option>
        </select>
      </label>

      {showText && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Text (supports {'{tokens}'})</span>
          <input value={section.text ?? ''}
            onChange={e => setProp('text', e.target.value)}
            placeholder="e.g. {school_name} | upper"
            className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
        </label>
      )}

      {showImage && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Image URL</span>
          <input value={section.imageUrl ?? ''}
            onChange={e => setProp('imageUrl', e.target.value)}
            placeholder="https://…"
            className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
        </label>
      )}

      {showQr && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">QR value (supports {'{tokens}'})</span>
          <input value={section.qrValue ?? ''}
            onChange={e => setProp('qrValue', e.target.value)}
            placeholder="e.g. https://…/verify/{student.admissionNo}"
            className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Width</span>
          <input value={String(s.width ?? '')}
            onChange={e => setStyle('width', e.target.value ? (isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) : undefined)}
            placeholder="auto" className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Height</span>
          <input value={String(s.height ?? '')}
            onChange={e => setStyle('height', e.target.value ? (isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) : undefined)}
            placeholder="auto" className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
        </label>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Align</span>
        <select value={s.align ?? 'left'} onChange={e => setStyle('align', e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none">
          <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
        </select>
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Font size (px)</span>
        <input type="number" min={6} value={Number(s.fontSize ?? 14)}
          onChange={e => setStyle('fontSize', Number(e.target.value))}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Color</span>
        <input type="color" value={(s.color as string) ?? '#000000'}
          onChange={e => setStyle('color', e.target.value)}
          className="w-full mt-1 h-8 rounded-md bg-gray-100 dark:bg-slate-800" />
      </label>

      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Phase C — Container properties panel
// ───────────────────────────────────────────────────────────────────────────
function ContainerPanel({ section, onMutate }: { section: DRCESection & { type: 'container' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) =>
    onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const s = section.style ?? {};
  const childCount = (section.children ?? []).length;

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Container</div>
      <p className="text-[11px] text-gray-500">{childCount} child{childCount === 1 ? '' : 'ren'}. Add sections inside by selecting this container, then opening the section picker.</p>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Layout</span>
        <select
          value={(s.layout as string) ?? 'stack'}
          onChange={e => set('layout', e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none"
        >
          <option value="stack">Stack (vertical)</option>
          <option value="row">Row (horizontal)</option>
          <option value="grid">Grid</option>
          <option value="absolute">Absolute (free positioning)</option>
        </select>
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Gap (px)</span>
        <input type="number" min={0} value={Number(s.gap ?? 0)}
          onChange={e => set('gap', Number(e.target.value))}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Padding</span>
        <input value={(s.padding as string) ?? ''} placeholder="e.g. 8px or 4px 8px"
          onChange={e => set('padding', e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Background</span>
        <input type="color" value={(s.background as string) ?? '#ffffff'}
          onChange={e => set('background', e.target.value)}
          className="w-full mt-1 h-8 rounded-md bg-gray-100 dark:bg-slate-800" />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-gray-500">Border</span>
        <input value={(s.border as string) ?? ''} placeholder="e.g. 1px solid #ccc"
          onChange={e => set('border', e.target.value)}
          className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
      </label>

      {(s.layout === 'grid') && (
        <>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Grid columns</span>
            <input value={(s.gridTemplateColumns as string) ?? ''} placeholder="e.g. 1fr 1fr or 200px 1fr"
              onChange={e => set('gridTemplateColumns', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Grid rows</span>
            <input value={(s.gridTemplateRows as string) ?? ''} placeholder="auto"
              onChange={e => set('gridTemplateRows', e.target.value)}
              className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
          </label>
        </>
      )}

      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

function ShapePanel({ section, onMutate }: { section: DRCESection & { type: 'shape' }; onMutate: (m: DRCEMutation) => void }) {
  const setShape = (k: string, v: unknown) =>
    onMutate({ type: 'SET_SECTION_PROP', sectionId: section.id, path: `shape.${k}`, value: v });
  const sh = section.shape;
  const isPositioned = sh.type !== 'line' && sh.type !== 'arrow';

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Shape ({sh.type})</div>
      {isPositioned && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Width</span>
            <input type="number" value={Number((sh as { w?: number }).w ?? 0)}
              onChange={e => setShape('w', Number(e.target.value))}
              className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Height</span>
            <input type="number" value={Number((sh as { h?: number }).h ?? 0)}
              onChange={e => setShape('h', Number(e.target.value))}
              className="w-full mt-1 px-2 py-1.5 rounded-md bg-gray-100 dark:bg-slate-800 text-xs outline-none" />
          </label>
        </div>
      )}
      {'fill' in sh && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Fill</span>
          <input type="color" value={(sh as { fill?: string }).fill ?? '#ffffff'}
            onChange={e => setShape('fill', e.target.value)}
            className="w-full mt-1 h-8 rounded-md bg-gray-100 dark:bg-slate-800" />
        </label>
      )}
      {'stroke' in sh && (
        <label className="block">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">Stroke</span>
          <input type="color" value={(sh as { stroke?: string }).stroke ?? '#000000'}
            onChange={e => setShape('stroke', e.target.value)}
            className="w-full mt-1 h-8 rounded-md bg-gray-100 dark:bg-slate-800" />
        </label>
      )}
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

function NextTermBeginsPanel({ section, onMutate }: { section: DRCESection & { type: 'next_term_begins' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const setContent = (key: string, value: string) => onMutate({ type: 'SET_SECTION_CONTENT', sectionId: section.id, key, value });
  const { style, content } = section;
  return (
    <div className="p-3 space-y-4">
      <PanelSection title="Content">
        <Row label="Text"><TextInput value={content.text} onChange={v => setContent('text', v)} placeholder="Next term begins" /></Row>
        <Row label="Custom Date">
          <input
            type="date"
            value={content.customDate || ''}
            onChange={e => {
              const value = e.target.value || undefined; // Convert empty string to undefined
              setContent('customDate', value);
            }}
            className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800"
            placeholder="Leave blank for school-specific default date"
          />
        </Row>
      </PanelSection>
      <PanelSection title="Style">
        <Row label="Background"><ColorInput value={style.background || '#e0f2fe'} onChange={v => set('background', v)} /></Row>
        <Row label="Text Colour"><ColorInput value={style.color || '#0c4a6e'} onChange={v => set('color', v)} /></Row>
        <Row label="Font Size"><NumberInput value={style.fontSize || 14} onChange={v => set('fontSize', v)} min={10} max={24} /></Row>
        <Row label="Font Weight">
          <SelectInput value={String(style.fontWeight || '600')} onChange={v => set('fontWeight', v)} options={[
            { label: 'Normal', value: '400' },
            { label: 'Medium', value: '500' },
            { label: 'Bold', value: '600' },
            { label: 'Extra Bold', value: '700' },
          ]} />
        </Row>
        <Row label="Alignment">
          <SelectInput value={style.textAlign || 'center'} onChange={v => set('textAlign', v)} options={[
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
            { label: 'Right', value: 'right' },
          ]} />
        </Row>
        <Row label="Padding"><TextInput value={style.padding || '10px 12px'} onChange={v => set('padding', v)} placeholder="10px 12px" /></Row>
        <Row label="Border Radius"><NumberInput value={style.borderRadius || 6} onChange={v => set('borderRadius', v)} min={0} max={20} /></Row>
        <Row label="Border Colour"><ColorInput value={style.borderColor || '#06b6d4'} onChange={v => set('borderColor', v)} /></Row>
        <Row label="Border Width"><NumberInput value={style.borderWidth || 1} onChange={v => set('borderWidth', v)} min={0} max={4} /></Row>
        <Row label="Icon"><TextInput value={style.icon || '📅'} onChange={v => set('icon', v)} placeholder="📅" /></Row>
      </PanelSection>
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Theme Panel ─────────────────────────────────────────────────────────────

function ThemePanel({ doc, onMutate }: { doc: DRCEDocument; onMutate: (m: DRCEMutation) => void }) {
  const t = doc.theme || {
    primaryColor: '#0000FF',
    secondaryColor: '#B22222',
    accentColor: '#999999',
    fontFamily: 'Arial, sans-serif',
    baseFontSize: 12,
    pagePadding: '16px 18px',
    pageBackground: '#ffffff',
    pageBorder: { enabled: false, color: '#cccccc', width: 1, style: 'solid' as const, radius: 0 },
    pageSize: 'a4' as const,
    orientation: 'portrait' as const,
  };
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_THEME', path, value });

  return (
    <div className="p-3 space-y-1">
      <PanelSection title="Page Setup">
        <Row label="Size">
          <SelectInput value={t.pageSize ?? 'a4'} onChange={v => set('pageSize', v)} options={[
            { label: 'A4 (210×297mm)', value: 'a4' },
            { label: 'A5 (148×210mm)', value: 'a5' },
            { label: 'A3 (297×420mm)', value: 'a3' },
            { label: 'Letter (215×279mm)', value: 'letter' },
            { label: 'Legal (215×356mm)', value: 'legal' },
          ]} />
        </Row>
        <Row label="Orientation">
          <SelectInput value={t.orientation ?? 'portrait'} onChange={v => set('orientation', v)} options={[
            { label: 'Portrait', value: 'portrait' },
            { label: 'Landscape', value: 'landscape' },
          ]} />
        </Row>
        <Row label="Background"><ColorInput value={t.pageBackground} onChange={v => set('pageBackground', v)} /></Row>
        <Row label="Padding"><TextInput value={t.pagePadding} onChange={v => set('pagePadding', v)} /></Row>
      </PanelSection>
      <PanelSection title="Colours">
        <Row label="Primary"><ColorInput value={t.primaryColor} onChange={v => set('primaryColor', v)} /></Row>
        <Row label="Secondary"><ColorInput value={t.secondaryColor} onChange={v => set('secondaryColor', v)} /></Row>
        <Row label="Accent"><ColorInput value={t.accentColor} onChange={v => set('accentColor', v)} /></Row>
      </PanelSection>
      <PanelSection title="Typography">
        <Row label="Font family"><TextInput value={t.fontFamily} onChange={v => set('fontFamily', v)} /></Row>
        <Row label="Base size (px)"><NumberInput value={t.baseFontSize} onChange={v => set('baseFontSize', v)} min={8} max={24} /></Row>
      </PanelSection>
      <PanelSection title="Page Border" defaultOpen={false}>
        <Row label="Enabled">
          <input type="checkbox" checked={t.pageBorder.enabled} onChange={e => set('pageBorder.enabled', e.target.checked)} className="w-4 h-4" />
        </Row>
        <Row label="Colour"><ColorInput value={t.pageBorder.color} onChange={v => set('pageBorder.color', v)} /></Row>
        <Row label="Width"><NumberInput value={t.pageBorder.width} onChange={v => set('pageBorder.width', v)} min={1} max={12} /></Row>
        <Row label="Style">
          <SelectInput value={t.pageBorder.style} onChange={v => set('pageBorder.style', v)} options={[
            { label: 'Solid', value: 'solid' }, { label: 'Dashed', value: 'dashed' },
            { label: 'Dotted', value: 'dotted' }, { label: 'Double', value: 'double' },
          ]} />
        </Row>
        <Row label="Radius"><NumberInput value={t.pageBorder.radius} onChange={v => set('pageBorder.radius', v)} min={0} max={32} /></Row>
      </PanelSection>
    </div>
  );
}

// ─── Watermark Panel ──────────────────────────────────────────────────────────

function WatermarkPanel({ doc, onMutate }: { doc: DRCEDocument; onMutate: (m: DRCEMutation) => void }) {
  const w = doc.watermark;
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_WATERMARK', path, value });

  return (
    <div className="p-3 space-y-1">
      <Row label="Enabled">
        <input type="checkbox" checked={w.enabled} onChange={e => set('enabled', e.target.checked)} className="w-4 h-4" />
      </Row>
      <Row label="Type">
        <SelectInput value={w.type} onChange={v => set('type', v)} options={[
          { label: 'Text', value: 'text' },
          { label: 'Image', value: 'image' },
          { label: 'QR Code', value: 'qrcode' },
        ]} />
      </Row>
      {w.type === 'text' && (
        <Row label="Text"><TextInput value={w.content} onChange={v => set('content', v)} /></Row>
      )}
      {w.type === 'image' && (
        <Row label="Image URL"><TextInput value={w.imageUrl ?? ''} onChange={v => set('imageUrl', v)} placeholder="https://..." /></Row>
      )}
      {w.type === 'qrcode' && (
        <Row label="QR data"><TextInput value={w.content} onChange={v => set('content', v)} placeholder="URL or text to encode" /></Row>
      )}
      <Row label="Opacity"><NumberInput value={w.opacity} onChange={v => set('opacity', v)} min={0.01} max={1} step={0.01} /></Row>
      <Row label="Rotation"><NumberInput value={w.rotation} onChange={v => set('rotation', v)} min={-180} max={180} /></Row>
      {(w.type === 'text' || w.type === 'qrcode') && (
        <Row label="Font size"><NumberInput value={w.fontSize} onChange={v => set('fontSize', v)} min={24} max={200} /></Row>
      )}
      {w.type === 'text' && (
        <Row label="Colour"><ColorInput value={w.color} onChange={v => set('color', v)} /></Row>
      )}
    </div>
  );
}

// ─── Rules Panel ─────────────────────────────────────────────────────────────

function RulesPanel({ doc, onMutate }: { doc: DRCEDocument; onMutate: (m: DRCEMutation) => void }) {
  const commentRules: DRCECommentRule[] = doc.commentRules ?? [];
  const teacherMappings: DRCETeacherMapping[] = doc.teacherMappings ?? [];

  const addCommentRule = () => {
    const newRule: DRCECommentRule = {
      id: newId('cr'),
      minScore: 0,
      maxScore: 100,
      classTeacher: '',
      dos: '',
      headTeacher: '',
    };
    onMutate({ type: 'SET_COMMENT_RULES', rules: [...commentRules, newRule] });
  };

  const updateCommentRule = (id: string, field: keyof DRCECommentRule, value: string | number) => {
    onMutate({
      type: 'SET_COMMENT_RULES',
      rules: commentRules.map(r => r.id === id ? { ...r, [field]: value } : r),
    });
  };

  const deleteCommentRule = (id: string) => {
    onMutate({ type: 'SET_COMMENT_RULES', rules: commentRules.filter(r => r.id !== id) });
  };

  const addTeacherMapping = () => {
    const newMapping: DRCETeacherMapping = {
      id: newId('tm'),
      subjectPattern: '',
      classPattern: '',
      initials: '',
      teacherName: '',
    };
    onMutate({ type: 'SET_TEACHER_MAPPINGS', mappings: [...teacherMappings, newMapping] });
  };

  const updateTeacherMapping = (id: string, field: keyof DRCETeacherMapping, value: string) => {
    onMutate({
      type: 'SET_TEACHER_MAPPINGS',
      mappings: teacherMappings.map(m => m.id === id ? { ...m, [field]: value } : m),
    });
  };

  const deleteTeacherMapping = (id: string) => {
    onMutate({ type: 'SET_TEACHER_MAPPINGS', mappings: teacherMappings.filter(m => m.id !== id) });
  };

  return (
    <div className="p-3 space-y-4">
      {/* Comment Rules */}
      <PanelSection title="Comment Rules (by score range)">
        <div className="space-y-3">
          {commentRules.map(rule => (
            <div key={rule.id} className="border border-gray-200 dark:border-slate-600 rounded p-2 space-y-1 text-xs">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-gray-500 text-xs flex-1">Score range</span>
                <button type="button" onClick={() => deleteCommentRule(rule.id)}
                  className="text-red-400 hover:text-red-600">
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex gap-1 items-center">
                <input type="number" value={rule.minScore}
                  onChange={e => updateCommentRule(rule.id, 'minScore', Number(e.target.value))}
                  className="w-16 text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800"
                  placeholder="Min" min={0} max={100} />
                <span className="text-gray-400">–</span>
                <input type="number" value={rule.maxScore}
                  onChange={e => updateCommentRule(rule.id, 'maxScore', Number(e.target.value))}
                  className="w-16 text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800"
                  placeholder="Max" min={0} max={100} />
              </div>
              <div>
                <label className="text-gray-400 text-[10px] block mb-0.5">Class Teacher Comment</label>
                <textarea value={rule.classTeacher} rows={2}
                  onChange={e => updateCommentRule(rule.id, 'classTeacher', e.target.value)}
                  className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800 resize-none" />
              </div>
              <div>
                <label className="text-gray-400 text-[10px] block mb-0.5">DOS Comment</label>
                <textarea value={rule.dos} rows={2}
                  onChange={e => updateCommentRule(rule.id, 'dos', e.target.value)}
                  className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800 resize-none" />
              </div>
              <div>
                <label className="text-gray-400 text-[10px] block mb-0.5">Head Teacher Comment</label>
                <textarea value={rule.headTeacher} rows={2}
                  onChange={e => updateCommentRule(rule.id, 'headTeacher', e.target.value)}
                  className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800 resize-none" />
              </div>
            </div>
          ))}
          <button type="button" onClick={addCommentRule}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
            <Plus size={12} /> Add Rule
          </button>
        </div>
      </PanelSection>

      {/* Teacher Mappings */}
      <PanelSection title="Teacher Initials (class + subject fallback)">
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Reports now use Class Subject Assignments first. Add mappings here only as a DRCE fallback for exact class/subject initials.
          </p>
          {teacherMappings.map(mapping => (
            <div key={mapping.id} className="border border-gray-200 dark:border-slate-600 rounded p-2 space-y-1 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-xs flex-1">Mapping</span>
                <button type="button" onClick={() => deleteTeacherMapping(mapping.id)}
                  className="text-red-400 hover:text-red-600">
                  <Trash2 size={12} />
                </button>
              </div>
              <div>
                <label className="text-gray-400 text-[10px] block mb-0.5">Subject (contains)</label>
                <input type="text" value={mapping.subjectPattern}
                  onChange={e => updateTeacherMapping(mapping.id, 'subjectPattern', e.target.value)}
                  placeholder="e.g. MATH"
                  className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800" />
              </div>
              <div>
                <label className="text-gray-400 text-[10px] block mb-0.5">Class (contains, blank = all)</label>
                <input type="text" value={mapping.classPattern}
                  onChange={e => updateTeacherMapping(mapping.id, 'classPattern', e.target.value)}
                  placeholder="e.g. P7"
                  className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800" />
              </div>
              <div className="flex gap-1">
                <div className="flex-1">
                  <label className="text-gray-400 text-[10px] block mb-0.5">Initials</label>
                  <input type="text" value={mapping.initials}
                    onChange={e => updateTeacherMapping(mapping.id, 'initials', e.target.value)}
                    placeholder="e.g. E.L"
                    className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800" />
                </div>
                <div className="flex-1">
                  <label className="text-gray-400 text-[10px] block mb-0.5">Teacher Name</label>
                  <input type="text" value={mapping.teacherName}
                    onChange={e => updateTeacherMapping(mapping.id, 'teacherName', e.target.value)}
                    placeholder="e.g. Luke Ewayu"
                    className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-800" />
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addTeacherMapping}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
            <Plus size={12} /> Add Mapping
          </button>
        </div>
      </PanelSection>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface Props {
  doc: DRCEDocument;
  selectedSectionId: string | null;
  onMutate: (m: DRCEMutation) => void;
  activeTab: 'section' | 'theme' | 'watermark' | 'rules';
  onTabChange: (t: 'section' | 'theme' | 'watermark' | 'rules') => void;
}

/**
 * P2 — visibility rule sub-panel shown beneath every per-type editor.
 * Stored at `section.visibilityRule` and emitted via SET_SECTION_PROP so
 * the existing deep-walking mutation path (Phase 0 fix C1) handles
 * container-nested sections too.
 */
function VisibilitySection({ section, onMutate }: {
  section: DRCESection;
  onMutate: (m: DRCEMutation) => void;
}) {
  const rule = (section as DRCESection & { visibilityRule?: VisibilityRule | null }).visibilityRule ?? null;
  return (
    <div className="border-t border-gray-100 dark:border-slate-700 p-3 mt-2">
      <h4 className="text-[10px] uppercase tracking-wide text-gray-500 mb-2 font-semibold">Conditional visibility</h4>
      <VisibilityRuleEditor
        value={rule}
        onChange={next => onMutate({
          type: 'SET_SECTION_PROP', sectionId: section.id,
          path: 'visibilityRule', value: next,
        })}
      />
    </div>
  );
}

export function PropertiesPanel({ doc, selectedSectionId, onMutate, activeTab, onTabChange }: Props) {
  // Recurse so nested children (inside containers) can be selected from the
  // section list and surface their properties here.
  const findDeep = (arr: DRCESection[]): DRCESection | null => {
    for (const s of arr) {
      if (s.id === selectedSectionId) return s;
      if (s.type === 'container') {
        const hit = findDeep((s as { children?: DRCESection[] }).children ?? []);
        if (hit) return hit;
      }
    }
    return null;
  };
  const selectedSection = selectedSectionId ? findDeep(doc.sections) : null;

  const tabs = [
    { id: 'section' as const,   icon: <Layers size={14} />,  label: 'Section' },
    { id: 'theme' as const,     icon: <Palette size={14} />, label: 'Theme' },
    { id: 'watermark' as const, icon: <Type size={14} />,    label: 'Mark' },
    { id: 'rules' as const,     icon: <Plus size={14} />,    label: 'Rules' },
  ];

  function renderSectionPanel() {
    if (!selectedSection) {
      return (
        <div className="p-4 text-xs text-gray-400 text-center mt-8">
          Click a section in the preview<br />or section list to edit it.
        </div>
      );
    }
    switch (selectedSection.type) {
      case 'header':        return <HeaderPanel        section={selectedSection as DRCESection & { type: 'header' }}        onMutate={onMutate} />;
      case 'banner':        return <BannerPanel        section={selectedSection as DRCESection & { type: 'banner' }}        onMutate={onMutate} />;
      case 'ribbon':        return <RibbonPanel        section={selectedSection as DRCESection & { type: 'ribbon' }}        onMutate={onMutate} />;
      case 'student_info':  return <StudentInfoPanel   section={selectedSection as DRCEStudentInfoSection}                  onMutate={onMutate} />;
      case 'assessment':    return <AssessmentPanel    section={selectedSection as DRCEAssessmentSection}                   onMutate={onMutate} />;
      case 'results_table': return <ResultsTablePanel  section={selectedSection as DRCEResultsTableSection}                 onMutate={onMutate} />;
      case 'comments':      return <CommentsPanel      section={selectedSection as DRCECommentsSection}                     onMutate={onMutate} />;
      case 'grade_table':   return <GradeTablePanel    section={selectedSection as DRCEGradeTableSection}                   onMutate={onMutate} />;
      case 'spacer':        return <SpacerPanel        section={selectedSection as DRCESection & { type: 'spacer' }}        onMutate={onMutate} />;
      case 'divider':       return <DividerPanel       section={selectedSection as DRCESection & { type: 'divider' }}       onMutate={onMutate} />;
      case 'next_term_begins': return <NextTermBeginsPanel section={selectedSection as DRCESection & { type: 'next_term_begins' }} onMutate={onMutate} />;
      case 'container':     return <ContainerPanel     section={selectedSection as DRCESection & { type: 'container' }}     onMutate={onMutate} />;
      case 'shape':         return <ShapePanel         section={selectedSection as DRCESection & { type: 'shape' }}         onMutate={onMutate} />;
      case 'header_block':  return <HeaderBlockPanel   section={selectedSection as DRCESection & { type: 'header_block' }}  onMutate={onMutate} />;
      case 'block_ref':     return <BlockRefPanel      section={selectedSection as DRCESection & { type: 'block_ref' }}     onMutate={onMutate} />;
      case 'table':         return <TablePropertiesPanel section={selectedSection as DRCESection & { type: 'table' }}        onMutate={onMutate} />;
      default:              return (
        <div className="p-4 text-center text-xs text-gray-400">
          <p>No properties for</p>
          <p className="font-semibold mt-1">{(selectedSection as DRCESection).type}</p>
          <DeleteSectionBtn section={selectedSection} onMutate={onMutate} />
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-100 dark:border-slate-700">
        {tabs.map(tab => (
          <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)}
            className={[
              'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            ].join(' ')}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'theme'     && <><ThemePanel     doc={doc} onMutate={onMutate} /><InheritancePanel doc={doc} /></>}
        {activeTab === 'watermark' && <WatermarkPanel doc={doc} onMutate={onMutate} />}
        {activeTab === 'rules'     && <RulesPanel     doc={doc} onMutate={onMutate} />}
        {activeTab === 'section'   && (
          <>
            {renderSectionPanel()}
            {selectedSection && (
              <VisibilitySection
                section={selectedSection}
                onMutate={onMutate}
              />
            )}
            {selectedSection && <MoveToPicker section={selectedSection} doc={doc} onMutate={onMutate} />}
          </>
        )}
      </div>
    </div>
  );
}
