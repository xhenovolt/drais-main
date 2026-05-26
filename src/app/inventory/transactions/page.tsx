'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash, Loader2, X, ArrowDown, ArrowUp, Edit3 } from 'lucide-react';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (u: string) => fetch(u).then(r => r.json());
const API_BASE = '/api/inventory';

interface Tx {
  id: number;
  item_id: number;
  item_name: string;
  unit: string | null;
  tx_type: 'in' | 'out' | 'adjust';
  quantity: number;
  reference: string | null;
  notes: string | null;
  balance_after: number | null;
  created_at: string;
}
interface Item { id: number; name: string; unit: string | null; current_quantity: number; }

export default function TransactionsPage() {
  const { data: txRes, mutate, isLoading } = useSWR<{ data: Tx[] }>(`${API_BASE}/transactions`, fetcher);
  const { data: itemsRes }                 = useSWR<{ data: Item[] }>(`${API_BASE}/items`, fetcher);

  const txs   = txRes?.data    ?? [];
  const items = itemsRes?.data ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({
    item_id: '', tx_type: 'in' as 'in'|'out'|'adjust', quantity: '', reference: '', notes: '',
  });

  function openCreate() {
    setForm({ item_id: '', tx_type: 'in', quantity: '', reference: '', notes: '' });
    setModalOpen(true);
  }

  async function save() {
    if (!form.item_id || !form.quantity || Number(form.quantity) <= 0) {
      showToast('error', 'Item and quantity (>0) required'); return;
    }
    setSaving(true);
    try {
      await apiFetch(`${API_BASE}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id:   Number(form.item_id),
          tx_type:   form.tx_type,
          quantity:  Number(form.quantity),
          reference: form.reference || null,
          notes:     form.notes     || null,
        }),
        successMessage: 'Transaction recorded',
      });
      mutate();
      setModalOpen(false);
    } catch {} finally { setSaving(false); }
  }

  async function reverse(id: number) {
    const ok = await confirmAction('Reverse this transaction?', 'The stock balance will be adjusted back.', 'Yes, reverse');
    if (!ok) return;
    try {
      await apiFetch(`${API_BASE}/transactions/${id}`, { method: 'DELETE', successMessage: 'Reversed' });
      mutate();
    } catch {}
  }

  const txIcon = (t: string) =>
    t === 'in' ? <ArrowDown className="w-3.5 h-3.5 text-emerald-500" />
    : t === 'out' ? <ArrowUp className="w-3.5 h-3.5 text-rose-500" />
    : <Edit3 className="w-3.5 h-3.5 text-indigo-500" />;

  const selectedItem = items.find(i => i.id === Number(form.item_id));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Stock Movements</h2>
        <button onClick={openCreate}
          disabled={items.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> New Movement
        </button>
      </div>

      {items.length === 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
          Create items first before recording movements.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : txs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No movements recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Balance After</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {txs.map(t => (
                <tr key={t.id} className="bg-white dark:bg-slate-900">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase">
                      {txIcon(t.tx_type)} {t.tx_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{t.item_name}</td>
                  <td className="px-4 py-3 font-mono">{Number(t.quantity)} {t.unit ?? ''}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{t.balance_after != null ? Number(t.balance_after) : '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{t.reference || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => reverse(t.id)} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">New Stock Movement</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <F label="Item *">
                <select value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value })} className={inputCls}>
                  <option value="">— Select —</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (current: {Number(i.current_quantity)}{i.unit ? ' ' + i.unit : ''})
                    </option>
                  ))}
                </select>
              </F>
              <F label="Type *">
                <select value={form.tx_type} onChange={e => setForm({ ...form, tx_type: e.target.value as any })} className={inputCls}>
                  <option value="in">Stock In (received / purchase)</option>
                  <option value="out">Stock Out (issued / used)</option>
                  <option value="adjust">Adjust (set absolute total)</option>
                </select>
              </F>
              <F label={form.tx_type === 'adjust' ? 'New Total *' : 'Quantity *'}>
                <input type="number" step="0.001" value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className={inputCls} />
                {selectedItem && form.tx_type === 'out' && Number(form.quantity) > Number(selectedItem.current_quantity) && (
                  <p className="text-[11px] text-rose-500 mt-1">
                    Exceeds current stock ({Number(selectedItem.current_quantity)})
                  </p>
                )}
              </F>
              <F label="Reference">
                <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })}
                  placeholder="PO number, invoice, requisition…" className={inputCls} />
              </F>
              <F label="Notes">
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
              </F>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
