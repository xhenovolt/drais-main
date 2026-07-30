'use client';

/**
 * Fee Items — reusable school-level fee definitions (category, default amount,
 * frequency, mandatory/optional, active). Rules (see /finance/fee-rules) decide
 * which learners each item applies to.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Tag, Plus, Loader2, Edit, Trash2, X, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useCurrency } from '@/hooks/useCurrency';

const CATEGORIES = ['tuition', 'uniform', 'transport', 'feeding', 'boarding', 'examination', 'activity', 'tour', 'medical', 'library', 'development', 'pta', 'other'];
const FREQUENCIES = ['once', 'termly', 'annually', 'monthly', 'custom'];
const blank = { name: '', code: '', category: 'tuition', default_amount: 0, frequency: 'termly', mandatory: true, optional: false, is_active: true, notes: '' };

export default function FeeItemsPage() {
  const { format } = useCurrency();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/finance/fee-rules/items', { cache: 'no-store' }); const j = await r.json(); setItems(j.items || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    setError(null);
    if (!modal.name?.trim()) { setError('Name is required'); return; }
    setBusy(true);
    try {
      const editing = !!modal.id;
      const r = await fetch(`/api/finance/fee-rules/items${editing ? `/${modal.id}` : ''}`, {
        method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(modal),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Failed'); return; }
      toast.success(editing ? 'Fee item updated' : 'Fee item created');
      setModal(null); load();
    } finally { setBusy(false); }
  }, [modal, load]);

  const del = useCallback(async (it: any) => {
    if (!confirm(`Delete fee item "${it.name}" and its rules?`)) return;
    const r = await fetch(`/api/finance/fee-rules/items/${it.id}`, { method: 'DELETE' });
    if (!r.ok) { toast.error('Delete failed'); return; }
    toast.success('Deleted'); load();
  }, [load]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Tag className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Fee Items</h1><p className="text-sm text-gray-500 dark:text-gray-400">Define fees once; rules decide who pays.</p></div>
        </div>
        <button onClick={() => setModal({ ...blank })} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> New fee item</button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
            <tr><th className="px-4 py-2 text-left">Name</th><th className="px-4 py-2 text-left">Category</th><th className="px-4 py-2 text-right">Default</th><th className="px-4 py-2 text-left">Frequency</th><th className="px-4 py-2 text-left">Flags</th><th className="px-4 py-2 text-left">Scope</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No fee items yet.</td></tr>}
            {items.map((it) => (
              <tr key={it.id} className={`border-t border-gray-100 dark:border-gray-700/50 ${!it.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{it.name}{it.code && <span className="ml-1 text-[11px] text-gray-400 font-mono">{it.code}</span>}</td>
                <td className="px-4 py-2 capitalize text-gray-500">{it.category}</td>
                <td className="px-4 py-2 text-right">{format(it.default_amount)}</td>
                <td className="px-4 py-2 capitalize text-gray-500">{it.frequency}</td>
                <td className="px-4 py-2 text-[11px] text-gray-500">{it.mandatory ? 'mandatory' : 'optional'}{!it.is_active ? ' · inactive' : ''}</td>
                <td className="px-4 py-2">
                  {/* Class/gender/boarding/term scope lives on Fee Rules, not
                      here — but WHETHER it has any at all was previously
                      invisible without opening that page per item. Zero
                      rules means this fee is charged to nobody, not
                      everyone (see evaluateBill/listRules). */}
                  {Number(it.rule_count) > 0 ? (
                    <a href={`/finance/fee-rules?item=${it.id}`} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100">
                      <SlidersHorizontal className="w-3 h-3" /> {it.rule_count} rule{Number(it.rule_count) === 1 ? '' : 's'}
                    </a>
                  ) : (
                    <a href={`/finance/fee-rules?item=${it.id}`} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100" title="No rules — this fee is not charged to anyone yet">
                      <AlertTriangle className="w-3 h-3" /> No rules
                    </a>
                  )}
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => setModal({ ...it, mandatory: !!it.mandatory, optional: !!it.optional, is_active: !!it.is_active })} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => del(it)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-gray-900 dark:text-white">{modal.id ? 'Edit fee item' : 'New fee item'}</h2><button onClick={() => setModal(null)}><X className="w-5 h-5 text-gray-400" /></button></div>
            <input placeholder="Name (e.g. Tuition)" value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm capitalize">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <select value={modal.frequency} onChange={(e) => setModal({ ...modal, frequency: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm capitalize">{FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}</select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Default amount" value={modal.default_amount || ''} onChange={(e) => setModal({ ...modal, default_amount: Number(e.target.value) })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              <input placeholder="Code (optional)" value={modal.code || ''} onChange={(e) => setModal({ ...modal, code: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" checked={modal.mandatory} onChange={(e) => setModal({ ...modal, mandatory: e.target.checked, optional: e.target.checked ? false : modal.optional })} /> Mandatory</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={modal.optional} onChange={(e) => setModal({ ...modal, optional: e.target.checked, mandatory: e.target.checked ? false : modal.mandatory })} /> Optional</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={modal.is_active} onChange={(e) => setModal({ ...modal, is_active: e.target.checked })} /> Active</label>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1"><button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-500">Cancel</button><button onClick={save} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
