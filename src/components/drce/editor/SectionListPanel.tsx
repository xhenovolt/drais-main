// src/components/drce/editor/SectionListPanel.tsx
'use client';

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Plus, X } from 'lucide-react';
import type { DRCESection, DRCEMutation } from '@/lib/drce/schema';

interface Props {
  sections: DRCESection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMutate: (m: DRCEMutation) => void;
}

const SECTION_LABELS: Record<string, string> = {
  header:       'Header',
  banner:       'Banner',
  student_info: 'Student Info',
  ribbon:       'Ribbon',
  results_table:'Results Table',
  assessment:   'Assessment',
  comments:     'Comments',
  grade_table:  'Grade Table',
  spacer:       'Spacer',
  divider:      'Divider',
};

const SECTION_ICONS: Record<string, string> = {
  header:       '🏫',
  banner:       '🎗️',
  student_info: '👤',
  ribbon:       '📌',
  results_table:'📊',
  assessment:   '📈',
  comments:     '💬',
  grade_table:  '🔢',
  spacer:       '↕️',
  divider:      '➖',
};

function SortableItem({
  section, isSelected, onSelect, onToggle,
}: {
  section: DRCESection;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer select-none text-sm',
        isSelected
          ? 'bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-600'
          : 'hover:bg-gray-50 dark:hover:bg-slate-700 border border-transparent',
        !section.visible ? 'opacity-40' : '',
      ].join(' ')}
      onClick={onSelect}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </span>

      <span className="text-base leading-none">{SECTION_ICONS[section.type] ?? '📄'}</span>
      <span className="flex-1 truncate font-medium">{SECTION_LABELS[section.type] ?? section.type}</span>

      {/* Visibility toggle */}
      <button
        type="button"
        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        onClick={e => { e.stopPropagation(); onToggle(); }}
        title={section.visible ? 'Hide section' : 'Show section'}
      >
        {section.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
    </div>
  );
}

export function SectionListPanel({ sections, selectedId, onSelect, onMutate }: Props) {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const [showPicker, setShowPicker] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const ADDABLE_SECTIONS: { type: string; label: string; icon: string }[] = [
    { type: 'banner',        label: 'Banner',        icon: '🎗️' },
    { type: 'ribbon',        label: 'Ribbon',        icon: '📌' },
    { type: 'student_info',  label: 'Student Info',  icon: '👤' },
    { type: 'results_table', label: 'Results Table', icon: '📊' },
    { type: 'assessment',    label: 'Assessment',    icon: '📈' },
    { type: 'comments',      label: 'Comments',      icon: '💬' },
    { type: 'grade_table',   label: 'Grade Table',   icon: '🔢' },
    { type: 'spacer',        label: 'Spacer',        icon: '↕️' },
    { type: 'divider',       label: 'Divider',       icon: '➖' },
    { type: 'header',        label: 'Header',        icon: '🏫' },
  ];

  function buildNewSection(type: string): DRCESection {
    const id = `${type}-${Date.now()}`;
    const base = { id, visible: true, order: sections.length };
    switch (type) {
      case 'banner':
        return { ...base, type: 'banner', content: { text: 'New Banner' },
          style: { backgroundColor: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 'bold',
            textAlign: 'center', padding: '8px', letterSpacing: '0.05em',
            textTransform: 'uppercase', borderRadius: 0 } } as DRCESection;
      case 'ribbon':
        return { ...base, type: 'ribbon', content: { text: 'New Ribbon', shape: 'flat' },
          style: { background: '#e5e7eb', color: '#111', fontWeight: 'bold',
            fontSize: 13, padding: '4px 0', textAlign: 'center' } } as DRCESection;
      case 'student_info':
        return { ...base, type: 'student_info',
          fields: [{ id: `f-${Date.now()}`, label: 'Name', binding: 'student.fullName', visible: true, order: 0 }],
          style: { border: '1px solid #ccc', borderRadius: 4, padding: '12px 14px',
            background: '#f9f9f9', labelColor: '#555', valueColor: '#000',
            valueFontWeight: 'bold', valueFontSize: 13 } } as DRCESection;
      case 'results_table':
        return { ...base, type: 'results_table',
          columns: [
            { id: `col-${Date.now()}-1`, header: 'Subject', binding: 'result.subjectName', width: '30%', visible: true, order: 0, align: 'left' },
            { id: `col-${Date.now()}-2`, header: 'Grade',   binding: 'result.grade',       width: '15%', visible: true, order: 1, align: 'center' },
          ],
          style: { headerBackground: '#e5e7eb', headerBorder: '1px solid #ccc',
            rowBorder: '1px solid #ddd', headerFontSize: 11, rowFontSize: 11,
            headerTextTransform: 'uppercase', padding: 4 } } as DRCESection;
      case 'assessment':
        return { ...base, type: 'assessment',
          fields: [{ id: `af-${Date.now()}`, label: 'Class Position', binding: 'assessment.classPosition', visible: true, order: 0 }],
          style: {} } as DRCESection;
      case 'comments':
        return { ...base, type: 'comments',
          items: [{ id: `ci-${Date.now()}`, label: 'Teacher Comment', binding: 'comments.classTeacher', visible: true, order: 0 }],
          style: { ribbonBackground: '#6b7280', ribbonColor: '#fff', textColor: '#333', textFontStyle: 'italic' } } as DRCESection;
      case 'grade_table':
        return { ...base, type: 'grade_table',
          style: { headerBackground: '#e5e7eb', border: '1px solid #ccc' } } as DRCESection;
      case 'spacer':
        return { ...base, type: 'spacer', style: { height: 20 } } as DRCESection;
      case 'divider':
        return { ...base, type: 'divider', style: { color: '#cccccc', thickness: 1, margin: '8px 0' } } as DRCESection;
      case 'header':
        return { ...base, type: 'header',
          style: { layout: 'three-column', paddingBottom: 10, borderBottom: '1px solid #eee', opacity: 1 } } as DRCESection;
      default:
        return { ...base, type: 'spacer', style: { height: 16 } } as DRCESection;
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sorted.map(s => s.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = [...ids];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    onMutate({ type: 'REORDER_SECTIONS', ids: reordered });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Sections
        </span>
        <button
          type="button"
          title="Add section"
          onClick={() => setShowPicker(v => !v)}
          className="w-6 h-6 flex items-center justify-center rounded-md bg-indigo-50 dark:bg-indigo-900/40 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-800/60"
        >
          {showPicker ? <X size={13} /> : <Plus size={13} />}
        </button>
      </div>

      {/* Section picker */}
      {showPicker && (
        <div className="p-2 border-b border-gray-100 dark:border-slate-700 bg-indigo-50/50 dark:bg-indigo-900/10">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium px-1">Add section:</p>
          <div className="grid grid-cols-2 gap-1">
            {ADDABLE_SECTIONS.map(s => (
              <button
                key={s.type}
                type="button"
                className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left"
                onClick={() => {
                  onMutate({ type: 'ADD_SECTION', section: buildNewSection(s.type), afterId: null });
                  setShowPicker(false);
                }}
              >
                <span>{s.icon}</span>
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {sorted.map(section => (
              <SortableItem
                key={section.id}
                section={section}
                isSelected={selectedId === section.id}
                onSelect={() => onSelect(section.id)}
                onToggle={() => onMutate({ type: 'TOGGLE_SECTION', sectionId: section.id })}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
