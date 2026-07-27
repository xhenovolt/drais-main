'use client';

/**
 * Student Trash — soft-deleted learners are recoverable here (SP-2 / founder-
 * independence). Every soft-delete lands in this view; from here an admin can
 * Restore (undo the delete) or Delete Forever (permanent FK-cascade hard-delete
 * via /api/students/delete-permanent, which only accepts already-soft-deleted
 * rows). No record is ever a black hole.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trash2, RotateCcw, Loader2, AlertTriangle, Search, ArrowLeft, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { showToast, confirmAction } from '@/lib/toast';

interface TrashRow {
  id: number;
  admission_no: string | null;
  status: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  first_name: string;
  last_name: string;
  display_name?: string;
}

const fmt = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleString();
};

export default function StudentTrashPage() {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<null | { verb: string; done: number; total: number }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>('/api/students/list?view=trash', { silent: true });
      setRows(res?.data || []);
      setSelected(new Set());
    } catch {
      /* handled by apiFetch */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r =>
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(term) ||
      (r.admission_no || '').toLowerCase().includes(term));
  }, [rows, q]);

  const allChecked = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(filtered.map(r => r.id)));
  const toggle = (id: number) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const restore = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const res = await apiFetch<any>('/api/students/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }), silent: true,
      });
      showToast('success', `Restored ${res?.restored ?? ids.length} learner${ids.length === 1 ? '' : 's'}`);
      load();
    } catch { /* handled */ }
  }, [load]);

  // Hard delete loops the single-id permanent endpoint (proven FK cascade),
  // chunked with progress so a big Trash purge never trips the function timeout.
  const hardDelete = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    const confirmed = await confirmAction(
      '⚠️ Delete Forever',
      `Permanently delete ${ids.length} learner${ids.length === 1 ? '' : 's'} and ALL their records (fees, enrollment, results, attendance). This CANNOT be undone.`,
      'Delete Forever',
    );
    if (!confirmed) return;
    setBusy({ verb: 'Deleting', done: 0, total: ids.length });
    let ok = 0, fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await apiFetch('/api/students/delete-permanent', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ids[i] }), silent: true,
        });
        ok++;
      } catch { fail++; }
      setBusy({ verb: 'Deleting', done: i + 1, total: ids.length });
    }
    setBusy(null);
    showToast(fail > 0 ? 'warning' : 'success',
      `Deleted ${ok} forever${fail > 0 ? `, ${fail} failed` : ''}`);
    load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/students/list" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Trash2 className="w-5 h-5 text-rose-500" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Student Trash</h1>
        <span className="text-sm text-gray-500">{rows.length} soft-deleted</span>
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Soft-deleted learners live here and stay fully recoverable. Restore brings a learner back
        exactly as they were; Delete Forever removes them and every linked record permanently.
      </p>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / admission no…"
            className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100 w-64 max-w-full" />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{selected.size} selected</span>
            <button onClick={() => restore([...selected])} disabled={!!busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50">
              <RotateCcw className="w-3.5 h-3.5" /> Restore
            </button>
            <button onClick={() => hardDelete([...selected])} disabled={!!busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {busy ? `${busy.verb} ${busy.done}/${busy.total}…` : 'Delete Forever'}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 w-8"><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
              <th className="px-3 py-2 text-left">Learner</th>
              <th className="px-3 py-2 text-left">Admission No</th>
              <th className="px-3 py-2 text-left">Deleted</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {loading && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-12 text-center text-gray-400">
                <Trash2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                {q ? 'No matching soft-deleted learners.' : 'Trash is empty — nothing has been deleted.'}
              </td></tr>
            )}
            {!loading && filtered.map(r => (
              <tr key={r.id} className={selected.has(r.id) ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}>
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                  {r.display_name || `${r.first_name} ${r.last_name}`}
                </td>
                <td className="px-3 py-2 font-mono text-gray-500">{r.admission_no || '—'}</td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmt(r.deleted_at)}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[220px] truncate">{r.delete_reason || '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => restore([r.id])} disabled={!!busy}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs hover:bg-emerald-200 disabled:opacity-50">
                      <RotateCcw className="w-3 h-3" /> Restore
                    </button>
                    <button onClick={() => hardDelete([r.id])} disabled={!!busy}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs hover:bg-rose-200 disabled:opacity-50">
                      <Trash2 className="w-3 h-3" /> Forever
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Delete Forever is permanent and cascades to fees, enrollment, results, and attendance.
        </p>
      )}
    </div>
  );
}
