'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash, Edit, Loader2, X, AlertTriangle } from 'lucide-react';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (u: string) => fetch(u).then(r => r.json());
const API_BASE = '/api/inventory';

interface Item {
  id: number;
  store_id: number;
  store_name: string;
  name: string;
  unit: string | null;
  capacity: number | null;
  reorder_level: number | null;
  current_quantity: number;
  is_low: number;
}
interface Store { id: number; name: string; }

export default function ItemsPage() {
  const { data: itemsRes,  mutate, isLoading } = useSWR<{ data: Item[] }>(`${API_BASE}/items`, fetcher);
  const { data: storesRes }                    = useSWR<{ data: Store[] }>(`${API_BASE}/stores`, fetcher);

  const items  = itemsRes?.data  ?? [];
  const stores = storesRes?.data ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    store_id: '', name: '', unit: '', capacity: '', reorder_level: '', initial_quantity: '0',
  });

  function openCreate() {
    setEditing(null);
    setForm({ store_id: '', name: '', unit: '', capacity: '', reorder_level: '', initial_quantity: '0' });
    setModalOpen(true);
  }
  function openEdit(i: Item) {
    setEditing(i);
    setForm({
      store_id: String(i.store_id), name: i.name,
      unit: i.unit ?? '', capacity: i.capacity != null ? String(i.capacity) : '',
      reorder_level: i.reorder_level != null ? String(i.reorder_level) : '',
      initial_quantity: '',
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.store_id || !form.name) { showToast('error', 'Store and name required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`${API_BASE}/items/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_id:      Number(form.store_id),
            name:          form.name,
            unit:          form.unit || null,
            capacity:      form.capacity ? Number(form.capacity) : null,
            reorder_level: form.reorder_level ? Number(form.reorder_level) : null,
          }),
          successMessage: 'Item updated',
        });
      } else {
        await apiFetch(`${API_BASE}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_id:         Number(form.store_id),
            name:             form.name,
            unit:             form.unit || null,
            capacity:         form.capacity ? Number(form.capacity) : null,
            reorder_level:    form.reorder_level ? Number(form.reorder_level) : null,
            initial_quantity: form.initial_quantity ? Number(form.initial_quantity) : 0,
          }),
          successMessage: 'Item created',
        });
      }
      mutate();
      setModalOpen(false);
    } catch { /* apiFetch already shows toast */ }
    finally { setSaving(false); }
  }

  async function remove(id: number) {
    const ok = await confirmAction('Delete item?', 'It will be archived. Stock history is preserved.', 'Yes, archive');
    if (!ok) return;
    try {
      await apiFetch(`${API_BASE}/items/${id}`, { method: 'DELETE', successMessage: 'Item archived' });
      mutate();
    } catch {}
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Store Items</h2>
        <button onClick={openCreate}
          disabled={stores.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>

      {stores.length === 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
          Create a store first before adding items.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">No items yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Reorder Level</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map(i => (
                <tr key={i.id} className="bg-white dark:bg-slate-900">
                  <td className="px-4 py-3 font-semibold flex items-center gap-2">
                    {i.is_low === 1 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                    {i.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{i.store_name}</td>
                  <td className={`px-4 py-3 font-mono ${i.is_low === 1 ? 'text-amber-600 dark:text-amber-300' : ''}`}>
                    {Number(i.current_quantity)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{i.unit ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{i.capacity ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{i.reorder_level ?? '—'}</td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button onClick={() => openEdit(i)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(i.id)} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
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
              <h3 className="text-lg font-semibold">{editing ? 'Edit Item' : 'Add Item'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <F label="Store *">
                <select value={form.store_id} onChange={e => setForm({ ...form, store_id: e.target.value })} className={inputCls}>
                  <option value="">— Select —</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </F>
              <F label="Name *">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </F>
              <F label="Unit">
                <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="kg, pcs, L…" className={inputCls} />
              </F>
              <F label="Capacity">
                <input type="number" step="0.001" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} className={inputCls} />
              </F>
              <F label="Reorder Level">
                <input type="number" step="0.001" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} className={inputCls} />
              </F>
              {!editing && (
                <F label="Opening Quantity">
                  <input type="number" step="0.001" value={form.initial_quantity}
                    onChange={e => setForm({ ...form, initial_quantity: e.target.value })}
                    className={inputCls} />
                </F>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editing ? 'Update' : 'Create'}
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
