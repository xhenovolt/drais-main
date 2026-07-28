'use client';

/**
 * Intelligent Overall-Comment Engine — admin UI (Report Engine Patch Program,
 * Phase II). Founder-independent CRUD for the rules that resolve Class
 * Teacher / DOS / Headteacher (and custom-role) report comments from a
 * learner's actual performance, instead of the old identical-for-everyone
 * static text.
 *
 * Reuses VisibilityRuleEditor's nested AND/OR/NOT rule builder — same
 * VisibilityRule tree type, different (flatter) binding catalogue — so
 * schools building comment conditions get the same proven UI they already
 * use for section visibility.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2, X, ArrowUp, ArrowDown, Download, Upload, FlaskConical } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { VisibilityRuleEditor } from '@/components/drce/editor/VisibilityRuleEditor';
import { describeRule, type VisibilityRule } from '@/lib/drce/visibility';
import {
  resolveAllOverallComments, COMMENT_FIELD_BINDINGS,
  type CommentBankRule, type CommentResolutionCtx,
} from '@/lib/drce/commentEngine';

const ROLES: Array<{ value: CommentBankRule['role']; label: string }> = [
  { value: 'classTeacher', label: 'Class Teacher' },
  { value: 'dos',          label: 'Director of Studies' },
  { value: 'headTeacher',  label: 'Headteacher' },
  { value: 'custom',       label: 'Custom role…' },
];

const blank = (): Partial<CommentBankRule> => ({
  role: 'headTeacher', customKey: '', mode: 'replace', condition: null,
  commentText: '', commentTextAr: '', priority: 100, isActive: true,
});

const previewDefaults: CommentResolutionCtx = {
  average: 75, total: 600, totalPossible: 800, percentage: 75,
  position: 5, totalInClass: 40, aggregate: 15, division: 'II', overallGrade: 'II',
  subjects: [],
};

export function OverallCommentsPanel() {
  const [rules, setRules] = useState<CommentBankRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<CommentBankRule> | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CommentResolutionCtx>(previewDefaults);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/report-comments/overall', { cache: 'no-store' });
      const j = await r.json();
      setRules(j.rules || []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!modal) return;
    if (!modal.commentText?.trim()) { toast.error('Comment text is required'); return; }
    if (modal.role === 'custom' && !modal.customKey?.trim()) { toast.error('Custom role key is required'); return; }
    setBusy(true);
    try {
      const editing = !!modal.id;
      const r = await fetch(`/api/report-comments/overall${editing ? `/${modal.id}` : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(modal),
      });
      if (!r.ok) { toast.error((await r.json().catch(() => ({}))).error || 'Failed'); return; }
      toast.success(editing ? 'Rule updated' : 'Rule added');
      setModal(null);
      load();
    } finally {
      setBusy(false);
    }
  }, [modal, load]);

  const del = useCallback(async (id: number) => {
    if (!confirm('Delete this comment rule?')) return;
    await fetch(`/api/report-comments/overall/${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    load();
  }, [load]);

  const move = useCallback(async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    setRules(next); // optimistic
    const order = next.map((r, i) => ({ id: r.id!, priority: (i + 1) * 10 }));
    await fetch('/api/report-comments/overall/reorder', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order }),
    });
    load();
  }, [rules, load]);

  const exportRules = useCallback(() => {
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `overall-comment-rules-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rules]);

  const importRules = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<CommentBankRule>[];
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of rules');
      setBusy(true);
      let ok = 0, failed = 0;
      for (const r of parsed) {
        const { id: _drop, schoolId: _drop2, ...body } = r as any;
        const res = await fetch('/api/report-comments/overall', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) ok++; else failed++;
      }
      toast.success(`Imported ${ok} rule${ok === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Import failed — expected a JSON export from this same panel');
    } finally {
      setBusy(false);
    }
  }, [load]);

  // Live preview — same pure resolver the snapshot generator calls, so
  // "what will this rule produce" is never a guess.
  const previewResult = useMemo(() => resolveAllOverallComments(
    rules, preview,
    { classTeacher: '(no rule matched — static fallback would show)', dos: '(no rule matched — static fallback would show)', headTeacher: '(no rule matched — static fallback would show)' },
  ), [rules, preview]);

  if (loading) return <div className="flex items-center justify-center min-h-[30vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl">
          Rules that resolve the whole-report Class Teacher / DOS / Headteacher comments from a
          learner&apos;s actual performance — replacing one-size-fits-all text. <strong>Replace</strong> rules
          compete for the base comment (most specific priority wins); <strong>append</strong> rules add extra
          sentences on top (e.g. a Division I congratulation) regardless of which base matched.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={exportRules} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Import
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importRules(e.target.files[0])} />
          </label>
          <button onClick={() => setModal(blank())} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium">
            <Plus className="w-4 h-4" /> New rule
          </button>
        </div>
      </div>

      {/* Live test panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" /> Test — what would a learner with these numbers receive?</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {(['average', 'aggregate', 'position', 'totalInClass'] as const).map((k) => (
            <label key={k} className="text-xs text-gray-500">{k}
              <input type="number" value={preview[k] as number ?? ''} onChange={(e) => setPreview((p) => ({ ...p, [k]: Number(e.target.value) }))}
                className="w-20 ml-1.5 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
            </label>
          ))}
          <label className="text-xs text-gray-500">division
            <input value={preview.division ?? ''} onChange={(e) => setPreview((p) => ({ ...p, division: e.target.value }))}
              className="w-16 ml-1.5 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
          </label>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          {(['headTeacher', 'dos', 'classTeacher'] as const).map((role) => (
            <div key={role} className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
              <p className="text-[10px] uppercase font-semibold text-gray-400 mb-1">{ROLES.find(r => r.value === role)?.label}</p>
              <p className="text-gray-800 dark:text-gray-100">{previewResult[role]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Mode</th>
              <th className="px-3 py-2 text-left">Condition</th>
              <th className="px-3 py-2 text-left">Comment</th>
              <th className="px-3 py-2 text-left">Prio</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No overall-comment rules yet — schools without rules keep the original static comments.</td></tr>}
            {rules.map((r, i) => (
              <tr key={r.id} className={`border-t border-gray-100 dark:border-gray-700/50 ${!r.isActive ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2">{ROLES.find(x => x.value === r.role)?.label}{r.role === 'custom' && r.customKey ? ` (${r.customKey})` : ''}</td>
                <td className="px-3 py-2 capitalize">{r.mode}</td>
                <td className="px-3 py-2 text-xs text-gray-500 max-w-[220px] truncate" title={describeRule(r.condition)}>{describeRule(r.condition)}</td>
                <td className="px-3 py-2 max-w-xs truncate">{r.commentText}</td>
                <td className="px-3 py-2">{r.priority}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 p-1"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === rules.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 p-1"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setModal(r)} className="text-xs text-indigo-600 hover:underline mx-2">edit</button>
                  <button onClick={() => del(r.id!)} className="text-red-600 p-1"><Trash2 className="w-4 h-4 inline" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{modal.id ? 'Edit' : 'New'} overall-comment rule</h2>
              <button onClick={() => setModal(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">Role
                <select value={modal.role} onChange={(e) => setModal({ ...modal, role: e.target.value as CommentBankRule['role'] })}
                  className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              {modal.role === 'custom' && (
                <label className="text-xs text-gray-500">Custom role key
                  <input value={modal.customKey ?? ''} onChange={(e) => setModal({ ...modal, customKey: e.target.value })}
                    placeholder="e.g. registrar" className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                </label>
              )}
              <label className="text-xs text-gray-500">Mode
                <select value={modal.mode} onChange={(e) => setModal({ ...modal, mode: e.target.value as 'replace' | 'append' })}
                  className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                  <option value="replace">Replace (base comment)</option>
                  <option value="append">Append (adds onto the base)</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">Priority (lower = first)
                <input type="number" value={modal.priority ?? 100} onChange={(e) => setModal({ ...modal, priority: Number(e.target.value) })}
                  className="w-full mt-1 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              </label>
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-1">Condition (blank = always matches — use for a fallback)</p>
              <VisibilityRuleEditor
                value={modal.condition as VisibilityRule | null | undefined}
                onChange={(next) => setModal({ ...modal, condition: next })}
                bindings={COMMENT_FIELD_BINDINGS}
              />
            </div>

            <textarea placeholder="Comment text (English)" value={modal.commentText ?? ''} onChange={(e) => setModal({ ...modal, commentText: e.target.value })}
              rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm resize-none" />
            <textarea placeholder="Comment text (Arabic, optional)" dir="rtl" value={modal.commentTextAr ?? ''} onChange={(e) => setModal({ ...modal, commentTextAr: e.target.value })}
              rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm resize-none" />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={modal.isActive ?? true} onChange={(e) => setModal({ ...modal, isActive: e.target.checked })} /> Active</label>
              <div className="flex gap-2">
                <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
                <button onClick={save} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
