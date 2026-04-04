'use client';
/**
 * /admin/departments — Manage school departments
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Building2, Plus, Pencil, Trash2, RefreshCw, Users, ChevronRight, X } from 'lucide-react';

import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

interface Department {
  id: number;
  name: string;
  description: string | null;
  head_staff_id: number | null;
  head_name: string | null;
  staff_count: number;
}

interface FormState { name: string; description: string; head_id: string; }
const EMPTY_FORM: FormState = { name: '', description: '', head_id: '' };

export default function AdminDepartmentsPage() {
  const [depts,   setDepts]   = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [modal,   setModal]   = useState<{ type: 'create' | 'edit'; dept?: Department } | null>(null);
  const [form,    setForm]    = useState<FormState>(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ data: Department[] }>('/api/admin/departments?include_staff_count=1', { silent: true });
      setDepts(data.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setSaveErr(null);
    setModal({ type: 'create' });
  }

  function openEdit(d: Department) {
    setForm({ name: d.name, description: d.description ?? '', head_id: d.head_staff_id ? String(d.head_staff_id) : '' });
    setSaveErr(null);
    setModal({ type: 'edit', dept: d });
  }

  async function save() {
    setSaving(true);
    setSaveErr(null);
    try {
      const isEdit = modal?.type === 'edit';
      const url    = isEdit ? `/api/admin/departments/${modal?.dept?.id}` : '/api/admin/departments';
      const method = isEdit ? 'PATCH' : 'POST';
      const body   = { name: form.name.trim(), description: form.description.trim() || null, head_staff_id: form.head_id ? Number(form.head_id) : null };
      await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        successMessage: isEdit ? 'Department updated' : 'Department created',
      });
      setModal(null);
      load();
    } catch (e: any) { setSaveErr(e.message); }
    finally { setSaving(false); }
  }

  async function del(d: Department) {
    if (!await confirmAction(`Delete "${d.name}"?`, 'This cannot be undone.', 'Delete')) return;
    try {
      await apiFetch(`/api/admin/departments/${d.id}`, {
        method: 'DELETE',
        successMessage: 'Department deleted',
      });
      load();
    } catch (e: any) {
      showToast('error', e.message ?? 'Delete failed');
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Departments</h1>
            <p className="text-sm text-slate-500">{depts.length} departments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors">
            <Plus className="w-4 h-4" /> Add Department
          </button>
        </div>
      </div>

      {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 text-sm">{error}</div>}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
              <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              <div className="h-4 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : depts.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No departments yet. Add one to get started.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {depts.map(d => (
            <div key={d.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 hover:shadow-md dark:hover:shadow-slate-900/30 transition-shadow group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                  <h3 className="font-semibold text-slate-800 dark:text-white">{d.name}</h3>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(d)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del(d)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {d.description && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{d.description}</p>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" /> {d.staff_count} staff
                </span>
                {d.head_name ? (
                  <span className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" /> {d.head_name}
                  </span>
                ) : <span className="text-slate-300 dark:text-slate-600">No head</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800 dark:text-white">
                {modal.type === 'create' ? 'Add Department' : 'Edit Department'}
              </h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"><X className="w-4 h-4" /></button>
            </div>

            {saveErr && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 text-sm">{saveErr}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : modal.type === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
