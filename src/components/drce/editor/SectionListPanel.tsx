// src/components/drce/editor/SectionListPanel.tsx
'use client';

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Plus, X } from 'lucide-react';
import type { DRCESection, DRCEMutation, DRCEContainerSection } from '@/lib/drce/schema';
import { newSectionId, newFieldId, newColumnId, newItemId, newShapeId } from '@/lib/drce/ids';

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
  next_term_begins: 'Next Term Begins',
  container:    'Container',
  shape:        'Shape',
  header_block: 'Header block',
  block_ref:    'Shared block',
  table:        'Table',
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
  next_term_begins: '📅',
  container:    '🧱',
  shape:        '⬛',
  header_block: '🧩',
  block_ref:    '📚',
  table:        '🧮',
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
    { type: 'next_term_begins', label: 'Next Term Begins', icon: '📅' },
    { type: 'spacer',        label: 'Spacer',        icon: '↕️' },
    { type: 'divider',       label: 'Divider',       icon: '➖' },
    { type: 'header',        label: 'Header',        icon: '🏫' },
    { type: 'header_block',  label: 'Header block',  icon: '🧩' },
    { type: 'container',     label: 'Container',     icon: '🧱' },
    { type: 'shape',         label: 'Shape',         icon: '⬛' },
    { type: 'block_ref',     label: 'Shared block',  icon: '📚' },
    { type: 'table',         label: 'Table (grid)',  icon: '🧮' },
  ];

  function buildNewSection(type: string): DRCESection {
    // Phase 0 fix H4 — collision-free IDs (was `${type}-${Date.now()}`).
    const id = newSectionId(type);
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
          fields: [{ id: newFieldId(), label: 'Name', binding: 'student.fullName', visible: true, order: 0 }],
          style: { border: '1px solid #ccc', borderRadius: 4, padding: '12px 14px',
            background: '#f9f9f9', labelColor: '#555', valueColor: '#000',
            valueFontWeight: 'bold', valueFontSize: 13 } } as DRCESection;
      case 'results_table':
        return { ...base, type: 'results_table',
          columns: [
            { id: newColumnId(), header: 'Subject', binding: 'result.subjectName', width: '30%', visible: true, order: 0, align: 'left' },
            { id: newColumnId(), header: 'Grade',   binding: 'result.grade',       width: '15%', visible: true, order: 1, align: 'center' },
          ],
          style: { headerBackground: '#e5e7eb', headerBorder: '1px solid #ccc',
            rowBorder: '1px solid #ddd', headerFontSize: 11, rowFontSize: 11,
            headerTextTransform: 'uppercase', padding: 4 } } as DRCESection;
      case 'assessment':
        return { ...base, type: 'assessment',
          fields: [{ id: newFieldId(), label: 'Class Position', binding: 'assessment.classPosition', visible: true, order: 0 }],
          style: {
            layout: 'table',
            width: '100%',
            positionFields: 1,
            assessmentLabel: 'Grade Assessment',
            tableLayout: 'fixed',
            cellPadding: '2px 8px',
            headerFontSize: 11,
            labelFontSize: 10,
            valueFontSize: 12,
            valueFontWeight: 'bold',
            border: '1px solid #ccc',
            borderRadius: 8,
            padding: '10px 20px',
            background: '#f9f9f9',
            headerBackground: '#f2f2f2',
            borderColor: '#cccccc',
            labelColor: '#444444',
            valueColor: '#000000',
            itemMinWidth: 160,
            rowGap: 4,
            columnGap: 16,
          } } as DRCESection;
      case 'comments':
        return { ...base, type: 'comments',
          items: [{ id: newItemId(), label: 'Teacher Comment', binding: 'comments.classTeacher', visible: true, order: 0 }],
          style: { ribbonBackground: '#6b7280', ribbonColor: '#fff', textColor: '#333', textFontStyle: 'italic' } } as DRCESection;
      case 'grade_table':
        return { ...base, type: 'grade_table',
          grades: [],
          style: { headerBackground: '#e5e7eb', border: '1px solid #ccc' } } as DRCESection;
      case 'spacer':
        return { ...base, type: 'spacer', style: { height: 20 } } as DRCESection;
      case 'divider':
        return { ...base, type: 'divider', style: { color: '#cccccc', thickness: 1, margin: '8px 0' } } as DRCESection;
      case 'next_term_begins':
        return { ...base, type: 'next_term_begins',
          content: { text: 'Next term begins', customDate: '' },
          style: { background: '#e0f2fe', color: '#0c4a6e', fontSize: 14, fontWeight: '600',
            textAlign: 'center', padding: '10px 12px', borderRadius: 6, borderColor: '#06b6d4',
            borderWidth: 1, icon: '📅' } } as DRCESection;
      case 'header':
        return { ...base, type: 'header',
          style: { layout: 'three-column', paddingBottom: 10, borderBottom: '1px solid #eee', opacity: 1, logoWidth: 64, logoHeight: 64 } } as DRCESection;
      case 'container':
        return { ...base, type: 'container', children: [],
          style: { layout: 'stack', gap: 8, padding: '8px' } } as DRCESection;
      case 'header_block':
        return { ...base, type: 'header_block', kind: 'school_name',
          style: { fontSize: 16, fontWeight: 'bold', align: 'center' } } as DRCESection;
      case 'block_ref':
        return { ...base, type: 'block_ref', block_id: 0 } as DRCESection;
      case 'table':
        return { ...base, type: 'table',
          columns: [
            { id: newColumnId(), header: 'Column A', width: '50%', align: 'left'  },
            { id: newColumnId(), header: 'Column B', width: '50%', align: 'right' },
          ],
          staticRowCount: 3, cells: {},
          style: { headerBackground: '#e5e7eb', headerBorder: '1px solid #ccc',
            rowBorder: '1px solid #ddd', headerFontSize: 11, rowFontSize: 11,
            padding: 4 } } as DRCESection;
      case 'shape':
        return { ...base, type: 'shape',
          shape: {
            id: newShapeId(), type: 'rect',
            x: 0, y: 0, w: 120, h: 60,
            fill: '#e0f2fe', stroke: '#0284c7', strokeWidth: 1,
            opacity: 1, radius: 6, rotation: 0,
          },
          style: {} } as DRCESection;
      default:
        return { ...base, type: 'spacer', style: { height: 16 } } as DRCESection;
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId   = String(over.id);

    // Drop onto a container's nest zone → MOVE_SECTION into that container.
    if (overId.startsWith('nest:')) {
      const targetContainerId = overId.slice('nest:'.length);
      if (targetContainerId === activeId) return;  // can't nest into self
      onMutate({
        type: 'MOVE_SECTION',
        sectionId: activeId,
        targetContainerId,
        position: Number.MAX_SAFE_INTEGER,
      });
      return;
    }

    // Drop onto top-level "unnest" zone → MOVE_SECTION to top level.
    if (overId === 'nest:__top__') {
      onMutate({
        type: 'MOVE_SECTION',
        sectionId: activeId,
        targetContainerId: null,
        position: Number.MAX_SAFE_INTEGER,
      });
      return;
    }

    // Default — reorder among top-level sections.
    const ids = sorted.map(s => s.id);
    const oldIdx = ids.indexOf(activeId);
    const newIdx = ids.indexOf(overId);
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
                  // If the selected section is a container, add INSIDE it.
                  // Otherwise add at the top level (legacy behaviour).
                  const selected = sections.find(x => x.id === selectedId);
                  const parentContainerId = selected?.type === 'container' ? selected.id : null;
                  onMutate({ type: 'ADD_SECTION', section: buildNewSection(s.type), afterId: null, parentContainerId });
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
            <TopLevelDropZone />
            {sorted.map(section => (
              <React.Fragment key={section.id}>
                <SectionRow
                  section={section}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onMutate={onMutate}
                />
                {section.type === 'container' && (
                  <NestDropZone
                    containerId={section.id}
                    hasChildren={((section as DRCEContainerSection).children?.length ?? 0) > 0}
                  />
                )}
              </React.Fragment>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

/** A small drop strip rendered under each top-level container. Drag a row
 *  onto it to nest that section inside the container. */
function NestDropZone({ containerId, hasChildren }: { containerId: string; hasChildren: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'nest:' + containerId });
  return (
    <div
      ref={setNodeRef}
      className={[
        'ml-3 mb-0.5 px-2 py-0.5 text-[10px] rounded border border-dashed transition-colors',
        isOver
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
          : 'border-gray-200 dark:border-slate-700 text-gray-400',
      ].join(' ')}
    >
      {isOver ? 'Drop to nest inside' : (hasChildren ? 'Drop here to add inside' : 'Empty container — drop to add inside')}
    </div>
  );
}

/** Top-level "Drop here to un-nest" zone, only shown while dragging from a child. */
function TopLevelDropZone() {
  const { isOver, setNodeRef } = useDroppable({ id: 'nest:__top__' });
  return (
    <div
      ref={setNodeRef}
      className={[
        'mb-1 px-2 py-1 text-[10px] rounded border border-dashed transition-colors',
        isOver
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
          : 'border-gray-200 dark:border-slate-700 text-gray-400',
      ].join(' ')}
    >
      {isOver ? 'Drop to promote to top level' : 'Drop a nested row here to un-nest'}
    </div>
  );
}

// Recursive list row — renders the section itself (sortable when at the top
// level) and, for containers, its children indented underneath (read-only
// rows, full selection + visibility-toggle). True drag-and-drop into
// containers is a separate piece of work; this gives schools the visibility
// they need today to navigate nested composition.
function SectionRow({
  section, depth, selectedId, onSelect, onMutate,
}: {
  section: DRCESection;
  depth:   number;
  selectedId: string | null;
  onSelect:   (id: string) => void;
  onMutate:   (m: DRCEMutation) => void;
}) {
  if (depth === 0) {
    return (
      <>
        <SortableItem
          section={section}
          isSelected={selectedId === section.id}
          onSelect={() => onSelect(section.id)}
          onToggle={() => onMutate({ type: 'TOGGLE_SECTION', sectionId: section.id })}
        />
        {section.type === 'container' && (section as DRCEContainerSection).children?.length > 0 && (
          <div className="ml-3 border-l border-gray-200 dark:border-slate-700 pl-2 space-y-0.5">
            {[...(section as DRCEContainerSection).children]
              .sort((a, b) => a.order - b.order)
              .map(child => (
                <SectionRow
                  key={child.id}
                  section={child}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onMutate={onMutate}
                />
              ))}
          </div>
        )}
      </>
    );
  }
  // Nested rows: no drag-handle (drag into containers is future work).
  const isSel = selectedId === section.id;
  return (
    <>
      <div
        className={[
          'flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer select-none text-[12px]',
          isSel
            ? 'bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-600'
            : 'hover:bg-gray-50 dark:hover:bg-slate-700 border border-transparent',
          !section.visible ? 'opacity-40' : '',
        ].join(' ')}
        onClick={() => onSelect(section.id)}
      >
        <span className="text-sm leading-none">{SECTION_ICONS[section.type] ?? '📄'}</span>
        <span className="flex-1 truncate text-gray-700 dark:text-gray-200">
          {SECTION_LABELS[section.type] ?? section.type}
        </span>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          onClick={e => { e.stopPropagation(); onMutate({ type: 'TOGGLE_SECTION', sectionId: section.id }); }}
          title={section.visible ? 'Hide' : 'Show'}
        >
          {section.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      </div>
      {section.type === 'container' && (section as DRCEContainerSection).children?.length > 0 && (
        <div className="ml-3 border-l border-gray-200 dark:border-slate-700 pl-2 space-y-0.5">
          {[...(section as DRCEContainerSection).children]
            .sort((a, b) => a.order - b.order)
            .map(child => (
              <SectionRow
                key={child.id}
                section={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onMutate={onMutate}
              />
            ))}
        </div>
      )}
    </>
  );
}
