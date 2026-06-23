'use client';

/**
 * Money locations — where cash actually sits (cash at bursar/headteacher, bank,
 * mobile money, School Pay, SurePay, other) with derived balances + transfers.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Plus, ArrowLeftRight, Loader2, Banknote, Building2, Smartphone, Landmark } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';

const TYPES = [
  { id: 'cash_bursar', label: 'Cash at Bursar', icon: Banknote },
  { id: 'cash_headteacher', label: 'Cash at Headteacher', icon: Banknote },
  { id: 'bank', label: 'Bank Account', icon: Landmark },
  { id: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
  { id: 'schoolpay', label: 'School Pay', icon: Building2 },
  { id: 'surepay', label: 'SurePay', icon: Building2 },
  { id: 'other', label: 'Other', icon: Wallet },
];
const typeLabel = (t: string) => TYPES.find((x) => x.id === t)?.label || t;

export default function MoneyLocationsPage() {
  const { format } = useCurrency();
  const [data, setData] = useState<{ locations: any[]; totalsByType: Record<string, number>; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', location_type: 'cash_bursar', currency: 'UGX', bank_name: '', account_number: '', opening_balance: 0 });
  const [xfer, setXfer] = useState({ from_wallet_id: '', to_wallet_id: '', amount: 0, transfer_type: 'cash_to_bank', reference: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/finance/locations', { cache: 'no-store' }); setData(await r.json()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/finance/locations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Failed'); return; }
      setShowCreate(false); setForm({ name: '', location_type: 'cash_bursar', currency: 'UGX', bank_name: '', account_number: '', opening_balance: 0 });
      load();
    } finally { setBusy(false); }
  }, [form, load]);

  const transfer = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/finance/locations/transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(xfer) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Transfer failed'); return; }
      setShowTransfer(false); setXfer({ from_wallet_id: '', to_wallet_id: '', amount: 0, transfer_type: 'cash_to_bank', reference: '', notes: '' });
      load();
    } finally { setBusy(false); }
  }, [xfer, load]);

  const locations = data?.locations ?? [];
  const total = data?.total ?? 0;
  const byType = useMemo(() => Object.entries(data?.totalsByType ?? {}), [data]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Wallet className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Money Locations</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Total across all locations: <span className="font-semibold">{format(total)}</span></p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTransfer(true)} disabled={locations.length < 2} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm font-medium disabled:opacity-50"><ArrowLeftRight className="w-4 h-4" /> Transfer</button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> Add location</button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-sm">{error}</div>}

      {/* Totals by type */}
      {byType.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {byType.map(([t, v]) => (
            <div key={t} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500">{typeLabel(t)}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{format(v)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Locations */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
            <tr><th className="px-4 py-2 text-left">Location</th><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-right">Opening</th><th className="px-4 py-2 text-right">In</th><th className="px-4 py-2 text-right">Out</th><th className="px-4 py-2 text-right">Balance</th></tr>
          </thead>
          <tbody>
            {locations.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No money locations yet. Add one to start tracking where cash sits.</td></tr>}
            {locations.map((l) => (
              <tr key={l.id} className="border-t border-gray-100 dark:border-gray-700/50">
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{l.name}{l.bank_name && <span className="block text-[11px] text-gray-400">{l.bank_name} {l.account_number || ''}</span>}</td>
                <td className="px-4 py-2 text-gray-500">{typeLabel(l.location_type)}</td>
                <td className="px-4 py-2 text-right">{format(l.opening_balance)}</td>
                <td className="px-4 py-2 text-right text-green-600">{format(l.payments_in + l.transfers_in)}</td>
                <td className="px-4 py-2 text-right text-red-600">{format(l.transfers_out + l.expenses_out)}</td>
                <td className="px-4 py-2 text-right font-bold text-gray-900 dark:text-white">{format(l.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Add money location</h2>
            <input placeholder="Name (e.g. Stanbic Main Account)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <select value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            {(form.location_type === 'bank') && (
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Bank name" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                <input placeholder="Account number" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              </div>
            )}
            <input type="number" placeholder="Opening balance" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
              <button onClick={create} disabled={busy || !form.name} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowTransfer(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Transfer between locations</h2>
            <div className="grid grid-cols-2 gap-2">
              <select value={xfer.from_wallet_id} onChange={(e) => setXfer({ ...xfer, from_wallet_id: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                <option value="">From…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({format(l.balance)})</option>)}
              </select>
              <select value={xfer.to_wallet_id} onChange={(e) => setXfer({ ...xfer, to_wallet_id: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                <option value="">To…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <select value={xfer.transfer_type} onChange={(e) => setXfer({ ...xfer, transfer_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
              <option value="cash_to_bank">Cash → Bank</option>
              <option value="mm_to_bank">Mobile money → Bank</option>
              <option value="bursar_to_head">Bursar → Headteacher</option>
              <option value="other">Other</option>
            </select>
            <input type="number" placeholder="Amount" value={xfer.amount} onChange={(e) => setXfer({ ...xfer, amount: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <input placeholder="Reference (optional)" value={xfer.reference} onChange={(e) => setXfer({ ...xfer, reference: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowTransfer(false)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
              <button onClick={transfer} disabled={busy || !xfer.from_wallet_id || !xfer.to_wallet_id || !xfer.amount} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Transfer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
