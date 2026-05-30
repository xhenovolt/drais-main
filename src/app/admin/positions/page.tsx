'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { Briefcase, Plus, Edit, Loader2, X, Lock, BookOpen, Building2, Coins, Heart, Star } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Position {
  id:            number;
  schoolId:      number | null;
  code:          string;
  name:          string;
  category:      'academic' | 'admin' | 'finance' | 'support' | 'spiritual';
  isTeaching:    boolean;
  isActive:      boolean;
  displayOrder:  number;
}

const CATEGORIES = [
  { value: 'academic',  label: 'Academic',  icon: BookOpen },
  { value: 'admin',     label: 'Admin',     icon: Building2 },
  { value: 'finance',   label: 'Finance',   icon: Coins },
  { value: 'support',   label: 'Support',   icon: Heart },
  { value: 'spiritual', label: 'Spiritual', icon: Star },
];

export default function PositionsAdminPage() {
  const { t } = useI18n();
  const { data, mutate, isLoading } = useSWR<{ positions: Position[] }>(
    '/api/admin/positions?active_only=0', fetcher
  );
  const positions = data?.positions ?? [];

  const [filter, setFilter] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '', name: '', category: 'admin' as Position['category'],
    is_teaching: false, display_order: '100',
  });

  const filtered = positions.filter(p => filter === 'all' || p.category === filter);
  const counts = CATEGORIES.reduce((acc, c) => {
    acc[c.value] = positions.filter(p => p.category === c.value).length;
    return acc;
  }, {} as Record<string, number>);

  function openCreate() {
    setEditing(null);
    setForm({ code: '', name: '', category: 'admin', is_teaching: false, display_order: '100' });
    setModalOpen(true);
  }
  function openEdit(p: Position) {
    if (p.schoolId === null) {
      toast.error('Global catalog positions are read-only.'); return;
    }
    setEditing(p);
    setForm({
      code: p.code, name: p.name, category: p.category,
      is_teaching: p.isTeaching, display_order: String(p.displayOrder),
    });
    setModalOpen(true);
  }

  async function save() {
    if (!form.name || !form.code) { toast.error('Code and name required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        code: form.code, name: form.name, category: form.category,
        is_teaching: form.is_teaching, display_order: Number(form.display_order),
      };
      if (editing) payload.id = editing.id;
      const res = await fetch('/api/admin/positions', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Save failed');
      toast.success(editing ? 'Position updated' : 'Position created');
      setModalOpen(false);
      mutate();
    } catch (e: any) { toast.error(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function toggleActive(p: Position) {
    if (p.schoolId === null) {
      toast.error('Global catalog positions cannot be deactivated here.'); return;
    }
    try {
      const res = await fetch('/api/admin/positions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, is_active: !p.isActive }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Failed');
      mutate();
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">{t('nav.staff.positions')}</h1>
            <p className="text-xs text-slate-400">Catalog of staff job titles. Global rows are read-only.</p>
          </div>
        </div>
        <button onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Position
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
            filter === 'all'
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
          }`}>
          All ({positions.length})
        </button>
        {CATEGORIES.map(c => {
          const Icon = c.icon;
          return (
            <button key={c.value} onClick={() => setFilter(c.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ${
                filter === c.value
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
              <Icon className="w-3 h-3" /> {c.label} ({counts[c.value] ?? 0})
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Teaching</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(p => (
                <tr key={p.id} className="bg-white dark:bg-slate-900">
                  <td className="px-4 py-3 font-semibold">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{p.category}</td>
                  <td className="px-4 py-3">
                    {p.isTeaching ? <span className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold">Yes</span> : <span className="text-slate-400 text-xs">No</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.schoolId === null ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                        <Lock className="w-3 h-3" /> Global
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">School</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={p.isActive}
                        onChange={() => toggleActive(p)}
                        disabled={p.schoolId === null}
                        className="sr-only peer" />
                      <div className={`relative w-9 h-5 rounded-full transition ${
                        p.isActive
                          ? 'bg-emerald-500'
                          : 'bg-slate-300 dark:bg-slate-600'
                      } ${p.schoolId === null ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition ${
                          p.isActive ? 'left-4' : 'left-0.5'
                        }`} />
                      </div>
                    </label>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(p)}
                      disabled={p.schoolId === null}
                      className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">
                      <Edit className="w-3.5 h-3.5" />
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
              <h3 className="text-lg font-semibold">{editing ? 'Edit Position' : 'New Position'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <F label="Name *">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
              </F>
              <F label="Code * (lowercase, no spaces)">
                <input value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  className={`${inputCls} font-mono`} />
              </F>
              <F label="Category *">
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })} className={inputCls}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </F>
              <F label="Display Order">
                <input type="number" value={form.display_order}
                  onChange={e => setForm({ ...form, display_order: e.target.value })} className={inputCls} />
              </F>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_teaching}
                  onChange={e => setForm({ ...form, is_teaching: e.target.checked })} />
                <span className="text-sm">This is a teaching position</span>
              </label>
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
