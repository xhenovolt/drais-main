'use client';

/**
 * Waivers & discounts — request a waiver/discount/override on a learner's
 * fees, then approve or reject. Uses /api/finance/fee-rules/adjustments
 * (learner_fee_adjustments) — the canonical system per the Finance
 * Consolidation Plan Stage C. The old /api/finance/waivers +
 * waivers_discounts table is retired (410); approving here re-prices any
 * already-generated bill immediately (see repriceApprovedAdjustments in
 * src/lib/finance/feeRules.ts), not just future bill runs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Percent, Plus, Loader2, Search, CheckCircle, XCircle, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCurrency } from '@/hooks/useCurrency';

const STATUS_TONE: Record<string, string> = {
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const ADJUSTMENT_TYPES = [
  { value: 'waiver', label: 'Full waiver' },
  { value: 'percent_discount', label: 'Percentage discount' },
  { value: 'fixed_discount', label: 'Fixed amount discount' },
  { value: 'override', label: 'Override (set exact amount)' },
];

function describeAdjustment(w: any, format: (n: number) => string): string {
  if (w.adjustment_type === 'waiver') return 'Full waiver';
  if (w.adjustment_type === 'percent_discount') return `${w.value}% off`;
  if (w.adjustment_type === 'fixed_discount') return `${format(w.value)} off`;
  if (w.adjustment_type === 'override') return `Override → ${format(w.value)}`;
  return String(w.adjustment_type);
}

export default function WaiversPage() {
  const { format } = useCurrency();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ student_id: null, student_name: '', term_id: '', value: 0, adjustment_type: 'percent_discount', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/finance/fee-rules/adjustments', { cache: 'no-store' }); const j = await r.json(); setRows(j.adjustments || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch('/api/terms').then((r) => r.json()).then((j) => setTerms(j.data || [])).catch(() => {}); }, []);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/students/full?q=${encodeURIComponent(q)}&limit=8`); const j = await r.json(); setResults(j.data || j.students || []); } catch { /* */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const create = useCallback(async () => {
    setError(null);
    const needsValue = form.adjustment_type !== 'waiver';
    if (!form.student_id || !form.term_id || (needsValue && !(form.value > 0)) || !form.reason.trim()) { setError('Learner, term, amount and reason are required'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/finance/fee-rules/adjustments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ student_id: form.student_id, term_id: form.term_id, adjustment_type: form.adjustment_type, value: form.value, reason: form.reason }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Failed'); return; }
      toast.success('Adjustment requested');
      setShow(false); setForm({ student_id: null, student_name: '', term_id: '', value: 0, adjustment_type: 'percent_discount', reason: '' }); setQ('');
      load();
    } finally { setBusy(false); }
  }, [form, load]);

  const decide = useCallback(async (id: number, status: 'approved' | 'rejected') => {
    let rejection_reason = '';
    if (status === 'rejected') { rejection_reason = prompt('Reason for rejection?') || ''; }
    const r = await fetch(`/api/finance/fee-rules/adjustments/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, rejection_reason }) });
    const j = await r.json();
    if (!r.ok) { toast.error(j.error || 'Failed'); return; }
    toast.success(`Adjustment ${status}`);
    load();
  }, [load]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Percent className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Waivers & Discounts</h1><p className="text-sm text-gray-500 dark:text-gray-400">Request, approve or reject fee waivers, discounts, and overrides.</p></div>
        </div>
        <button onClick={() => setShow(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> Request adjustment</button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
            <tr><th className="px-4 py-2 text-left">Learner</th><th className="px-4 py-2 text-left">Term</th><th className="px-4 py-2 text-right">Adjustment</th><th className="px-4 py-2 text-left">Reason</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No adjustments yet.</td></tr>}
            {rows.map((w) => (
              <tr key={w.id} className="border-t border-gray-100 dark:border-gray-700/50">
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{[w.first_name, w.last_name].filter(Boolean).join(' ') || `#${w.student_id}`}<span className="block text-[11px] text-gray-400 font-mono">{w.admission_no}</span></td>
                <td className="px-4 py-2 text-gray-500">{w.term_name || '—'}</td>
                <td className="px-4 py-2 text-right">{describeAdjustment(w, format)}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{w.reason}{w.rejection_reason ? <span className="block text-red-500">Rejected: {w.rejection_reason}</span> : null}</td>
                <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_TONE[w.status] || ''}`}>{w.status}</span></td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {w.status === 'pending' && (
                    <>
                      <button onClick={() => decide(w.id, 'approved')} className="text-xs text-green-600 hover:underline mr-2 inline-flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />approve</button>
                      <button onClick={() => decide(w.id, 'rejected')} className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {show && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShow(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-900 dark:text-white">Request adjustment</h2><button onClick={() => setShow(false)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <div className="relative">
              {form.student_id ? (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm"><span>{form.student_name}</span><button onClick={() => setForm({ ...form, student_id: null, student_name: '' })} className="text-xs text-indigo-600">change</button></div>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"><Search className="w-4 h-4 text-gray-400" /><input autoFocus placeholder="Search learner…" value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" /></div>
                  {results.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow max-h-48 overflow-y-auto">
                      {results.map((s: any) => <button key={s.id} onClick={() => { setForm({ ...form, student_id: s.id, student_name: s.full_name || s.name }); setResults([]); setQ(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">{s.full_name || s.name} <span className="text-xs text-gray-400">{s.admission_no}</span></button>)}
                    </div>
                  )}
                </>
              )}
            </div>
            <select value={form.term_id} onChange={(e) => setForm({ ...form, term_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
              <option value="">Select term…</option>
              {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name || `Term ${t.id}`}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={form.adjustment_type} onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                {ADJUSTMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {form.adjustment_type !== 'waiver' && (
                <input type="number" placeholder={form.adjustment_type === 'percent_discount' ? '% off' : 'Amount'} value={form.value || ''} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              )}
            </div>
            <textarea placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm resize-none" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1"><button onClick={() => setShow(false)} className="px-4 py-2 text-sm text-gray-500">Cancel</button><button onClick={create} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Submit</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
