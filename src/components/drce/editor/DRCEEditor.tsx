// src/components/drce/editor/DRCEEditor.tsx
// Three-panel DRCE editor: Left=sections | Centre=live preview | Right=properties
'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Undo2, Redo2, Save, Loader2, Eye, EyeOff, X, History, ZoomIn, ZoomOut } from 'lucide-react';
import { VersionHistoryDrawer } from './VersionHistoryDrawer';
import { VariablePicker } from './VariablePicker';
import { selection, useSelection } from './selectionStore';
import { ContextualToolbar } from './ContextualToolbar';
import { TypographyPopover } from './TypographyPopover';
import type { DRCETextShape } from '@/lib/drce/schema';
import type { DRCEDocument, DRCEMutation, DRCEShape } from '@/lib/drce/schema';
import { resolvePageDimensions } from '@/lib/drce/styleResolver';
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
  subjects: [
    { id: 1, name: 'Mathematics',   totalMarks: 100, subjectType: 'primary' },
    { id: 2, name: 'English',       totalMarks: 100, subjectType: 'primary' },
    { id: 3, name: 'Science',       totalMarks: 100, subjectType: 'primary' },
    { id: 4, name: 'Social Studies',totalMarks: 100, subjectType: 'primary' },
    { id: 5, name: 'Kiswahili',     totalMarks: 100, subjectType: 'primary' },
  ],
  results: [
    { subjectName: 'Mathematics',   midTermScore: 72, endTermScore: 85, total: 157, grade: 'D1', comment: 'Excellent progress',  initials: 'JO', teacherName: 'John Okello', subject: { id: 1, name: 'Mathematics', totalMarks: 100, subjectType: 'primary' } },
    { subjectName: 'English',       midTermScore: 65, endTermScore: 78, total: 143, grade: 'D2', comment: 'Very good work',      initials: 'AM', teacherName: 'Agnes Mutesi', subject: { id: 2, name: 'English', totalMarks: 100, subjectType: 'primary' } },
    { subjectName: 'Science',       midTermScore: 58, endTermScore: 69, total: 127, grade: 'C3', comment: 'Good',                initials: 'BK', teacherName: 'Brian Kasozi', subject: { id: 3, name: 'Science', totalMarks: 100, subjectType: 'primary' } },
    { subjectName: 'Social Studies',midTermScore: 70, endTermScore: 82, total: 152, grade: 'D1', comment: 'Outstanding',         initials: 'JO', teacherName: 'John Okello', subject: { id: 4, name: 'Social Studies', totalMarks: 100, subjectType: 'primary' } },
    { subjectName: 'Kiswahili',     midTermScore: 50, endTermScore: 60, total: 110, grade: 'C5', comment: 'Fair',                initials: 'NM', teacherName: 'Nanteza Mary', subject: { id: 5, name: 'Kiswahili', totalMarks: 100, subjectType: 'primary' } },
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
    schoolEmail:     '',
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
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const sel = useSelection();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Mirror local single-select state INTO the multi-select store so the
  // contextual toolbar / typography popover can react to any selection
  // change without refactoring every existing caller in one go.
  useEffect(() => {
    if (selectedId) selection.select('section', selectedId);
    else if (selectedShapeId) selection.select('shape', selectedShapeId);
    else selection.clear();
  }, [selectedId, selectedShapeId]);
  const [activeTool, setActiveTool] = useState<DrawTool>('select');
  const [propTab, setPropTab] = useState<'section' | 'theme' | 'watermark' | 'rules'>('section');
  const [saving, setSaving] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [previewScale, setPreviewScale] = useState(0.65);
  const [attachQuery, setAttachQuery] = useState<{ shapeId: string; sectionType: string; sectionId: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [currentVersionNo, setCurrentVersionNo] = useState<number | undefined>(undefined);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const documentDbId = Number(initial.meta.id);
  const hasDbId = Number.isFinite(documentDbId) && documentDbId > 0;

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
          case 'v': setActiveTool('select');   break;
          case 'a': setActiveTool('arrow');    break;
          case 'l': setActiveTool('line');     break;
          case 'r': setActiveTool('rect');     break;
          case 'e': setActiveTool('ellipse');  break;
          case 't': setActiveTool('text');     break;
          case '3': setActiveTool('triangle'); break;
          case 'd': setActiveTool('diamond');  break;
          case '5': setActiveTool('pentagon'); break;
          case '6': setActiveTool('hexagon');  break;
          case '*': setActiveTool('star');     break;
          case 'delete': case 'backspace':
            if (selectedShapeId) {
              mutate({ type: 'DELETE_SHAPE', id: selectedShapeId });
              setSelectedShapeId(null);
            } else if (selectedId) {
              mutate({ type: 'DELETE_SECTION', sectionId: selectedId });
              setSelectedId(null);
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
  }, [undo, redo, selectedShapeId, mutate]);

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
      setSavedAt(new Date());
      // Refresh the version chip — read the latest version number from the API.
      if (hasDbId) {
        try {
          const res = await fetch(`/api/dvcf/documents/${documentDbId}/versions`);
          const data = await res.json();
          if (data?.success && Array.isArray(data.versions) && data.versions.length > 0) {
            setCurrentVersionNo(Number(data.versions[0].version_no));
          }
        } catch { /* non-blocking */ }
      }
    } catch {
      showToast('error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Initial version chip — load the latest version_no once at mount.
  useEffect(() => {
    if (!hasDbId) return;
    fetch(`/api/dvcf/documents/${documentDbId}/versions`)
      .then(r => r.json())
      .then(data => {
        if (data?.success && Array.isArray(data.versions) && data.versions.length > 0) {
          setCurrentVersionNo(Number(data.versions[0].version_no));
        }
      })
      .catch(() => { /* silent */ });
  }, [documentDbId, hasDbId]);

  // Called when a new shape is drawn — detect nearby sections and prompt to attach
  function handleShapeDrawn(shape: DRCEShape) {
    if (!('x' in shape)) return; // skip lines
    const shapeCenterY = (shape as { y: number; h: number }).y + (shape as { h: number }).h / 2;
    // Find the closest visible section by approximating order → Y offset
    const visible = document.sections.filter(s => s.visible).sort((a, b) => a.order - b.order);
    if (!visible.length) return;
    // Each section is roughly 40–100px tall; use accumulated estimate
    let accumY = 0;
    let closest: { sectionId: string; sectionType: string; dist: number } | null = null;
    for (const s of visible) {
      const sectionEstH = 60; // rough estimate per section
      const sectionCenterY = accumY + sectionEstH / 2;
      const dist = Math.abs(shapeCenterY - sectionCenterY);
      if (!closest || dist < closest.dist) {
        closest = { sectionId: s.id, sectionType: s.type, dist };
      }
      accumY += sectionEstH;
    }
    if (closest && closest.dist < 80) {
      setAttachQuery({ shapeId: shape.id, sectionId: closest.sectionId, sectionType: closest.sectionType });
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 overflow-hidden">
      {/* ── Top bar (refreshed) ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex-shrink-0 shadow-sm">
        {/* Left: identity + save state pill */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-gray-800 dark:text-white truncate max-w-[14rem]">
            {document.meta.name}
          </span>
          {hasDbId && currentVersionNo != null && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              title="Open version history"
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
            >
              v{currentVersionNo}
            </button>
          )}
          {isDirty
            ? <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">● unsaved</span>
            : savedAt
              ? <span className="text-[11px] text-emerald-600 dark:text-emerald-400">✓ saved</span>
              : null}
        </div>

        <div className="flex-1" />

        {/* Variable picker — insert {tokens} into any focused text field */}
        <VariablePicker />

        <div className="w-px h-5 bg-gray-200 dark:bg-slate-700" />

        {/* Zoom controls (clearer than the bare range slider) */}
        <button
          type="button"
          onClick={() => setPreviewScale(s => Math.max(0.3, Math.round((s - 0.1) * 100) / 100))}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <span className="text-[11px] font-mono w-9 text-center text-gray-500 tabular-nums">{Math.round(previewScale * 100)}%</span>
        <button
          type="button"
          onClick={() => setPreviewScale(s => Math.min(1.1, Math.round((s + 0.1) * 100) / 100))}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>

        <div className="w-px h-5 bg-gray-200 dark:bg-slate-700" />

        <button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 disabled:opacity-30">
          <Undo2 size={15} />
        </button>
        <button type="button" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 disabled:opacity-30">
          <Redo2 size={15} />
        </button>

        {hasDbId && (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            title="Version history"
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300"
          >
            <History size={15} />
          </button>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
      </div>

      {hasDbId && (
        <VersionHistoryDrawer
          documentId={documentDbId}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          // The editor mounts with `initial`; swapping the active document
          // mid-session would require lifting the fetch out. A full reload is
          // the simplest correct boundary for restore, which is a rare action.
          onRestored={() => { window.location.reload(); }}
          currentVersion={currentVersionNo}
        />
      )}

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
          {/* Attach-to-section prompt */}
          {attachQuery && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-slate-600 rounded-xl shadow-xl px-4 py-3 text-sm">
              <span className="text-gray-700 dark:text-gray-200">Attach shape to nearby <strong>{attachQuery.sectionType.replace('_', ' ')}</strong>?</span>
              <button type="button" onClick={() => { showToast('success', 'Shape attached to section'); setAttachQuery(null); }}
                className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">Attach</button>
              <button type="button" onClick={() => setAttachQuery(null)}
                className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
            </div>
          )}
          {(() => {
            const { width } = resolvePageDimensions(document.theme);
            return (
              <div
                ref={canvasRef}
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top center',
                  width,
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
                  onAddShape={(s) => { mutate({ type: 'ADD_SHAPE', shape: s }); handleShapeDrawn(s); }}
                  onUpdateShape={(id, u) => mutate({ type: 'UPDATE_SHAPE', id, updates: u })}
                  onSelectShape={(id) => {
                    setSelectedShapeId(id);
                    if (id) setSelectedId(null); // deselect section when shape selected
                  }}
                />

                {/* Floating contextual toolbar (any selection) */}
                <ContextualToolbar document={document} onMutate={mutate} canvasRef={canvasRef} />

                {/* Typography popover (text-shape selection only) */}
                {(() => {
                  if (sel.primary?.kind !== 'shape') return null;
                  const sh = (document.shapes ?? []).find(s => s.id === sel.primary!.id);
                  if (!sh || sh.type !== 'text') return null;
                  return (
                    <TypographyPopover
                      shape={sh as DRCETextShape}
                      canvasRef={canvasRef}
                      onUpdate={(patch) => mutate({ type: 'UPDATE_SHAPE', id: sh.id, updates: patch as Partial<typeof sh> })}
                      onClose={() => setSelectedShapeId(null)}
                    />
                  );
                })()}
              </div>
            );
          })()}
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
