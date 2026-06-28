'use client';

/**
 * Report Comments — schools define result-table comment rules from the UI.
 * Match by grade, score range, subject, class, program or competency; the most
 * specific active rule wins. Includes a live preview resolver.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquareText, Plus, Loader2, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { resolveComment } from '@/lib/drce/reportComments';

const SCOPES = ['global', 'program', 'class', 'subject', 'grade', 'score', 'competency', 'class_teacher'];
const blank = { scope: 'grade', grade_code: '', min_score: '', max_score: '', competency_level: '', comment_text: '', language: 'en', priority: 100, is_active: true };

export default function ReportCommentsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState({ grade: 'A', score: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/report-comments', { cache: 'no-store' }); const j = await r.json(); setRules(j.rules || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!modal.comment_text?.trim()) { toast.error('Comment text is required'); return; }
    setBusy(true);
    try {
      const editing = !!modal.id;
      const body = { ...modal, min_score: modal.min_score === '' ? null : Number(modal.min_score), max_score: modal.max_score === '' ? null : Number(modal.max_score) };
      const r = await fetch(`/api/report-comments${editing ? `/${modal.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { toast.error((await r.json()).error || 'Failed'); return; }
      toast.success(editing ? 'Rule updated' : 'Rule added'); setModal(null); load();
    } finally { setBusy(false); }
  }, [modal, load]);

  const del = useCallback(async (id: number) => {
    if (!confirm('Delete this comment rule?')) return;
    await fetch(`/api/report-comments/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load();
  }, [load]);

  // Live preview using the same pure resolver the report pipeline will use.
  const previewText = useMemo(() => resolveComment(
    rules.map((r) => ({ ...r, min_score: r.min_score == null ? null : Number(r.min_score), max_score: r.max_score == null ? null : Number(r.max_score) })),
    { grade: preview.grade || null, score: preview.score === '' ? null : Number(preview.score) },
  ).text, [rules, preview]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><MessageSquareText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Report Comments</h1><p className="text-sm text-gray-500 dark:text-gray-400">Rules that fill the result-table comment column. Most specific match wins.</p></div>
        </div>
        <button onClick={() => setModal({ ...blank })} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> New rule</button>
      </div>

      {/* Live preview */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Preview — what comment a result would get</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label>Grade <input value={preview.grade} onChange={(e) => setPreview({ ...preview, grade: e.target.value })} className="w-16 px-2 py-1 ml-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" /></label>
          <label>Score <input type="number" value={preview.score} onChange={(e) => setPreview({ ...preview, score: e.target.value })} className="w-20 px-2 py-1 ml-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" /></label>
          <span className="text-gray-400">→</span>
          <span className="font-medium text-gray-900 dark:text-white">{previewText || <em className="text-gray-400">no matching rule</em>}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
            <tr><th className="px-3 py-2 text-left">Scope</th><th className="px-3 py-2 text-left">Match</th><th className="px-3 py-2 text-left">Comment</th><th className="px-3 py-2 text-left">Prio</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">No comment rules yet.</td></tr>}
            {rules.map((r) => (
              <tr key={r.id} className={`border-t border-gray-100 dark:border-gray-700/50 ${!r.is_active ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 capitalize">{r.scope}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{[r.grade_code && `grade ${r.grade_code}`, (r.min_score != null || r.max_score != null) && `score ${r.min_score ?? '–'}..${r.max_score ?? '–'}`, r.competency_level && `comp ${r.competency_level}`].filter(Boolean).join(' · ') || 'any'}</td>
                <td className="px-3 py-2 max-w-xs truncate">{r.comment_text}</td>
                <td className="px-3 py-2">{r.priority}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => setModal({ ...r, min_score: r.min_score ?? '', max_score: r.max_score ?? '', is_active: !!r.is_active })} className="text-xs text-indigo-600 hover:underline mr-2">edit</button>
                  <button onClick={() => del(r.id)} className="text-red-600 p-1"><Trash2 className="w-4 h-4 inline" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-900 dark:text-white">{modal.id ? 'Edit' : 'New'} comment rule</h2><button onClick={() => setModal(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">Scope<select value={modal.scope} onChange={(e) => setModal({ ...modal, scope: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm capitalize">{SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="text-xs text-gray-500">Grade code<input value={modal.grade_code} onChange={(e) => setModal({ ...modal, grade_code: e.target.value })} placeholder="A / D / ABS" className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
              <label className="text-xs text-gray-500">Min score<input type="number" value={modal.min_score} onChange={(e) => setModal({ ...modal, min_score: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
              <label className="text-xs text-gray-500">Max score<input type="number" value={modal.max_score} onChange={(e) => setModal({ ...modal, max_score: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
              <label className="text-xs text-gray-500">Competency<input value={modal.competency_level} onChange={(e) => setModal({ ...modal, competency_level: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
              <label className="text-xs text-gray-500">Priority<input type="number" value={modal.priority} onChange={(e) => setModal({ ...modal, priority: Number(e.target.value) })} className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
            </div>
            <textarea placeholder="Comment text (e.g. Excellent performance. Keep it up.)" value={modal.comment_text} onChange={(e) => setModal({ ...modal, comment_text: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm resize-none" />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={modal.is_active} onChange={(e) => setModal({ ...modal, is_active: e.target.checked })} /> Active</label>
              <div className="flex gap-2"><button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-500">Cancel</button><button onClick={save} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
