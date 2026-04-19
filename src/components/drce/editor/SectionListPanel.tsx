// src/components/drce/editor/SectionListPanel.tsx
'use client';

import React from 'react';
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
import { GripVertical, Eye, EyeOff } from 'lucide-react';
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

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
      <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Sections
        </span>
      </div>
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
