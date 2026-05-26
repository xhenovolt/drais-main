'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Plus, Trash, Edit, Loader2, X, Warehouse, ExternalLink } from 'lucide-react';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (u: string) => fetch(u).then(r => r.json());
const API_BASE = '/api/inventory';

interface Store {
  id: number;
  name: string;
  location: string | null;
  notes: string | null;
  item_count: number;
}

export default function StoresPage() {
  const { data, mutate, isLoading, error } = useSWR<{ data: Store[] }>(`${API_BASE}/stores`, fetcher);
  const stores = data?.data ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Store | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({ name: '', location: '', notes: '' });

  function openCreate() {
    setEditing(null);
    setForm({ name: '', location: '', notes: '' });
    setModalOpen(true);
  }
  function openEdit(s: Store) {
    setEditing(s);
    setForm({ name: s.name, location: s.location ?? '', notes: s.notes ?? '' });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name) { showToast('error', 'Name required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`${API_BASE}/stores`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...form, location: form.location || null, notes: form.notes || null }),
          successMessage: 'Store updated',
        });
      } else {
        await apiFetch(`${API_BASE}/stores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, location: form.location || null, notes: form.notes || null }),
          successMessage: 'Store created',
        });
      }
      mutate();
      setModalOpen(false);
    } catch {} finally { setSaving(false); }
  }

  async function remove(s: Store) {
    if (s.item_count > 0) {
      showToast('error', `Cannot delete — has ${s.item_count} item${s.item_count === 1 ? '' : 's'}`);
      return;
    }
    const ok = await confirmAction('Delete store?', 'It will be archived. Empty stores only.', 'Yes, archive');
    if (!ok) return;
    try {
      await apiFetch(`${API_BASE}/stores`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id }),
        successMessage: 'Archived',
      });
      mutate();
    } catch {}
  }

  if (error) return <div className="p-6 text-sm text-rose-500">Error loading stores.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Warehouse className="w-6 h-6 text-indigo-500" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Stores</h2>
        </div>
        <button onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Add Store
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
          <Warehouse className="w-10 h-10" />
          <p className="text-sm">No stores yet. Click &quot;Add Store&quot; to create one.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map(s => (
            <div key={s.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-white">{s.name}</p>
                  {s.location && <p className="text-xs text-slate-400 mt-0.5">{s.location}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(s)} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {s.notes && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{s.notes}</p>}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-400">
                  {s.item_count} item{s.item_count === 1 ? '' : 's'}
                </span>
                <Link href={`/inventory/items?store=${s.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                  View items <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Edit Store' : 'Add Store'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <F label="Name *">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </F>
              <F label="Location">
                <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className={inputCls} />
              </F>
              <F label="Notes">
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className={inputCls} />
              </F>
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
