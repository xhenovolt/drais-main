'use client';

/**
 * Finance → Clearance. Entry-clearance status per learner for the current term:
 * who is cleared, partially cleared, blocked, or needs/has a bursar exception.
 * Bursars can request + approve exceptions here (no SQL).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');

const STATUS: Record<string, { label: string; cls: string }> = {
  cleared:             { label: 'Cleared',           cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  partially_cleared:   { label: 'Partially cleared', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  blocked:             { label: 'Blocked',           cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  not_cleared:         { label: 'Not cleared',       cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  exception_requested: { label: 'Needs approval',    cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  exception_approved:  { label: 'Exception granted', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
};

export default function ClearancePage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/finance/clearance', { cache: 'no-store' }); setData(await r.json()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return filter === 'all' ? all : all.filter((r: any) => r.status === filter);
  }, [data, filter]);

  const requestException = useCallback(async (studentId: number) => {
    const reason = window.prompt('Reason for the clearance exception?');
    if (reason === null) return;
    setBusy(studentId);
    try {
      const r = await fetch('/api/finance/clearance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: studentId, term_id: data?.term_id, reason }) });
      if ((await r.json()).success) { toast.success('Exception requested'); load(); } else toast.error('Failed');
    } finally { setBusy(null); }
  }, [data, load]);

  const decide = useCallback(async (studentId: number, exId: number, status: 'approved' | 'rejected') => {
    setBusy(studentId);
    try {
      const r = await fetch('/api/finance/clearance', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: exId, status }) });
      if ((await r.json()).success) { toast.success(`Exception ${status}`); load(); } else toast.error('Failed');
    } finally { setBusy(null); }
  }, [load]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;

  const s = data?.summary ?? {};
  const cards = [
    ['cleared', 'Cleared'], ['partially_cleared', 'Partial'], ['blocked', 'Blocked'],
    ['exception_requested', 'Needs approval'], ['exception_approved', 'Exception'],
  ] as const;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Entry Clearance</h1><p className="text-sm text-gray-500">Current term · {data?.count ?? 0} learners with fees</p></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {cards.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(filter === k ? 'all' : k)}
            className={`rounded-xl border p-3 text-left ${filter === k ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700'} bg-white dark:bg-gray-800`}>
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{s[k] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
            <tr><th className="px-3 py-2 text-left">Learner</th><th className="px-3 py-2 text-left">Class</th><th className="px-3 py-2 text-right">Required</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Missing</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No learners for this filter.</td></tr>}
            {rows.map((r: any) => (
              <tr key={r.studentId} className="border-t border-gray-100 dark:border-gray-700/50">
                <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{r.name}<span className="text-gray-400 text-xs ml-1">{r.admissionNo}</span></td>
                <td className="px-3 py-2 text-gray-500">{r.className || '—'}</td>
                <td className="px-3 py-2 text-right">{fmt(r.requiredBeforeEntry)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.paid)}</td>
                <td className="px-3 py-2 text-right font-semibold text-rose-600">{fmt(r.missing)}</td>
                <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded ${STATUS[r.status]?.cls || ''}`}>{STATUS[r.status]?.label || r.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {(r.status === 'blocked' || r.status === 'partially_cleared' || r.status === 'not_cleared') && (
                    <button disabled={busy === r.studentId} onClick={() => requestException(r.studentId)} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200">Request exception</button>
                  )}
                  {r.status === 'exception_requested' && (
                    <span className="inline-flex gap-1">
                      <button disabled={busy === r.studentId} onClick={() => decide(r.studentId, r.exceptionId, 'approved')} title="Approve" className="text-xs p-1 rounded bg-emerald-600 text-white"><Check className="w-3.5 h-3.5" /></button>
                      <button disabled={busy === r.studentId} onClick={() => decide(r.studentId, r.exceptionId, 'rejected')} title="Reject" className="text-xs p-1 rounded bg-rose-600 text-white"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> "Required" = fees that must be cleared before entry (full for before-entry items, half for partial-allowed tuition). Bursar exceptions override a block.</p>
    </div>
  );
}
