'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChefHat, Eye, Check, Copy, Plus, Trash2,
  Sparkles, ArrowLeft, RefreshCw, Pencil, Loader2, Library,
} from 'lucide-react';
import type { DRCEDocument, DRCEDataContext } from '@/lib/drce/schema';
import { DRCEDocumentRenderer } from '@/components/drce/DRCEDocumentRenderer';
import { findKind, BUILT_IN_KINDS } from '@/lib/drce/kinds';
import type { DRCERenderContext } from '@/components/drce/types';
import { GenerateSnapshotButton } from '@/components/reports/GenerateSnapshotButton';
import { useI18n } from '@/components/i18n/I18nProvider';

// ============================================================================
// Sample data used for card mini-previews
// ============================================================================

const PREVIEW_DATA: DRCEDataContext = {
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
    { id: 1, name: 'Mathematics',    totalMarks: 100, subjectType: 'primary' },
    { id: 2, name: 'English',        totalMarks: 100, subjectType: 'primary' },
    { id: 3, name: 'Science',        totalMarks: 100, subjectType: 'primary' },
    { id: 4, name: 'Social Studies', totalMarks: 100, subjectType: 'primary' },
  ],
  results: [
    { subjectName: 'Mathematics',    midTermScore: 72, endTermScore: 85, total: 157, grade: 'D1', comment: 'Excellent', initials: 'JO', teacherName: 'J. Okello' },
    { subjectName: 'English',        midTermScore: 65, endTermScore: 78, total: 143, grade: 'D2', comment: 'Very good', initials: 'AM', teacherName: 'A. Mutesi' },
    { subjectName: 'Science',        midTermScore: 58, endTermScore: 69, total: 127, grade: 'C3', comment: 'Good',      initials: 'BK', teacherName: 'B. Kasozi' },
    { subjectName: 'Social Studies', midTermScore: 70, endTermScore: 82, total: 152, grade: 'D1', comment: 'Outstanding', initials: 'JO', teacherName: 'J. Okello' },
  ],
  assessment: { classPosition: 3, streamPosition: 2, aggregates: 8, division: 'I', totalStudents: 42 },
  comments: {
    classTeacher: 'Sarah is a diligent student who shows great promise.',
    dos:          'Keep up the excellent work.',
    headTeacher:  'Well done. Maintain the momentum.',
  },
  meta: {
    term: 'Term 1', year: '2026', reportTitle: 'END OF TERM I REPORT CARD 2026',
    schoolName: '', schoolAddress: '', schoolContact: '', schoolEmail: '', centerNo: '', registrationNo: '',
    arabicName: null, arabicAddress: null, logoUrl: null,
    // Phase B sample so card previews resolve {next_term_begins | date:"…"}
    // etc. (real renders read these from snapshot.config.calendar populated
    // at generation time).
    nextTermBegins: '2026-05-15',
    calendar: {
      next_term_starts_at: '2026-05-15',
      this_term_ends_at:   '2026-04-12',
      next_term_name:      'Term 2',
      prev_term_name:      null,
      year_rollover:       false,
    },
  },
};

const PREVIEW_RENDER: DRCERenderContext = {
  school: {
    name:            'DRAIS Model School',
    arabic_name:     'مدرسة درايس النموذجية',
    address:         'Plot 1, School Road, Kampala',
    contact:         '+256 700 000 000',
    center_no:       'CEN-001',
    registration_no: 'REG-2020',
    logo_url:        '/uploads/logo.png',
  },
};

// ============================================================================
// Scaled-down live preview of a DRCE document
// ============================================================================
function DocMiniPreview({ doc }: { doc: DRCEDocument }) {
  const CARD_W = 280;
  const DOC_W  = 794; // A4 portrait px baseline
  const scale  = CARD_W / DOC_W;

  return (
    <div style={{ width: CARD_W, height: 200, overflow: 'hidden', position: 'relative', background: '#f5f5f5' }}>
      <div style={{
        transform:       `scale(${scale})`,
        transformOrigin: 'top left',
        width:           DOC_W,
        pointerEvents:   'none',
        userSelect:      'none',
      }}>
        <DRCEDocumentRenderer
          document={doc}
          dataCtx={PREVIEW_DATA}
          renderCtx={PREVIEW_RENDER}
        />
      </div>
    </div>
  );
}


// ============================================================================
// MAIN: Kitchen Page — manages dvcf_documents directly
// ============================================================================
export default function ReportsKitchen() {
  const { t } = useI18n();
  const router = useRouter();
  const [documents, setDocuments] = useState<DRCEDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc]   = useState<DRCEDocument | null>(null);
  const [loading, setLoading]         = useState(true);
  const [deletingId, setDeletingId]   = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [activatingId, setActivatingId]   = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Canva-style kind filter — defaults to "all" so the existing kitchen
  // behaviour is unchanged for users who don't care about kinds.
  const [kindFilter, setKindFilter] = useState<string>('all');

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const docNumId = (doc: DRCEDocument) => parseInt(doc.meta.id, 10);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, activeRes] = await Promise.all([
        fetch('/api/dvcf/documents'),
        fetch('/api/dvcf/active'),
      ]);
      const docsData   = await docsRes.json();
      const activeData = await activeRes.json();

      if (docsData.documents) setDocuments(docsData.documents as DRCEDocument[]);
      if (activeData.document?.meta?.id) {
        setActiveDocId(parseInt(activeData.document.meta.id, 10));
      }
    } catch {
      showMsg('error', 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleActivate = async (doc: DRCEDocument) => {
    const id = docNumId(doc);
    setActivatingId(id);
    try {
      const res = await fetch('/api/dvcf/active', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ document_id: id }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveDocId(id);
        showMsg('success', `"${doc.meta.name}" is now the active template`);
      } else {
        showMsg('error', data.error || 'Failed to activate');
      }
    } catch {
      showMsg('error', 'Network error');
    } finally {
      setActivatingId(null);
    }
  };

  const handleDuplicate = async (doc: DRCEDocument) => {
    const id = docNumId(doc);
    setDuplicatingId(id);
    try {
      const cloned = structuredClone(doc);
      cloned.meta.name = `${doc.meta.name} (Copy)`;
      cloned.meta.id   = '';
      cloned.meta.is_default  = false;
      cloned.meta.school_id   = doc.meta.school_id;
      cloned.meta.template_key = null;

      const res = await fetch('/api/dvcf/documents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:          cloned.meta.name,
          description:   '',
          schema_json:   JSON.stringify(cloned),
          document_type: cloned.meta.report_type ?? 'report_card',
        }),
      });
      const data = await res.json();
      if (data.id) {
        showMsg('success', `Duplicated as "${cloned.meta.name}"`);
        fetchData();
      } else {
        showMsg('error', data.error || 'Failed to duplicate');
      }
    } catch {
      showMsg('error', 'Network error');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (doc: DRCEDocument) => {
    if (!confirm(`Delete template "${doc.meta.name}"? This cannot be undone.`)) return;
    const id = docNumId(doc);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dvcf/documents/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showMsg('success', 'Template deleted');
        if (previewDoc && docNumId(previewDoc) === id) setPreviewDoc(null);
        fetchData();
      } else {
        showMsg('error', data.error || 'Cannot delete this template');
      }
    } catch {
      showMsg('error', 'Network error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/academics/reports')}
              className="text-gray-500 hover:text-gray-800 dark:hover:text-white flex items-center gap-1 text-sm"
            >
              <ArrowLeft size={16} /> {t('common.back')}
            </button>
            <div className="h-4 w-px bg-gray-300 dark:bg-slate-600" />
            <ChefHat size={22} className="text-amber-600" />
            <h1 className="text-lg font-bold text-gray-800 dark:text-white">{t('drce.templateKitchen')}</h1>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Template Engine</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
            >
              <RefreshCw size={14} /> {t('actions.refresh')}
            </button>
            <GenerateSnapshotButton
              defaultType="secular"
              label={t('snapshot.generate')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
            />
            <button
              onClick={() => router.push('/admin/drce/blocks')}
              title="Reusable section subtrees referenced by templates via block_ref"
              className="flex items-center gap-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm px-3 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-600"
            >
              <Library size={14} /> {t('drce.blockLibrary')}
            </button>
            <button
              onClick={() => router.push('/drce/new')}
              title="Pick a starter — report, certificate, ID card, transcript, letter, or blank"
              className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded hover:bg-indigo-700"
            >
              <Plus size={14} /> {t('drce.newDocument')}
            </button>
            <button
              onClick={() => router.push('/reports/kitchen/drce/new')}
              title="Start a blank template directly in the editor"
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            >
              blank
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div className={`fixed top-16 right-4 z-50 px-4 py-2 rounded shadow-lg text-white text-sm ${
          message.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {message.text}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Intro banner */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Sparkles size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-amber-800 dark:text-amber-300">{t('drce.templateKitchen')}</h2>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                Each card below is a real report template — what you see is exactly what prints.
                Click <strong>Edit</strong> to open the visual designer. Set <strong>Use This</strong> to make it the active template for all report printing.
              </p>
            </div>
          </div>
        </div>

        {/* Kind filter pills — Canva-style "What kind of document?" navigator.
            Counts every kind present in the current list, plus "All". */}
        {documents.length > 0 && (() => {
          const counts = new Map<string, number>();
          counts.set('all', documents.length);
          for (const d of documents) {
            const k = d.meta.document_kind ?? 'report';
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
          const visibleKinds = BUILT_IN_KINDS.filter(k => counts.has(k.code));
          // Surface any school-defined kinds the user actually uses, too.
          for (const c of counts.keys()) {
            if (c !== 'all' && !visibleKinds.some(k => k.code === c)) {
              visibleKinds.push(findKind(c));
            }
          }
          return (
            <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
              {([{ code: 'all', label: 'All', icon: '📚' } as { code: string; label: string; icon: string }, ...visibleKinds]).map(k => {
                const active = kindFilter === k.code;
                const n = counts.get(k.code) ?? 0;
                return (
                  <button
                    key={k.code}
                    onClick={() => setKindFilter(k.code)}
                    className={[
                      'inline-flex items-center text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap',
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200',
                    ].join(' ')}
                  >
                    <span className="mr-1">{k.icon}</span>{k.label}
                    <span className="ml-1 opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 size={22} className="animate-spin" /> Loading templates...
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ChefHat size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No templates yet</p>
            <button
              onClick={() => router.push('/reports/kitchen/drce/new')}
              className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-4 py-2 rounded hover:bg-indigo-700"
            >
              <Plus size={14} /> Create your first template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {documents
              .filter(d => kindFilter === 'all' || (d.meta.document_kind ?? 'report') === kindFilter)
              .map(doc => {
              const id       = docNumId(doc);
              const isActive = id === activeDocId;
              const isGlobal = doc.meta.school_id === null;
              const kind     = findKind(doc.meta.document_kind);

              return (
                <div
                  key={id}
                  className={`bg-white dark:bg-slate-800 rounded-xl border-2 overflow-hidden shadow-sm transition-all ${
                    isActive
                      ? 'border-green-500 shadow-green-100 dark:shadow-green-900/30'
                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                  }`}
                >
                  {/* Live mini-preview */}
                  <div
                    className="relative overflow-hidden cursor-pointer border-b dark:border-slate-700"
                    onClick={() => setPreviewDoc(prev => prev && docNumId(prev) === id ? null : doc)}
                  >
                    <DocMiniPreview doc={doc} />
                    {isActive && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                        <Check size={10} /> Active
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 text-xs bg-black/50 text-white px-1.5 py-0.5 rounded opacity-0 hover:opacity-100 transition-opacity">
                      Full preview
                    </div>
                  </div>

                  {/* Card footer */}
                  <div className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-gray-800 dark:text-white truncate">{doc.meta.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">{doc.meta.report_type?.replace('_', ' ')}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {/* Document kind chip — Canva-style "what is this?" */}
                        <span
                          className="text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"
                          title={kind.description}
                        >
                          <span>{kind.icon}</span>{kind.label}
                        </span>
                        {isGlobal && <span className="text-xs bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded">Built-in</span>}
                        {!isGlobal && <span className="text-xs bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">Custom</span>}
                      </div>
                    </div>

                    {/* Theme color swatches */}
                    <div className="flex items-center gap-1.5 mb-3">
                      {[doc.theme.primaryColor, doc.theme.secondaryColor, doc.theme.accentColor, doc.theme.pageBackground].map((c, i) => (
                        <div key={i} title={c} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid rgba(0,0,0,0.12)' }} />
                      ))}
                      <span className="text-xs text-gray-300 dark:text-slate-500 ml-1">palette</span>
                      <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">{doc.theme.pageSize?.toUpperCase() ?? 'A4'} {doc.theme.orientation ?? 'portrait'}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => router.push(`/reports/kitchen/drce/${id}`)}
                        className="flex items-center gap-1 text-xs bg-indigo-600 text-white rounded px-2 py-1 hover:bg-indigo-700"
                      >
                        <Pencil size={11} /> Edit
                      </button>

                      <button
                        onClick={() => setPreviewDoc(prev => prev && docNumId(prev) === id ? null : doc)}
                        className="flex items-center gap-1 text-xs border dark:border-slate-600 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-slate-700 dark:text-gray-300"
                      >
                        <Eye size={11} /> {previewDoc && docNumId(previewDoc) === id ? 'Close' : 'Preview'}
                      </button>

                      <button
                        onClick={() => handleActivate(doc)}
                        disabled={isActive || activatingId === id}
                        className={`flex items-center gap-1 text-xs rounded px-2 py-1 ${
                          isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-default'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {activatingId === id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        {isActive ? 'Active' : 'Use This'}
                      </button>

                      <button
                        onClick={() => handleDuplicate(doc)}
                        disabled={duplicatingId === id}
                        className="flex items-center gap-1 text-xs border dark:border-slate-600 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-slate-700 dark:text-gray-300"
                      >
                        {duplicatingId === id ? <Loader2 size={11} className="animate-spin" /> : <Copy size={11} />}
                        Copy
                      </button>

                      {!isGlobal && id !== activeDocId && (
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={deletingId === id}
                          className="flex items-center gap-1 text-xs border border-red-200 text-red-500 rounded px-2 py-1 hover:bg-red-50 ml-auto"
                        >
                          {deletingId === id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full-size preview panel */}
        {previewDoc && (
          <div className="mt-8 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-blue-500" />
                <span className="font-semibold text-sm dark:text-white">
                  Preview: <span className="text-blue-600 dark:text-blue-400">{previewDoc.meta.name}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {docNumId(previewDoc) !== activeDocId && (
                  <button
                    onClick={() => handleActivate(previewDoc)}
                    className="bg-green-600 text-white text-sm px-3 py-1 rounded hover:bg-green-700"
                  >
                    <Check size={13} className="inline mr-1" />Use This Template
                  </button>
                )}
                {docNumId(previewDoc) === activeDocId && (
                  <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                    <Check size={14} /> Currently Active
                  </span>
                )}
                <button
                  onClick={() => router.push(`/reports/kitchen/drce/${docNumId(previewDoc)}`)}
                  className="flex items-center gap-1 bg-indigo-600 text-white text-sm px-3 py-1 rounded hover:bg-indigo-700"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="text-sm text-gray-500 hover:text-gray-800 border dark:border-slate-600 dark:text-gray-300 rounded px-2 py-1"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              <div style={{ maxWidth: 794, margin: '0 auto' }}>
                <DRCEDocumentRenderer
                  document={previewDoc}
                  dataCtx={PREVIEW_DATA}
                  renderCtx={PREVIEW_RENDER}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
