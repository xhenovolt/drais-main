'use client';

/**
 * Budgets — plan spend (term/department/project/class/activity), track
 * spent/remaining from linked expenses, and warn before overspending.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { PiggyBank, Plus, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

const TYPES = ['term', 'department', 'project', 'class', 'activity'];

export default function BudgetsPage() {
  const { format } = useCurrency();
  const [data, setData] = useState<{ budgets: any[]; warnings: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', budget_type: 'term', approved_amount: 0, planned_amount: 0, warning_threshold_pct: 80, notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/finance/budgets', { cache: 'no-store' }); setData(await r.json()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/finance/budgets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Failed'); return; }
      setShowCreate(false); setForm({ name: '', budget_type: 'term', approved_amount: 0, planned_amount: 0, warning_threshold_pct: 80, notes: '' });
      load();
    } finally { setBusy(false); }
  }, [form, load]);

  const setStatus = useCallback(async (id: number, status: string) => {
    await fetch(`/api/finance/budgets/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    load();
  }, [load]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  const budgets = data?.budgets ?? [];
  const warnings = data?.warnings ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><PiggyBank className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Budgets</h1><p className="text-sm text-gray-500 dark:text-gray-400">Plan and track spend against linked expenses.</p></div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> New budget</button>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-sm">{error}</div>}

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className={`flex items-center gap-2 p-3 rounded-lg text-sm ${w.level === 'danger' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
              <AlertTriangle className="w-4 h-4" />{w.message}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {budgets.length === 0 && <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-400 text-sm">No budgets yet.</div>}
        {budgets.map((b) => {
          const pct = Math.min(100, b.used_pct);
          const barColor = b.deficit ? 'bg-red-500' : b.near_threshold ? 'bg-amber-500' : 'bg-green-500';
          return (
            <div key={b.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{b.name} <span className="text-xs font-normal text-gray-400 capitalize">· {b.budget_type}</span></p>
                  <p className="text-xs text-gray-500">Approved {format(b.approved_amount)} · Spent {format(b.spent)} · {b.remaining < 0 ? 'Over by ' : 'Remaining '}{format(Math.abs(b.remaining))}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${b.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : b.status === 'closed' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{b.status}</span>
                  {b.status === 'draft' && <button onClick={() => setStatus(b.id, 'approved')} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />Approve</button>}
                  {b.status === 'approved' && <button onClick={() => setStatus(b.id, 'closed')} className="text-xs text-gray-500 hover:underline">Close</button>}
                </div>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"><div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} /></div>
              <p className="text-[11px] text-gray-400 mt-1">{b.used_pct}% used{b.deficit ? ' — over budget' : b.near_threshold ? ` — at/over ${b.warning_threshold_pct}% threshold` : ''}</p>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">New budget</h2>
            <input placeholder="Name (e.g. Term 1 Operations)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <select value={form.budget_type} onChange={(e) => setForm({ ...form, budget_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm capitalize">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Planned" value={form.planned_amount} onChange={(e) => setForm({ ...form, planned_amount: Number(e.target.value) })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              <input type="number" placeholder="Approved" value={form.approved_amount} onChange={(e) => setForm({ ...form, approved_amount: Number(e.target.value) })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            </div>
            <label className="block text-xs text-gray-500">Warning threshold % <input type="number" value={form.warning_threshold_pct} onChange={(e) => setForm({ ...form, warning_threshold_pct: Number(e.target.value) })} className="ml-2 w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
              <button onClick={create} disabled={busy || !form.name} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
