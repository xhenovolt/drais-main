'use client';

/**
 * Localization — Arabic learner names (Batch 4).
 * Founder-independent management: export the roster, generate AI Arabic drafts
 * for review, edit, then APPLY (the approval gate — nothing is written until the
 * school clicks Apply), plus CSV/Excel import with a dry-run preview.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
// xlsx dynamically imported in onFile (below) — keeps it out of the eager graph.
import { toast } from 'react-hot-toast';
import { Languages, Download, Sparkles, Upload, Loader2, Check, BarChart3, ListTree } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const REF_TYPES = ['classes', 'subjects', 'streams', 'departments', 'terms', 'programs'] as const;
type RefType = typeof REF_TYPES[number];

interface DraftRow {
  student_id: number;
  admission_no: string | null;
  english_name: string;
  first_name_ar: string | null;
  last_name_ar: string | null;
  full_name_ar: string | null;
  arabic_name_missing: boolean;
  draft?: { first_name_ar: string; last_name_ar: string; full_name_ar: string; confidence: string; needs_review: boolean };
  // local editable state
  _first?: string;
  _last?: string;
  _full?: string;
  _include?: boolean;
}

const confColor: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

export default function LocalizationPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [importReport, setImportReport] = useState<any | null>(null);
  const [pendingImport, setPendingImport] = useState<any[] | null>(null);
  const [coverage, setCoverage] = useState<any | null>(null);
  const [refType, setRefType] = useState<RefType>('classes');
  const [refRows, setRefRows] = useState<{ id: number; name: string; name_ar: string | null; _val?: string }[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  // ── Coverage ────────────────────────────────────────────────────────────────
  const loadCoverage = useCallback(async () => {
    const r = await fetch('/api/localization/coverage', { cache: 'no-store' });
    const j = await r.json();
    if (j.success) setCoverage(j);
  }, []);
  useEffect(() => { loadCoverage(); }, [loadCoverage]);

  // ── Reference-data Arabic labels ────────────────────────────────────────────
  const loadRef = useCallback(async (type: RefType) => {
    setRefLoading(true);
    try {
      const r = await fetch(`/api/localization/reference?type=${type}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.success) setRefRows((j.rows as any[]).map(x => ({ ...x, _val: x.name_ar ?? '' })));
    } finally { setRefLoading(false); }
  }, []);
  useEffect(() => { loadRef(refType); }, [refType, loadRef]);

  const saveRef = useCallback(async (row: { id: number; _val?: string }) => {
    const r = await fetch('/api/localization/reference', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: refType, id: row.id, name_ar: row._val ?? '' }) });
    const j = await r.json();
    if (j.success) { toast.success('Saved'); setRefRows(p => p.map(x => x.id === row.id ? { ...x, name_ar: row._val ?? '' } : x)); loadCoverage(); }
    else toast.error(j.error || 'Failed');
  }, [refType, loadCoverage]);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportCsv = useCallback(async (missing: boolean) => {
    const r = await fetch(`/api/students/arabic-names${missing ? '?missing=1' : ''}`, { cache: 'no-store' });
    const j = await r.json();
    if (!j.success) { toast.error(j.error || 'Export failed'); return; }
    const header = ['admission_no', 'english_name', 'class', 'stream', 'first_name_ar', 'last_name_ar', 'full_name_ar'];
    const lines = [header.join(',')];
    for (const row of j.rows as any[]) {
      const cells = [row.admission_no, row.english_name, row.class_name, row.stream_name, row.first_name_ar, row.last_name_ar, row.full_name_ar]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `arabic-names${missing ? '-missing' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${j.total} learners`);
  }, []);

  // ── AI draft (preview before apply) ─────────────────────────────────────────
  const generateDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/students/arabic-names?missing=1&draft=1', { cache: 'no-store' });
      const j = await r.json();
      if (!j.success) { toast.error(j.error || 'Failed'); return; }
      setRows((j.rows as DraftRow[]).map(row => ({
        ...row,
        _first: row.draft?.first_name_ar ?? '',
        _last: row.draft?.last_name_ar ?? '',
        _full: row.draft?.full_name_ar ?? '',
        _include: row.draft?.confidence === 'high',
      })));
      toast.success(`Generated ${j.total} drafts — review, edit, then Apply`);
    } finally { setLoading(false); }
  }, []);

  const applyDrafts = useCallback(async (mode: 'dry_run' | 'apply') => {
    const selected = rows.filter(r => r._include && (r._full?.trim() || r._first?.trim() || r._last?.trim()));
    if (!selected.length) { toast.error('No rows selected'); return; }
    setApplying(true);
    try {
      const payload = {
        mode, overwrite,
        rows: selected.map(r => ({
          admission_no: r.admission_no,
          first_name_ar: r._first, last_name_ar: r._last, full_name_ar: r._full,
        })),
      };
      const r = await fetch('/api/students/arabic-names', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j.success) { toast.error(j.error || 'Failed'); return; }
      const s = j.summary;
      if (mode === 'apply') {
        toast.success(`Applied: ${s.updated} updated, ${s.skipped_existing} skipped, ${s.not_found} not found`);
        setRows(prev => prev.filter(r => !selected.includes(r)));
      } else {
        toast(`Preview: ${s.updated} would update, ${s.skipped_existing} skipped, ${s.not_found} not found`, { icon: 'ℹ️' });
      }
    } finally { setApplying(false); }
  }, [rows, overwrite]);

  // ── Import from CSV/Excel ───────────────────────────────────────────────────
  const onFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');
    const mapped = json.map(r => {
      const o: Record<string, any> = {};
      for (const [k, v] of Object.entries(r)) o[norm(k)] = v;
      return {
        admission_no: String(o.admissionno ?? o.admission ?? o.regno ?? '').trim(),
        first_name_ar: String(o.firstnamear ?? '').trim(),
        last_name_ar: String(o.lastnamear ?? '').trim(),
        full_name_ar: String(o.fullnamear ?? o.arabicname ?? o.namear ?? '').trim(),
      };
    }).filter(r => r.admission_no);
    if (!mapped.length) { toast.error('No rows with an admission number found'); return; }
    setPendingImport(mapped);
    // Dry-run immediately for a preview report.
    const r = await fetch('/api/students/arabic-names', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: mapped, mode: 'dry_run', overwrite }) });
    const j = await r.json();
    if (!j.success) { toast.error(j.error || 'Failed'); return; }
    setImportReport(j.summary);
  }, [overwrite]);

  const applyImport = useCallback(async () => {
    if (!pendingImport) return;
    setApplying(true);
    try {
      const r = await fetch('/api/students/arabic-names', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: pendingImport, mode: 'apply', overwrite }) });
      const j = await r.json();
      if (!j.success) { toast.error(j.error || 'Failed'); return; }
      const s = j.summary;
      toast.success(`Imported: ${s.updated} updated, ${s.skipped_existing} skipped, ${s.not_found} not found`);
      setImportReport(null); setPendingImport(null);
    } finally { setApplying(false); }
  }, [pendingImport, overwrite]);

  const includedCount = useMemo(() => rows.filter(r => r._include).length, [rows]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Languages className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('localization.title', 'Localization — Arabic Names')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('localization.subtitle', 'Export, draft, review and apply Arabic learner names. Nothing is saved until you click Apply.')}</p>
        </div>
      </div>

      {/* Coverage */}
      {coverage && (
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> {t('localization.coverage', 'Coverage')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <CoverageCard label={t('localization.learnerNames', 'Learner names')} percent={coverage.learners.percent} detail={`${coverage.learners.withArabic}/${coverage.learners.total} · ${coverage.learners.missing} ${t('localization.missing', 'missing')}`} />
            <CoverageCard label={t('localization.uiStrings', 'UI strings')} percent={coverage.ui.percent} detail={`${coverage.ui.missing} ${t('localization.missing', 'missing')}`} />
            <CoverageCard label={t('localization.types.classes', 'Classes')} percent={pct(coverage.reference.classes)} detail={refDetail(coverage.reference.classes, t)} />
            <CoverageCard label={t('localization.types.subjects', 'Subjects')} percent={pct(coverage.reference.subjects)} detail={refDetail(coverage.reference.subjects, t)} />
          </div>
        </section>
      )}

      {/* Export */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Download className="w-4 h-4" /> {t('localization.export', 'Export for review')}</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportCsv(false)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">{t('localization.exportAll', 'Export all learners')}</button>
          <button onClick={() => exportCsv(true)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">{t('localization.exportMissing', 'Export missing only')}</button>
        </div>
      </section>

      {/* AI draft + apply */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Sparkles className="w-4 h-4" /> {t('localization.aiDraft', 'AI draft & apply')}</h2>
          <button onClick={generateDrafts} disabled={loading} className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}{t('localization.generate', 'Generate drafts for missing names')}
          </button>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400">{t('localization.draftWarning', 'Drafts are machine transliterations — review each one (especially amber/red confidence) before applying. High-confidence rows are pre-selected.')}</p>

        {rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-sm flex-wrap">
              <label className="flex items-center gap-1"><input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} /> {t('localization.overwrite', 'Overwrite existing Arabic names')}</label>
              <span className="text-gray-400">{includedCount} {t('localization.selected', 'selected')}</span>
              <button onClick={() => applyDrafts('dry_run')} disabled={applying} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50">{t('localization.previewApply', 'Preview')}</button>
              <button onClick={() => applyDrafts('apply')} disabled={applying} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">{applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('localization.applySelected', 'Apply selected')}</button>
            </div>
            <div className="overflow-x-auto border border-gray-100 dark:border-gray-700 rounded-lg max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2 text-left">{t('students.admission_no', 'Adm #')}</th>
                    <th className="px-2 py-2 text-left">{t('localization.english', 'English name')}</th>
                    <th className="px-2 py-2 text-left">{t('localization.arabicFull', 'Arabic full name')}</th>
                    <th className="px-2 py-2 text-left">{t('localization.confidence', 'Confidence')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.student_id} className="border-t border-gray-100 dark:border-gray-700/50">
                      <td className="px-2 py-1.5"><input type="checkbox" checked={!!r._include} onChange={e => setRows(p => p.map((x, j) => j === i ? { ...x, _include: e.target.checked } : x))} /></td>
                      <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">{r.admission_no}</td>
                      <td className="px-2 py-1.5">{r.english_name}</td>
                      <td className="px-2 py-1.5">
                        <input dir="rtl" value={r._full ?? ''} onChange={e => setRows(p => p.map((x, j) => j === i ? { ...x, _full: e.target.value } : x))}
                          className="w-full min-w-[180px] px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
                      </td>
                      <td className="px-2 py-1.5">
                        {r.draft && <span className={`text-[10px] px-1.5 py-0.5 rounded ${confColor[r.draft.confidence] ?? ''}`}>{r.draft.confidence}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Reference-data Arabic labels */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><ListTree className="w-4 h-4" /> {t('localization.referenceLabels', 'Arabic labels (classes, subjects…)')}</h2>
          <select value={refType} onChange={e => setRefType(e.target.value as RefType)} className="px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm capitalize">
            {REF_TYPES.map(rt => <option key={rt} value={rt}>{t(`localization.types.${rt}`, rt)}</option>)}
          </select>
        </div>
        {refLoading ? <div className="py-6 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : (
          <div className="overflow-x-auto border border-gray-100 dark:border-gray-700 rounded-lg max-h-[50vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 sticky top-0">
                <tr><th className="px-3 py-2 text-left">{t('localization.english', 'English')}</th><th className="px-3 py-2 text-left">{t('localization.arabic', 'Arabic')}</th><th className="px-2 py-2"></th></tr>
              </thead>
              <tbody>
                {refRows.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">—</td></tr>}
                {refRows.map((row, i) => (
                  <tr key={row.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-3 py-1.5">{row.name}</td>
                    <td className="px-3 py-1.5"><input dir="rtl" value={row._val ?? ''} onChange={e => setRefRows(p => p.map((x, j) => j === i ? { ...x, _val: e.target.value } : x))} className="w-full min-w-[160px] px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" /></td>
                    <td className="px-2 py-1.5">{(row._val ?? '') !== (row.name_ar ?? '') && <button onClick={() => saveRef(row)} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">{t('actions.save', 'Save')}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Import */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Upload className="w-4 h-4" /> {t('localization.import', 'Import from CSV / Excel')}</h2>
        <p className="text-xs text-gray-500">{t('localization.importHint', 'Columns: admission_no + full_name_ar (or first_name_ar / last_name_ar). Matched by admission number; existing names are kept unless Overwrite is on.')}</p>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          className="block text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white" />
        {importReport && (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 text-sm space-y-2">
            <p className="text-gray-700 dark:text-gray-200">{t('localization.preview', 'Preview')}: <b>{importReport.updated}</b> will update · {importReport.skipped_existing} skipped (existing) · {importReport.not_found} not found · {importReport.duplicate} duplicate · {importReport.no_data} empty</p>
            <button onClick={applyImport} disabled={applying} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">{applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('localization.applyImport', 'Apply import')}</button>
          </div>
        )}
      </section>
    </div>
  );
}

function pct(ref?: { total: number; withArabic: number }): number {
  if (!ref || !ref.total) return 100;
  return Math.round((ref.withArabic / ref.total) * 100);
}

function refDetail(ref: { total: number; withArabic: number; missing: number } | undefined, t: (k: string, f?: string) => string): string {
  if (!ref) return '—';
  return `${ref.withArabic}/${ref.total} · ${ref.missing} ${t('localization.missing', 'missing')}`;
}

function CoverageCard({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const color = percent >= 90 ? 'text-emerald-600' : percent >= 50 ? 'text-amber-600' : 'text-rose-600';
  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
      <div className="text-xs text-gray-500 truncate">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{percent}%</div>
      <div className="text-[11px] text-gray-400 truncate">{detail}</div>
    </div>
  );
}
