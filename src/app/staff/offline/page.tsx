'use client';

/**
 * Offline Staff — the second "complete" offline module
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md Phase 7 sub-effort 14).
 *
 * Same discipline as /students/offline: a genuinely smaller thing than the
 * real staff feature, not a port of it. Department/role/position/manager
 * are real columns on `staff` but have no lookup repo in this layer yet, so
 * this screen deliberately omits them rather than show a bare id. Salary
 * and bank details are excluded at the repo layer itself until repo-sqlite
 * has at-rest encryption.
 *
 * Only reachable today by direct navigation — same reason as
 * /students/offline: the mode-switch UI doesn't expose local-sqlite yet.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, RotateCcw, Search, RefreshCw, WifiOff } from 'lucide-react';

interface OfflineStaff {
  id: number;
  staffNo: string | null;
  position: string | null;
  employmentType: string | null;
  qualification: string | null;
  experienceYears: number | null;
  hireDate: string | null;
  status: string | null;
  firstName: string;
  lastName: string;
  otherName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  deletedAt: string | null;
}

type FormState = Partial<OfflineStaff> & { firstName: string; lastName: string };

const EMPTY_FORM: FormState = { firstName: '', lastName: '' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error?.message || `Request failed (${res.status})`);
  }
  return body;
}

export default function OfflineStaffPage() {
  const [staff, setStaff] = useState<OfflineStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (showDeleted) params.set('includeDeleted', '1');
      const res = await api<{ staff: OfflineStaff[] }>(`/api/staff/offline?${params.toString()}`);
      setStaff(res.staff);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [search, showDeleted]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (s: OfflineStaff) => {
    setEditingId(s.id);
    setForm({
      firstName: s.firstName, lastName: s.lastName, otherName: s.otherName, gender: s.gender,
      dateOfBirth: s.dateOfBirth, phone: s.phone, email: s.email, address: s.address,
      staffNo: s.staffNo, position: s.position, employmentType: s.employmentType,
      qualification: s.qualification, experienceYears: s.experienceYears, hireDate: s.hireDate, status: s.status,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('First and last name are required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (editingId != null) {
        await api(`/api/staff/offline/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await api('/api/staff/offline', { method: 'POST', body: JSON.stringify(form) });
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Move this staff member to trash?')) return;
    try {
      await api(`/api/staff/offline/${id}`, { method: 'DELETE', body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const restore = async (id: number) => {
    try {
      await api(`/api/staff/offline/${id}/restore`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <WifiOff className="w-5 h-5 text-amber-500" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Staff (Offline)</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
          Local SQLite
        </span>
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Core staff records only — name, contact, staff number, position, employment basics. Department,
        role, salary and bank details are not part of this offline screen yet.
      </p>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / staff no / position…"
            className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 w-72 max-w-full" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Show deleted
        </label>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Staff No</th>
              <th className="px-3 py-2 text-left">Position</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Phone</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {loading && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            )}
            {!loading && staff.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-gray-400">No staff yet. Add the first one.</td></tr>
            )}
            {!loading && staff.map((s) => (
              <tr key={s.id} className={s.deletedAt ? 'opacity-50' : ''}>
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                  {s.firstName} {s.lastName}{s.otherName ? ` ${s.otherName}` : ''}
                </td>
                <td className="px-3 py-2 font-mono text-gray-500">{s.staffNo || '—'}</td>
                <td className="px-3 py-2 text-gray-500">{s.position || '—'}</td>
                <td className="px-3 py-2 text-gray-500">{s.status || '—'}</td>
                <td className="px-3 py-2 text-gray-500">{s.phone || '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    {s.deletedAt ? (
                      <button onClick={() => restore(s.id)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs hover:bg-emerald-200">
                        <RotateCcw className="w-3 h-3" /> Restore
                      </button>
                    ) : (
                      <>
                        <button onClick={() => openEdit(s)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-xs hover:bg-gray-200">
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button onClick={() => remove(s.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs hover:bg-rose-200">
                          <Trash2 className="w-3 h-3" /> Delete
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
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{editingId != null ? 'Edit Staff' : 'Add Staff'}</h2>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="First name *" value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                className="col-span-1 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Last name *" value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                className="col-span-1 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Other name" value={form.otherName ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, otherName: e.target.value || null }))}
                className="col-span-2 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Gender" value={form.gender ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input type="date" placeholder="Date of birth" value={form.dateOfBirth ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Phone" value={form.phone ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Email" value={form.email ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Staff No" value={form.staffNo ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, staffNo: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Position" value={form.position ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <select value={form.employmentType ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, employmentType: (e.target.value || null) as any }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm">
                <option value="">Employment type…</option>
                <option value="permanent">Permanent</option>
                <option value="contract">Contract</option>
                <option value="volunteer">Volunteer</option>
                <option value="part-time">Part-time</option>
              </select>
              <input placeholder="Qualification" value={form.qualification ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input type="number" min="0" placeholder="Experience (years)" value={form.experienceYears ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, experienceYears: e.target.value ? Number(e.target.value) : null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input type="date" placeholder="Hire date" value={form.hireDate ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value || null }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Status" value={form.status ?? 'active'}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
              <input placeholder="Address" value={form.address ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value || null }))}
                className="col-span-2 px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 bg-transparent text-sm" />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setFormOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
