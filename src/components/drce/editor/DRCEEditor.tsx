// src/components/drce/editor/DRCEEditor.tsx
// Three-panel DRCE editor: Left=sections | Centre=live preview | Right=properties
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Undo2, Redo2, Save, Loader2, Eye, EyeOff } from 'lucide-react';
import type { DRCEDocument, DRCEMutation } from '@/lib/drce/schema';
import { useDRCEEditor } from './useDRCEEditor';
import { SectionListPanel } from './SectionListPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { DrawingToolbar } from './DrawingToolbar';
import { ShapePropertiesPanel } from './ShapePropertiesPanel';
import { ShapeCanvas, type DrawTool } from '../canvas/ShapeCanvas';
import { DRCEDocumentRenderer } from '../DRCEDocumentRenderer';
import { showToast } from '@/lib/toast';

// Demo data context for the live preview
import type { DRCEDataContext } from '@/lib/drce/schema';
import type { DRCERenderContext } from '../types';

const DEMO_DATA_CTX: DRCEDataContext = {
  student: {
    fullName:    'Nakato Sarah B.',
    firstName:   'Sarah',
    lastName:    'Nakato',
    gender:      'Female',
    className:   'P6 East',
    streamName:  'East',
    admissionNo: 'ADM/2026/0042',
    photoUrl:    null,
    dateOfBirth: null,
  },
  results: [
    { subjectName: 'Mathematics',   midTermScore: 72, endTermScore: 85, total: 157, grade: 'D1', comment: 'Excellent progress',  initials: 'JO', teacherName: 'John Okello' },
    { subjectName: 'English',       midTermScore: 65, endTermScore: 78, total: 143, grade: 'D2', comment: 'Very good work',      initials: 'AM', teacherName: 'Agnes Mutesi' },
    { subjectName: 'Science',       midTermScore: 58, endTermScore: 69, total: 127, grade: 'C3', comment: 'Good',                initials: 'BK', teacherName: 'Brian Kasozi' },
    { subjectName: 'Social Studies',midTermScore: 70, endTermScore: 82, total: 152, grade: 'D1', comment: 'Outstanding',         initials: 'JO', teacherName: 'John Okello' },
    { subjectName: 'Kiswahili',     midTermScore: 50, endTermScore: 60, total: 110, grade: 'C5', comment: 'Fair',                initials: 'NM', teacherName: 'Nanteza Mary' },
  ],
  assessment: {
    classPosition:  3,
    streamPosition: 2,
    aggregates:     8,
    division:       'I',
    totalStudents:  42,
  },
  comments: {
    classTeacher: 'Sarah is a diligent student who shows great promise.',
    dos:          'Keep up the excellent work.',
    headTeacher:  'Well done. Maintain the momentum.',
  },
  meta: {
    term:            'Term 1',
    year:            '2026',
    reportTitle:     'END OF TERM I REPORT CARD 2026',
    schoolName:      '',
    schoolAddress:   '',
    schoolContact:   '',
    centerNo:        '',
    registrationNo:  '',
    arabicName:      null,
    arabicAddress:   null,
    logoUrl:         null,
  },
};

const DEMO_RENDER_CTX: DRCERenderContext = {
  school: {
    name:            'DRAIS Model School',
    arabic_name:     'مدرسة درايس النموذجية',
    address:         'Plot 1, School Road, Kampala',
    contact:         '+256 700 000 000',
    center_no:       'CEN-001',
    registration_no: 'REG-2020',
    logo_url:        '/uploads/logo.png',
  },
  isPrint: false,
};

interface Props {
  initial: DRCEDocument;
  /** Called with the current document when Save is clicked */
  onSave: (doc: DRCEDocument) => Promise<void>;
}

export function DRCEEditor({ initial, onSave }: Props) {
  const { document, mutate, undo, redo, canUndo, canRedo, isDirty } = useDRCEEditor(initial);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<DrawTool>('select');
  const [propTab, setPropTab] = useState<'section' | 'theme' | 'watermark'>('section');
  const [saving, setSaving] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [previewScale, setPreviewScale] = useState(0.65);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Delete keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
      // Shortcut keys for drawing tools
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        switch (e.key.toLowerCase()) {
          case 'v': setActiveTool('select'); break;
          case 'a': setActiveTool('arrow');  break;
          case 'l': setActiveTool('line');   break;
          case 'r': setActiveTool('rect');   break;
          case 'e': setActiveTool('ellipse'); break;
          case 't': setActiveTool('text');   break;
          case 'delete': case 'backspace':
            if (selectedShapeId) {
              mutate({ type: 'DELETE_SHAPE', id: selectedShapeId });
              setSelectedShapeId(null);
            }
            break;
          case 'escape':
            setActiveTool('select');
            setSelectedShapeId(null);
            break;
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedShapeId, mutate]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleMutate = useCallback((m: DRCEMutation) => {
    mutate(m);
  }, [mutate]);

  const handleSectionClick = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedShapeId(null); // deselect shape when section clicked
    setPropTab('section');
  }, []);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(document);
      showToast('success', 'Template saved');
    } catch {
      showToast('error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-slate-900 overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
        <span className="font-semibold text-sm text-gray-700 dark:text-gray-200 mr-2 truncate max-w-xs">
          {document.meta.name}
        </span>
        {isDirty && <span className="text-xs text-amber-500 font-medium">● unsaved</span>}
        <div className="flex-1" />

        {/* Preview scale */}
        <label className="text-xs text-gray-500 hidden sm:block">Scale</label>
        <input
          type="range" min={0.3} max={1.1} step={0.05}
          value={previewScale}
          onChange={e => setPreviewScale(Number(e.target.value))}
          className="w-20 hidden sm:block"
        />

        <button
          type="button"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={undo}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          title="Redo (Ctrl+Y)"
          disabled={!canRedo}
          onClick={redo}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30"
        >
          <Redo2 size={16} />
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
      </div>

      {/* ── Drawing toolbar ───────────────────────────────────────────────────────── */}
      <DrawingToolbar
        activeTool={activeTool}
        selectedShapeId={selectedShapeId}
        onToolChange={(t) => { setActiveTool(t); if (t !== 'select') setSelectedId(null); }}
        onDeleteShape={() => {
          if (selectedShapeId) {
            mutate({ type: 'DELETE_SHAPE', id: selectedShapeId });
            setSelectedShapeId(null);
          }
        }}
      />

      {/* ── Three-panel body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: Section list */}
        <aside className={[
          'flex-shrink-0 border-r border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 transition-all duration-200 overflow-hidden',
          leftCollapsed ? 'w-0' : 'w-52',
        ].join(' ')}>
          <SectionListPanel
            sections={document.sections}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMutate={handleMutate}
          />
        </aside>

        {/* Toggle buttons */}
        <div className="flex flex-col gap-1 border-r border-gray-100 dark:border-slate-700 px-0.5 py-2 bg-gray-50 dark:bg-slate-800 flex-shrink-0">
          <button
            type="button"
            title={leftCollapsed ? 'Show sections' : 'Hide sections'}
            onClick={() => setLeftCollapsed(v => !v)}
            className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            {leftCollapsed ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>

        {/* Centre: Live preview + shape canvas */}
        <main className="flex-1 min-w-0 bg-gray-100 dark:bg-slate-950 overflow-auto p-6">
          <div
            style={{
              transform: `scale(${previewScale})`,
              transformOrigin: 'top center',
              maxWidth: 700,
              margin: '0 auto',
              boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
              borderRadius: 4,
              background: '#fff',
              position: 'relative',  /* needed for ShapeCanvas absolute positioning */
            }}
          >
            <DRCEDocumentRenderer
              document={document}
              dataCtx={DEMO_DATA_CTX}
              renderCtx={DEMO_RENDER_CTX}
              onSectionClick={handleSectionClick}
              selectedSectionId={selectedId}
            />
            <ShapeCanvas
              shapes={document.shapes ?? []}
              activeTool={activeTool}
              selectedShapeId={selectedShapeId}
              onAddShape={(s) => mutate({ type: 'ADD_SHAPE', shape: s })}
              onUpdateShape={(id, u) => mutate({ type: 'UPDATE_SHAPE', id, updates: u })}
              onSelectShape={(id) => {
                setSelectedShapeId(id);
                if (id) setSelectedId(null); // deselect section when shape selected
              }}
            />
          </div>
        </main>

        {/* Toggle right */}
        <div className="flex flex-col gap-1 border-l border-gray-100 dark:border-slate-700 px-0.5 py-2 bg-gray-50 dark:bg-slate-800 flex-shrink-0">
          <button
            type="button"
            title={rightCollapsed ? 'Show properties' : 'Hide properties'}
            onClick={() => setRightCollapsed(v => !v)}
            className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            {rightCollapsed ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>

        {/* Right: Properties */}
        <aside className={[
          'flex-shrink-0 border-l border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 transition-all duration-200 overflow-hidden',
          rightCollapsed ? 'w-0' : 'w-72',
        ].join(' ')}>
          {selectedShapeId ? (
            <ShapePropertiesPanel
              shape={(document.shapes ?? []).find(s => s.id === selectedShapeId) ?? null}
              onUpdate={(u) => mutate({ type: 'UPDATE_SHAPE', id: selectedShapeId, updates: u })}
              onDelete={() => {
                mutate({ type: 'DELETE_SHAPE', id: selectedShapeId });
                setSelectedShapeId(null);
              }}
            />
          ) : (
            <PropertiesPanel
              doc={document}
              selectedSectionId={selectedId}
              onMutate={handleMutate}
              activeTab={propTab}
              onTabChange={setPropTab}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
