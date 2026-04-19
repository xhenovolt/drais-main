// src/components/drce/editor/PropertiesPanel.tsx
// Right-side panel: per-section + theme + watermark property controls.
// Full coverage: every section type, field management, comment items, spacing.
'use client';

import React, { useState } from 'react';
import type {
  DRCEDocument, DRCESection, DRCEMutation,
  DRCEResultsTableSection, DRCEColumn,
  DRCEStudentInfoSection, DRCEAssessmentSection, DRCECommentsSection,
  DRCEField, DRCECommentItem,
} from '@/lib/drce/schema';
import { AVAILABLE_BINDINGS } from '@/lib/drce/bindingResolver';
import { Palette, Type, Layers, GripVertical, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
}) {
  return (
    <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
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
  const style = section.style as Record<string, unknown>;
  const set = (k: string, v: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path: k, value: v });
  return (
    <PanelSection title="Spacing" defaultOpen={false}>
      <Row label="Margin top"><NumberInput value={Number(style.spacingTop ?? 0)} onChange={v => set('spacingTop', v)} min={0} max={100} /></Row>
      <Row label="Margin bottom"><NumberInput value={Number(style.spacingBottom ?? 0)} onChange={v => set('spacingBottom', v)} min={0} max={100} /></Row>
    </PanelSection>
  );
}

// ─── Shared: Delete Section ───────────────────────────────────────────────────

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
  const sorted = [...fields].sort((a, b) => a.order - b.order);

  const allBindings = AVAILABLE_BINDINGS
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
            id: `field-${Date.now()}`,
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
    <div className="p-3">
      <PanelSection title="Layout">
        <Row label="Layout">
          <SelectInput value={style.layout} onChange={v => set('layout', v)} options={[
            { label: 'Three Column', value: 'three-column' },
            { label: 'Centered', value: 'centered' },
            { label: 'Left Logo', value: 'left-logo' },
          ]} />
        </Row>
        <Row label="Padding bottom"><NumberInput value={style.paddingBottom} onChange={v => set('paddingBottom', v)} min={0} max={40} /></Row>
        <Row label="Opacity"><NumberInput value={style.opacity} onChange={v => set('opacity', v)} min={0.1} max={1} step={0.05} /></Row>
        <Row label="Border bottom"><TextInput value={style.borderBottom} onChange={v => set('borderBottom', v)} placeholder="1px solid #eee" /></Row>
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
      <PanelSection title="Style">
        <Row label="Border"><TextInput value={String(style.border ?? '1px solid #ccc')} onChange={v => set('border', v)} /></Row>
        <Row label="Border radius"><NumberInput value={Number(style.borderRadius ?? 8)} onChange={v => set('borderRadius', v)} min={0} max={32} /></Row>
        <Row label="Padding"><TextInput value={String(style.padding ?? '10px 20px')} onChange={v => set('padding', v)} /></Row>
        <Row label="Background"><ColorInput value={String(style.background ?? '#f9f9f9')} onChange={v => set('background', v)} /></Row>
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
  const sorted = [...items].sort((a, b) => a.order - b.order);

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
        <Row label="Text colour"><ColorInput value={style.textColor} onChange={v => set('textColor', v)} /></Row>
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
              id: `ci-${Date.now()}`,
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
  const sortedCols = [...section.columns].sort((a, b) => a.order - b.order);

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
              id: `col-${Date.now()}`,
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
      <SpacingSection section={section} onMutate={onMutate} />
      <DeleteSectionBtn section={section} onMutate={onMutate} />
    </div>
  );
}

// ─── Grade Table Panel ────────────────────────────────────────────────────────

function GradeTablePanel({ section, onMutate }: { section: DRCESection & { type: 'grade_table' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const { style } = section;
  return (
    <div className="p-3">
      <PanelSection title="Style">
        <Row label="Header bg"><ColorInput value={style.headerBackground} onChange={v => set('headerBackground', v)} /></Row>
        <Row label="Border"><TextInput value={style.border} onChange={v => set('border', v)} placeholder="1px solid #ccc" /></Row>
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

// ─── Theme Panel ─────────────────────────────────────────────────────────────

function ThemePanel({ doc, onMutate }: { doc: DRCEDocument; onMutate: (m: DRCEMutation) => void }) {
  const t = doc.theme;
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_THEME', path, value });

  return (
    <div className="p-3 space-y-1">
      <PanelSection title="Colours">
        <Row label="Primary"><ColorInput value={t.primaryColor} onChange={v => set('primaryColor', v)} /></Row>
        <Row label="Secondary"><ColorInput value={t.secondaryColor} onChange={v => set('secondaryColor', v)} /></Row>
        <Row label="Accent"><ColorInput value={t.accentColor} onChange={v => set('accentColor', v)} /></Row>
        <Row label="Background"><ColorInput value={t.pageBackground} onChange={v => set('pageBackground', v)} /></Row>
      </PanelSection>
      <PanelSection title="Typography">
        <Row label="Font family"><TextInput value={t.fontFamily} onChange={v => set('fontFamily', v)} /></Row>
        <Row label="Base size (px)"><NumberInput value={t.baseFontSize} onChange={v => set('baseFontSize', v)} min={8} max={24} /></Row>
      </PanelSection>
      <PanelSection title="Page">
        <Row label="Padding"><TextInput value={t.pagePadding} onChange={v => set('pagePadding', v)} /></Row>
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
          { label: 'Text', value: 'text' }, { label: 'Image', value: 'image' },
        ]} />
      </Row>
      {w.type === 'text' && (
        <Row label="Text"><TextInput value={w.content} onChange={v => set('content', v)} /></Row>
      )}
      <Row label="Opacity"><NumberInput value={w.opacity} onChange={v => set('opacity', v)} min={0.01} max={1} step={0.01} /></Row>
      <Row label="Rotation"><NumberInput value={w.rotation} onChange={v => set('rotation', v)} min={-180} max={180} /></Row>
      <Row label="Font size"><NumberInput value={w.fontSize} onChange={v => set('fontSize', v)} min={24} max={200} /></Row>
      <Row label="Colour"><ColorInput value={w.color} onChange={v => set('color', v)} /></Row>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface Props {
  doc: DRCEDocument;
  selectedSectionId: string | null;
  onMutate: (m: DRCEMutation) => void;
  activeTab: 'section' | 'theme' | 'watermark';
  onTabChange: (t: 'section' | 'theme' | 'watermark') => void;
}

export function PropertiesPanel({ doc, selectedSectionId, onMutate, activeTab, onTabChange }: Props) {
  const selectedSection = selectedSectionId
    ? doc.sections.find(s => s.id === selectedSectionId) ?? null
    : null;

  const tabs = [
    { id: 'section' as const,   icon: <Layers size={14} />,  label: 'Section' },
    { id: 'theme' as const,     icon: <Palette size={14} />, label: 'Theme' },
    { id: 'watermark' as const, icon: <Type size={14} />,    label: 'Mark' },
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
      case 'grade_table':   return <GradeTablePanel    section={selectedSection as DRCESection & { type: 'grade_table' }}   onMutate={onMutate} />;
      case 'spacer':        return <SpacerPanel        section={selectedSection as DRCESection & { type: 'spacer' }}        onMutate={onMutate} />;
      case 'divider':       return <DividerPanel       section={selectedSection as DRCESection & { type: 'divider' }}       onMutate={onMutate} />;
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
        {activeTab === 'theme'     && <ThemePanel     doc={doc} onMutate={onMutate} />}
        {activeTab === 'watermark' && <WatermarkPanel doc={doc} onMutate={onMutate} />}
        {activeTab === 'section'   && renderSectionPanel()}
      </div>
    </div>
  );
}
