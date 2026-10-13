"use client";
/**
 * /students/repair-names — operator-facing surface for the Name Repair Engine.
 *
 * Three-step workflow:
 *   1. Upload corrections spreadsheet (Admission Number + First/Last/Other Name)
 *   2. Review per-row diffs — DRAIS shows current → incoming side by side,
 *      flags unmatched admission numbers, and counts no-op rows.
 *   3. Apply, then optionally rollback if anything looks off.
 *
 * This page is intentionally separate from the bulk import surface. The
 * Import flow is for adding/updating LEARNERS; this flow is for repairing
 * NAMES on learners that already exist. Keeping them separate prevents
 * the "we re-imported the file and corrupted the names again" failure
 * mode the audit identified.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, RotateCcw, History, Loader2, ArrowRight } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { toast } from 'react-hot-toast';

interface Change {
  person_id: number;
  student_id: number;
  admission_no: string;
  field: 'first_name' | 'last_name' | 'other_name';
  old_value: string | null;
  new_value: string | null;
}

interface MatchedRow {
  sourceRow: number;
  admission_no: string;
  current: { first_name: string | null; last_name: string | null; other_name: string | null };
  incoming: { first_name?: string | null; last_name?: string | null; other_name?: string | null };
  changes: Change[];
}

interface UnmatchedRow { sourceRow: number; admission_no: string; reason: string; }

interface PreviewResponse {
  success: true;
  session_id: number;
  total_rows: number;
  matched_count: number;
  unmatched_count: number;
  changes_count: number;
  matched: MatchedRow[];
  unmatched: UnmatchedRow[];
}

interface HistorySession {
  id: number;
  filename: string | null;
  total_rows: number;
  matched_rows: number;
  applied_rows: number;
  status: 'previewed' | 'applied' | 'rolled_back';
  applied_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
}

export default function RepairNamesPage() {
  const { t, rich, lang, digits, formatNumber, formatDate } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedSessionId, setAppliedSessionId] = useState<number | null>(null);
  const [history, setHistory] = useState<HistorySession[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load past sessions for the audit trail at the bottom of the page.
  async function loadHistory() {
    try {
      const r = await fetch('/api/students/repair-names');
      const d = await r.json();
      if (d.success) setHistory(d.sessions);
    } catch { /* non-fatal */ }
  }
  useEffect(() => { loadHistory(); }, []);

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('mode', 'preview');
      fd.append('file', file);
      const r = await fetch('/api/students/repair-names', { method: 'POST', body: fd });
      const d = await r.json();
      if (!d.success) { toast.error(d.error || t('students.repairNames.previewFailed')); return; }
      setPreview(d);
      setAppliedSessionId(null);
    } catch (e) {
      toast.error(t('students.repairNames.previewError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    if (preview.changes_count === 0) {
      toast(t('students.repairNames.nothingToApply'), { icon: 'ℹ️' });
      return;
    }
    if (!confirm(lang === 'ar' ? t('students.repairNames.confirmApply', { changes: preview.changes_count, learners: preview.matched_count }) : `Apply ${preview.changes_count} name change${preview.changes_count === 1 ? '' : 's'} across ${preview.matched_count} learner${preview.matched_count === 1 ? '' : 's'}?`)) return;
    setApplying(true);
    try {
      const fd = new FormData();
      fd.append('mode', 'apply');
      fd.append('session_id', String(preview.session_id));
      const r = await fetch('/api/students/repair-names', { method: 'POST', body: fd });
      const d = await r.json();
      if (!d.success) { toast.error(d.error || t('students.repairNames.applyFailed')); return; }
      toast.success(lang === 'ar' ? t('students.repairNames.repaired', { count: d.applied_count }) : `Repaired ${d.applied_count} field${d.applied_count === 1 ? '' : 's'}.`);
      setAppliedSessionId(preview.session_id);
      loadHistory();
    } finally {
      setApplying(false);
    }
  }

  async function handleRollback(sessionId: number) {
    if (!confirm(t('students.repairNames.confirmRollback'))) return;
    const fd = new FormData();
    fd.append('mode', 'rollback');
    fd.append('session_id', String(sessionId));
    const r = await fetch('/api/students/repair-names', { method: 'POST', body: fd });
    const d = await r.json();
    if (!d.success) { toast.error(d.error || t('students.repairNames.rollbackFailed')); return; }
    toast.success(lang === 'ar' ? t('students.repairNames.reverted', { count: d.reverted_count }) : `Reverted ${d.reverted_count} field${d.reverted_count === 1 ? '' : 's'}.`);
    if (appliedSessionId === sessionId) setAppliedSessionId(null);
    loadHistory();
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('students.repairNames.title')}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {t('students.repairNames.subtitle')}
        </p>
      </header>

      {/* STEP 1 — UPLOAD ─────────────────────────────────────────── */}
      <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center">{digits(1)}</span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('students.repairNames.uploadTitle')}</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {rich('students.repairNames.columns', { adm: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">Admission Number</code>, first: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">First Name</code>, last: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">Last Name</code>, other: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">Other Name</code>, clear: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">(clear)</code> })}
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded hover:bg-slate-200"
          >
            <Upload className="w-3.5 h-3.5" />
            {t('students.repairNames.chooseFile')}
          </button>
          {file && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              <FileText className="w-3.5 h-3.5" /> {file.name} <span className="text-slate-400">{t('students.repairNames.fileSize', { size: (file.size / 1024).toFixed(1) })}</span>
            </span>
          )}
          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 ms-auto"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            {loading ? t('students.repairNames.analysing') : t('students.repairNames.previewDiff')}
          </button>
        </div>
      </section>

      {/* STEP 2 — REVIEW DIFF ───────────────────────────────────── */}
      {preview && (
        <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center">{digits(2)}</span>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('students.repairNames.reviewTitle')}</h2>
            <span className="ms-auto text-xs text-slate-500">{t('students.repairNames.session', { id: preview.session_id })}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <Stat label={t('students.repairNames.stat.total')}    value={preview.total_rows}      />
            <Stat label={t('students.repairNames.stat.matched')}       value={preview.matched_count}   tone="indigo" />
            <Stat label={t('students.repairNames.stat.changes')}       value={preview.changes_count}   tone="emerald" />
            <Stat label={t('students.repairNames.stat.unmatched')}     value={preview.unmatched_count} tone="red" />
          </div>

          {/* UNMATCHED ROWS — surfaced loud, never silent. */}
          {preview.unmatched.length > 0 && (
            <div className="border border-red-300 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <h3 className="text-xs font-bold text-red-900 dark:text-red-200">
                  {lang === 'ar' ? t('students.repairNames.unmatchedTitle', { count: preview.unmatched.length }) : `${preview.unmatched.length} row${preview.unmatched.length === 1 ? '' : 's'} did not match any learner`}
                </h3>
              </div>
              <ul className="text-xs text-red-800 dark:text-red-300 space-y-1 max-h-40 overflow-y-auto">
                {preview.unmatched.map(u => (
                  <li key={`${u.sourceRow}-${u.admission_no}`}>
                    {rich('students.repairNames.unmatchedRow', { adm: <code className="font-mono">{u.admission_no}</code> }, { row: u.sourceRow, reason: u.reason })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* MATCHED ROWS WITH CHANGES */}
          {preview.matched.filter(m => m.changes.length > 0).length === 0 ? (
            <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm">
              {t('students.repairNames.allEqual')}
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.row')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.admNo')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.field')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.current')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.incoming')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview.matched.flatMap(m => m.changes.map((c, idx) => (
                    <tr key={`${m.sourceRow}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-1.5 text-slate-500">{digits(m.sourceRow)}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-300">{m.admission_no}</td>
                      <td className="px-3 py-1.5"><code className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{c.field}</code></td>
                      <td className="px-3 py-1.5 text-slate-500 line-through">{c.old_value ?? <em>null</em>}</td>
                      <td className="px-3 py-1.5 font-semibold text-emerald-700 dark:text-emerald-400">{c.new_value ?? <em>null</em>}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {appliedSessionId === preview.session_id ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="w-4 h-4" /> {t('students.repairNames.applied', { id: preview.session_id })}
              </span>
            ) : (
              <button
                onClick={handleApply}
                disabled={applying || preview.changes_count === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {lang === 'ar' ? (preview.changes_count > 0 ? t('students.repairNames.applyN', { count: preview.changes_count }) : t('students.repairNames.applyChanges')) : `Apply ${preview.changes_count > 0 ? `${preview.changes_count} change${preview.changes_count === 1 ? '' : 's'}` : 'changes'}`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* STEP 3 — HISTORY + ROLLBACK ────────────────────────────── */}
      <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('students.repairNames.historyTitle')}</h2>
          <button onClick={loadHistory} className="ms-auto text-xs text-slate-500 hover:underline">{t('students.repairNames.refresh')}</button>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">{t('students.repairNames.noHistory')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2 text-start font-semibold">#</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.file')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.created')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.rows')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.applied')}</th>
                  <th className="px-3 py-2 text-start font-semibold">{t('students.repairNames.col.status')}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map(s => (
                  <tr key={s.id}>
                    <td className="px-3 py-1.5 text-slate-500">{digits(s.id)}</td>
                    <td className="px-3 py-1.5 truncate max-w-[200px]">{s.filename || <em>—</em>}</td>
                    <td className="px-3 py-1.5">{lang === 'ar' ? formatDate(s.created_at, 'datetime') : new Date(s.created_at).toLocaleString()}</td>
                    <td className="px-3 py-1.5">{digits(s.matched_rows)} / {digits(s.total_rows)}</td>
                    <td className="px-3 py-1.5">{digits(s.applied_rows)}</td>
                    <td className="px-3 py-1.5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-3 py-1.5 text-end">
                      {s.status === 'applied' && (
                        <button
                          onClick={() => handleRollback(s.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {t('students.repairNames.rollback')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'indigo' | 'emerald' | 'red' }) {
  const { digits } = useI18n();
  const ring = tone === 'indigo' ? 'ring-indigo-200 dark:ring-indigo-800'
             : tone === 'emerald' ? 'ring-emerald-200 dark:ring-emerald-800'
             : tone === 'red'     ? 'ring-red-200 dark:ring-red-800'
             : 'ring-slate-200 dark:ring-slate-700';
  const text = tone === 'indigo' ? 'text-indigo-700 dark:text-indigo-300'
             : tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
             : tone === 'red'     ? 'text-red-700 dark:text-red-300'
             : 'text-slate-700 dark:text-slate-300';
  return (
    <div className={`rounded-lg ring-1 ${ring} p-3`}>
      <p className={`text-2xl font-bold ${text}`}>{digits(value)}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: HistorySession['status'] }) {
  const { t } = useI18n();
  const c = status === 'applied'      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
          : status === 'rolled_back'  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
          :                             'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${c}`}>{t(`students.repairNames.status.${status}`, String(status))}</span>;
}
