'use client';

/**
 * Offline Students — the first working screen for DRAIS's local-SQLite
 * mode (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md Phase 7
 * sub-effort 11).
 *
 * Deliberately NOT a port of /students/list — that page is ~3,200 lines,
 * driven by an enrollments/fees/classes join with no offline equivalent
 * yet. This is a genuinely smaller, separate screen: view/add/edit a
 * student's core identity (name, DOB, gender, contact, admission no,
 * status, notes) plus class placement (sub-effort 19: a real write path,
 * not just a view) — talking to /api/students/offline/*, which only
 * ever serves local-sqlite mode and refuses cleanly otherwise.
 *
 * Only reachable today by direct navigation — the mode-switch UI still
 * doesn't expose local-sqlite as selectable (sub-effort 5, deliberate),
 * so there's no nav link to this page yet either. That's intentional:
 * this proves the pattern works end-to-end before investing in
 * discoverability for a mode nobody can switch into yet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, RotateCcw, Search, RefreshCw, WifiOff } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

interface OfflineStudent {
  id: number;
  admissionNo: string | null;
  admissionDate: string | null;
  status: string;
  notes: string | null;
  firstName: string;
  lastName: string;
  otherName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  deletedAt: string | null;
  currentClass: { id: number; name: string } | null;
}

interface ClassOption { id: number; name: string }

type FormState = Partial<OfflineStudent> & { firstName: string; lastName: string };

const EMPTY_FORM: FormState = { firstName: '', lastName: '' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error?.message || `Request failed (${res.status})`);
  }
  return body;
}

export default function OfflineStudentsPage() {
  const { t, digits } = useI18n();
  const [students, setStudents] = useState<OfflineStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (showDeleted) params.set('includeDeleted', '1');
      const res = await api<{ students: OfflineStudent[] }>(`/api/students/offline?${params.toString()}`);
      setStudents(res.students);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('students.offline.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [search, showDeleted]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api<{ classes: ClassOption[] }>('/api/academics/offline').then((res) => setClassOptions(res.classes)).catch(() => {});
  }, []);

  const assignClass = async (studentId: number, classId: number) => {
    setAssigningId(studentId);
    setError(null);
    try {
      await api(`/api/students/offline/${studentId}/class`, { method: 'PUT', body: JSON.stringify({ classId }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('students.offline.assignFailed'));
    } finally {
      setAssigningId(null);
    }
  };

  const unassignClass = async (studentId: number) => {
    setAssigningId(studentId);
    setError(null);
    try {
      await api(`/api/students/offline/${studentId}/class`, { method: 'DELETE', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('students.offline.unassignFailed'));
    } finally {
      setAssigningId(null);
    }
  };

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (s: OfflineStudent) => {
    setEditingId(s.id);
    setForm({
      firstName: s.firstName, lastName: s.lastName, otherName: s.otherName, gender: s.gender,
      dateOfBirth: s.dateOfBirth, phone: s.phone, email: s.email, address: s.address,
      admissionNo: s.admissionNo, admissionDate: s.admissionDate, status: s.status, notes: s.notes,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError(t('students.offline.namesRequired')); return; }
    setSaving(true);
    setError(null);
    try {
      if (editingId != null) {
        await api(`/api/students/offline/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await api('/api/students/offline', { method: 'POST', body: JSON.stringify(form) });
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('students.offline.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm(t('students.offline.confirmTrash'))) return;
    try {
      await api(`/api/students/offline/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('students.offline.deleteFailed'));
    }
  };

  const restore = async (id: number) => {
    try {
      await api(`/api/students/offline/${id}/restore`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('students.offline.restoreFailed'));
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <WifiOff className="w-5 h-5 text-amber-500" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('students.offline.title')}</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
          {t('students.offline.localSqlite')}
        </span>
        <button onClick={load} className="ms-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500" title={t('students.offline.refresh')}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('students.offline.addStudent')}
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t('students.offline.intro')}
        
        
      </p>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('students.offline.searchPlaceholder')}
            className="ps-8 pe-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 w-64 max-w-full" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          {t('students.offline.showDeleted')}
        </label>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-start">{t('students.offline.col.name')}</th>
              <th className="px-3 py-2 text-start">{t('students.offline.col.admissionNo')}</th>
              <th className="px-3 py-2 text-start">{t('students.offline.col.class')}</th>
              <th className="px-3 py-2 text-start">{t('students.offline.col.status')}</th>
              <th className="px-3 py-2 text-start">{t('students.offline.col.phone')}</th>
              <th className="px-3 py-2 text-end">{t('students.offline.col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {loading && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            )}
            {!loading && students.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-gray-400">{t('students.offline.none')}</td></tr>
            )}
            {!loading && students.map((s) => (
              <tr key={s.id} className={s.deletedAt ? 'opacity-50' : ''}>
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                  {s.firstName} {s.lastName}{s.otherName ? ` ${s.otherName}` : ''}
                </td>
                <td className="px-3 py-2 font-mono text-gray-500">{s.admissionNo || '—'}</td>
                <td className="px-3 py-2">
                  {assigningId === s.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                  ) : (
                    <div className="flex items-center gap-1">
                      <select
                        value={s.currentClass?.id ?? ''} disabled={!!s.deletedAt}
                        onChange={(e) => { if (e.target.value) assignClass(s.id, Number(e.target.value)); }}
                        className="text-xs px-1.5 py-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                      >
                        <option value="">{t('students.offline.unassigned')}</option>
                        {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {s.currentClass && !s.deletedAt && (
                        <button onClick={() => unassignClass(s.id)} title={t('students.offline.unassignTitle')}
                          className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500">{t(`students.offline.status.${s.status}`, String(s.status ?? ''))}</td>
                <td className="px-3 py-2 text-gray-500">{s.phone ? digits(s.phone) : '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    {s.deletedAt ? (
                      <button onClick={() => restore(s.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs hover:bg-emerald-200">
                        <RotateCcw className="w-3 h-3" /> {t('students.offline.restore')}
                      </button>
                    ) : (
                      <>
                        <button onClick={() => openEdit(s)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-xs hover:bg-gray-200">
                          <Pencil className="w-3 h-3" /> {t('students.offline.edit')}
                        </button>
                        <button onClick={() => remove(s.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs hover:bg-rose-200">
                          <Trash2 className="w-3 h-3" /> {t('students.offline.delete')}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setFormOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{editingId != null ? t('students.offline.editStudent') : t('students.offline.addStudent')}</h2>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder={t('students.offline.f.firstName')} value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="col-span-1 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder={t('students.offline.f.lastName')} value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="col-span-1 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder={t('students.offline.f.otherName')} value={form.otherName ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, otherName: e.target.value || null }))}
                className="col-span-2 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder={t('students.offline.f.gender')} value={form.gender ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input type="date" placeholder={t('students.offline.f.dob')} value={form.dateOfBirth ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder={t('students.offline.f.phone')} value={form.phone ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder={t('students.offline.f.email')} value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder={t('students.offline.f.admissionNo')} value={form.admissionNo ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, admissionNo: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder={t('students.offline.f.status')} value={form.status ?? 'active'}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder={t('students.offline.f.address')} value={form.address ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value || null }))}
                className="col-span-2 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <textarea placeholder={t('students.offline.f.notes')} value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
                className="col-span-2 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" rows={2} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setFormOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800">
                {t('students.offline.cancel')}
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t('students.offline.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
