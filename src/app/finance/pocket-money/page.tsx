'use client';

/**
 * Learner pocket money — custodial wallets. Deposit (parent) / withdraw
 * (learner) with overdraw protection, low-balance alerts, per-learner statement.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { PiggyBank, Plus, Loader2, AlertTriangle, Search, X } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

export default function PocketMoneyPage() {
  const { format } = useCurrency();
  const [data, setData] = useState<{ accounts: any[]; totalLiability: number; lowAlerts: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ type: 'deposit' | 'withdrawal'; studentId?: number; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statement, setStatement] = useState<{ name: string; rows: any[] } | null>(null);

  // student search (for a new deposit)
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [form, setForm] = useState({ amount: 0, custodian: '', reason: '', depositor_name: '', slip_no: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/finance/pocket-money', { cache: 'no-store' }); setData(await r.json()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/students/full?q=${encodeURIComponent(q)}&limit=8`);
      const j = await r.json();
      setResults(j.data || j.students || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const submit = useCallback(async () => {
    if (!modal?.studentId) { setError('Pick a learner'); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/finance/pocket-money', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ student_id: modal.studentId, type: modal.type, ...form }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Failed'); return; }
      setModal(null); setForm({ amount: 0, custodian: '', reason: '', depositor_name: '', slip_no: '' }); setQ(''); setResults([]);
      load();
    } finally { setBusy(false); }
  }, [modal, form, load]);

  const openStatement = useCallback(async (studentId: number, name: string) => {
    const r = await fetch(`/api/finance/pocket-money/${studentId}`);
    const j = await r.json();
    setStatement({ name, rows: j.transactions || [] });
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  const accounts = data?.accounts ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><PiggyBank className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Pocket Money</h1><p className="text-sm text-gray-500 dark:text-gray-400">Held for learners: <span className="font-semibold">{format(data?.totalLiability ?? 0)}</span></p></div>
        </div>
        <button onClick={() => setModal({ type: 'deposit' })} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> Deposit</button>
      </div>

      {error && !modal && <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-sm">{error}</div>}

      {(data?.lowAlerts?.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4" />{data!.lowAlerts.length} learner(s) at/below their low-balance threshold.
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
            <tr><th className="px-4 py-2 text-left">Learner</th><th className="px-4 py-2 text-left">Custodian</th><th className="px-4 py-2 text-right">Deposits</th><th className="px-4 py-2 text-right">Withdrawals</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {accounts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No pocket money accounts yet. Make a deposit to start.</td></tr>}
            {accounts.map((a) => (
              <tr key={a.account_id} className={`border-t border-gray-100 dark:border-gray-700/50 ${a.low ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}>
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{a.student_name || `#${a.student_id}`}<span className="block text-[11px] text-gray-400 font-mono">{a.admission_no}</span></td>
                <td className="px-4 py-2 text-gray-500">{a.custodian || '—'}</td>
                <td className="px-4 py-2 text-right text-green-600">{format(a.deposits)}</td>
                <td className="px-4 py-2 text-right text-red-600">{format(a.withdrawals)}</td>
                <td className="px-4 py-2 text-right font-bold text-gray-900 dark:text-white">{format(a.balance)}{a.low && <AlertTriangle className="inline w-3.5 h-3.5 ml-1 text-amber-500" />}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => setModal({ type: 'deposit', studentId: a.student_id, name: a.student_name })} className="text-xs text-green-600 hover:underline mr-2">+ deposit</button>
                  <button onClick={() => setModal({ type: 'withdrawal', studentId: a.student_id, name: a.student_name })} className="text-xs text-red-600 hover:underline mr-2">− withdraw</button>
                  <button onClick={() => openStatement(a.student_id, a.student_name)} className="text-xs text-indigo-600 hover:underline">statement</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transaction modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white capitalize">{modal.type}{modal.name ? ` — ${modal.name}` : ''}</h2>
            {!modal.studentId && (
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"><Search className="w-4 h-4 text-gray-400" /><input autoFocus placeholder="Search learner by name/admission…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" /></div>
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow max-h-48 overflow-y-auto">
                    {results.map((s: any) => (
                      <button key={s.id} onClick={() => { setModal({ ...modal, studentId: s.id, name: s.full_name || s.name }); setResults([]); setQ(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                        {s.full_name || s.name} <span className="text-xs text-gray-400">{s.admission_no}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {modal.studentId && !modal.name && <p className="text-xs text-gray-400">Learner #{modal.studentId}</p>}
            <input type="number" placeholder="Amount" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            {modal.type === 'deposit' && <input placeholder="Depositor (parent/guardian)" value={form.depositor_name} onChange={(e) => setForm({ ...form, depositor_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />}
            <input placeholder={modal.type === 'withdrawal' ? 'Reason for withdrawal' : 'Custodian (who holds it)'} value={modal.type === 'withdrawal' ? form.reason : form.custodian} onChange={(e) => setForm({ ...form, [modal.type === 'withdrawal' ? 'reason' : 'custodian']: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <input placeholder="Slip / reference no (optional)" value={form.slip_no} onChange={(e) => setForm({ ...form, slip_no: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
              <button onClick={submit} disabled={busy || !modal.studentId || !form.amount} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${modal.type === 'withdrawal' ? 'bg-red-600' : 'bg-green-600'}`}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{modal.type === 'withdrawal' ? 'Withdraw' : 'Deposit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Statement modal */}
      {statement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setStatement(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold text-gray-900 dark:text-white">Statement — {statement.name}</h2><button onClick={() => setStatement(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <table className="w-full text-sm">
              <thead className="text-gray-500"><tr><th className="text-left py-1">Date</th><th className="text-left">Type</th><th className="text-right">Amount</th><th className="text-left pl-2">Note</th></tr></thead>
              <tbody>
                {statement.rows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">No transactions.</td></tr>}
                {statement.rows.map((t: any) => (
                  <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="py-1.5 text-xs">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className={t.type === 'deposit' ? 'text-green-600' : 'text-red-600'}>{t.type}</td>
                    <td className="text-right">{format(t.amount)}</td>
                    <td className="pl-2 text-xs text-gray-500">{t.reason || t.depositor_name || t.slip_no || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
