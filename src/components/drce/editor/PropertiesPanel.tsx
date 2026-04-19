// src/components/drce/editor/PropertiesPanel.tsx
// Right-side panel: shows property controls for the selected section or theme.
'use client';

import React, { useState } from 'react';
import type {
  DRCEDocument, DRCESection, DRCEMutation,
  DRCEResultsTableSection, DRCEColumn,
} from '@/lib/drce/schema';
import { AVAILABLE_BINDINGS } from '@/lib/drce/bindingResolver';
import { Palette, Type, Layers, Table2, GripVertical, Trash2, Plus } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Small primitives ────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <label className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800 font-mono" />
    </div>
  );
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      min={min} max={max}
      className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800"
    />
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800"
    />
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full text-xs border border-gray-200 dark:border-slate-600 rounded px-2 py-1 bg-white dark:bg-slate-800">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-100 dark:border-slate-700 rounded-lg mb-3 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-slate-800 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300"
        onClick={() => setOpen(v => !v)}
      >
        {title}
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-3">{children}</div>}
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
        <SelectInput value={w.type} onChange={v => set('type', v)} options={[{ label: 'Text', value: 'text' }, { label: 'Image', value: 'image' }]} />
      </Row>
      {w.type === 'text' && (
        <Row label="Text"><TextInput value={w.content} onChange={v => set('content', v)} /></Row>
      )}
      <Row label="Opacity"><NumberInput value={w.opacity} onChange={v => set('opacity', v)} min={0.01} max={1} /></Row>
      <Row label="Rotation"><NumberInput value={w.rotation} onChange={v => set('rotation', v)} min={-180} max={180} /></Row>
      <Row label="Font size"><NumberInput value={w.fontSize} onChange={v => set('fontSize', v)} min={24} max={200} /></Row>
      <Row label="Colour"><ColorInput value={w.color} onChange={v => set('color', v)} /></Row>
    </div>
  );
}

// ─── Banner Section Panel ────────────────────────────────────────────────────

function BannerPanel({ section, onMutate }: { section: DRCESection & { type: 'banner' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const setContent = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_CONTENT', sectionId: section.id, path, value });
  const { style } = section;

  return (
    <div className="p-3">
      <PanelSection title="Content">
        <Row label="Text"><TextInput value={section.content.text} onChange={v => setContent('text', v)} /></Row>
      </PanelSection>
      <PanelSection title="Style">
        <Row label="Background"><ColorInput value={style.backgroundColor} onChange={v => set('backgroundColor', v)} /></Row>
        <Row label="Text colour"><ColorInput value={style.color} onChange={v => set('color', v)} /></Row>
        <Row label="Font size"><NumberInput value={style.fontSize} onChange={v => set('fontSize', v)} min={8} max={36} /></Row>
        <Row label="Alignment">
          <SelectInput value={style.textAlign} onChange={v => set('textAlign', v)} options={[{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' }]} />
        </Row>
        <Row label="Letter spacing"><TextInput value={style.letterSpacing} onChange={v => set('letterSpacing', v)} /></Row>
        <Row label="Transform">
          <SelectInput value={style.textTransform} onChange={v => set('textTransform', v)} options={[{ label: 'Uppercase', value: 'uppercase' }, { label: 'None', value: 'none' }, { label: 'Capitalize', value: 'capitalize' }]} />
        </Row>
      </PanelSection>
    </div>
  );
}

// ─── Ribbon Section Panel ────────────────────────────────────────────────────

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
      <PanelSection title="Style">
        <Row label="Background"><ColorInput value={style.background} onChange={v => set('background', v)} /></Row>
        <Row label="Text colour"><ColorInput value={style.color} onChange={v => set('color', v)} /></Row>
        <Row label="Font size"><NumberInput value={style.fontSize} onChange={v => set('fontSize', v)} min={8} max={24} /></Row>
      </PanelSection>
    </div>
  );
}

// ─── Results Table Panel — column manager ────────────────────────────────────

function SortableColumn({
  col, onDelete, onPropChange,
}: {
  col: DRCEColumn;
  onDelete: () => void;
  onPropChange: (path: string, value: unknown) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const bindingOptions = AVAILABLE_BINDINGS
    .filter(b => b.group === 'Subject Result')
    .map(b => ({ label: b.label, value: b.binding }));

  return (
    <div ref={setNodeRef} style={style} className="border border-gray-100 dark:border-slate-700 rounded-lg p-2 mb-2 text-xs">
      <div className="flex items-center gap-1 mb-1.5">
        <span {...attributes} {...listeners} className="text-gray-400 cursor-grab"><GripVertical size={12} /></span>
        <span className="flex-1 font-semibold truncate">{col.header}</span>
        <button type="button" onClick={onDelete} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
      </div>
      <Row label="Header"><TextInput value={col.header} onChange={v => onPropChange('header', v)} /></Row>
      <Row label="Binding">
        <SelectInput value={col.binding} onChange={v => onPropChange('binding', v)} options={bindingOptions} />
      </Row>
      <Row label="Width"><TextInput value={col.width} onChange={v => onPropChange('width', v)} /></Row>
      <Row label="Align">
        <SelectInput value={col.align} onChange={v => onPropChange('align', v)} options={[
          { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' },
        ]} />
      </Row>
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
        <button
          type="button"
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
          })}
        >
          <Plus size={12} /> Add Column
        </button>
      </PanelSection>
      <PanelSection title="Table Style">
        <Row label="Header bg"><ColorInput value={style.headerBackground} onChange={v => set('headerBackground', v)} /></Row>
        <Row label="Row border"><TextInput value={style.rowBorder} onChange={v => set('rowBorder', v)} /></Row>
        <Row label="Header size"><NumberInput value={style.headerFontSize} onChange={v => set('headerFontSize', v)} min={7} max={18} /></Row>
        <Row label="Row size"><NumberInput value={style.rowFontSize} onChange={v => set('rowFontSize', v)} min={7} max={18} /></Row>
        <Row label="Padding"><NumberInput value={style.padding} onChange={v => set('padding', v)} min={0} max={20} /></Row>
      </PanelSection>
    </div>
  );
}

// ─── Student Info Panel ──────────────────────────────────────────────────────

function StudentInfoPanel({ section, onMutate }: { section: DRCESection & { type: 'student_info' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const { style } = section;

  return (
    <div className="p-3">
      <PanelSection title="Style">
        <Row label="Label colour"><ColorInput value={style.labelColor} onChange={v => set('labelColor', v)} /></Row>
        <Row label="Value colour"><ColorInput value={style.valueColor} onChange={v => set('valueColor', v)} /></Row>
        <Row label="Value size"><NumberInput value={style.valueFontSize} onChange={v => set('valueFontSize', v)} min={8} max={24} /></Row>
        <Row label="Background"><ColorInput value={style.background} onChange={v => set('background', v)} /></Row>
        <Row label="Border"><TextInput value={style.border} onChange={v => set('border', v)} /></Row>
      </PanelSection>
    </div>
  );
}

// ─── Comments Panel ──────────────────────────────────────────────────────────

function CommentsPanel({ section, onMutate }: { section: DRCESection & { type: 'comments' }; onMutate: (m: DRCEMutation) => void }) {
  const set = (path: string, value: unknown) => onMutate({ type: 'SET_SECTION_STYLE', sectionId: section.id, path, value });
  const { style } = section;

  return (
    <div className="p-3">
      <PanelSection title="Style">
        <Row label="Ribbon bg"><ColorInput value={style.ribbonBackground} onChange={v => set('ribbonBackground', v)} /></Row>
        <Row label="Ribbon text"><ColorInput value={style.ribbonColor} onChange={v => set('ribbonColor', v)} /></Row>
        <Row label="Text colour"><ColorInput value={style.textColor} onChange={v => set('textColor', v)} /></Row>
        <Row label="Text style">
          <SelectInput value={style.textFontStyle} onChange={v => set('textFontStyle', v)} options={[{ label: 'Italic', value: 'italic' }, { label: 'Normal', value: 'normal' }]} />
        </Row>
      </PanelSection>
    </div>
  );
}

// ─── Generic fallback panel ───────────────────────────────────────────────────

function GenericPanel({ section }: { section: DRCESection }) {
  return (
    <div className="p-4 text-center text-xs text-gray-400">
      <p>No editable properties for</p>
      <p className="font-semibold mt-1">{section.type}</p>
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
    { id: 'watermark' as const, icon: <Type size={14} />,    label: 'Watermark' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100 dark:border-slate-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={[
              'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            ].join(' ')}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'theme' && <ThemePanel doc={doc} onMutate={onMutate} />}
        {activeTab === 'watermark' && <WatermarkPanel doc={doc} onMutate={onMutate} />}
        {activeTab === 'section' && (
          selectedSection ? (() => {
            switch (selectedSection.type) {
              case 'banner':        return <BannerPanel        section={selectedSection as DRCESection & { type: 'banner' }}        onMutate={onMutate} />;
              case 'ribbon':        return <RibbonPanel        section={selectedSection as DRCESection & { type: 'ribbon' }}        onMutate={onMutate} />;
              case 'results_table': return <ResultsTablePanel  section={selectedSection as DRCEResultsTableSection}                 onMutate={onMutate} />;
              case 'student_info':  return <StudentInfoPanel   section={selectedSection as DRCESection & { type: 'student_info' }}  onMutate={onMutate} />;
              case 'comments':      return <CommentsPanel      section={selectedSection as DRCESection & { type: 'comments' }}      onMutate={onMutate} />;
              default:              return <GenericPanel section={selectedSection} />;
            }
          })()
          : (
            <div className="p-4 text-xs text-gray-400 text-center mt-8">
              Click a section in the preview<br />or section list to edit it.
            </div>
          )
        )}
      </div>
    </div>
  );
}
