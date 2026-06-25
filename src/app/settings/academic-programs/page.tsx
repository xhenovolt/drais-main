'use client';

/**
 * Academic Programs — school-configurable enrollment programs with clear names.
 * Create from curated standards (UNEB/Cambridge/Tahfiz…) or custom; rename the
 * display label, set a default, choose curriculum body, archive/restore.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Plus, Loader2, Star, Archive, RotateCcw, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

const STANDARDS = [
  { display_name: 'Uganda National Examinations Board (UNEB)', code: 'UNEB', curriculum_body: 'UNEB' },
  { display_name: 'Cambridge', code: 'CAMB', curriculum_body: 'Cambridge' },
  { display_name: 'Tahfiz Only', code: 'TAHFIZ', curriculum_body: 'Tahfiz' },
  { display_name: 'UNEB + Tahfiz', code: 'UNEB_TAHFIZ', curriculum_body: 'Mixed' },
  { display_name: 'Custom Program', code: 'CUSTOM', curriculum_body: 'Other' },
];
const BODIES = ['UNEB', 'Cambridge', 'Tahfiz', 'Mixed', 'Other'];

export default function AcademicProgramsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`/api/programs?include_archived=1`, { cache: 'no-store' }); const j = await r.json(); setRows(j.data || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (preset?: any) => {
    const body = preset || { display_name: 'New Program', curriculum_body: 'Other', code: '' };
    setBusy(true);
    try {
      const r = await fetch('/api/programs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { toast.error((await r.json()).error || 'Failed'); return; }
      toast.success('Program added'); load();
    } finally { setBusy(false); }
  }, [load]);

  const patch = useCallback(async (id: number, patch: any) => {
    const r = await fetch('/api/programs', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...patch }) });
    if (!r.ok) { toast.error('Failed'); return; }
    load();
  }, [load]);

  const saveRename = useCallback(async (id: number) => {
    if (!editName.trim()) { setEditId(null); return; }
    await patch(id, { display_name: editName.trim() });
    setEditId(null); toast.success('Renamed');
  }, [editName, patch]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  const visible = rows.filter((r) => showArchived || r.is_active);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><GraduationCap className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Academic Programs</h1><p className="text-sm text-gray-500 dark:text-gray-400">Clear, school-set program names used at enrollment.</p></div>
        </div>
        <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>

      {/* quick add */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Add a standard program</p>
        <div className="flex flex-wrap gap-2">
          {STANDARDS.map((s) => (
            <button key={s.code} onClick={() => create(s)} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm hover:border-indigo-400 disabled:opacity-50">
              <Plus className="w-3.5 h-3.5" />{s.display_name}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500">
            <tr><th className="px-4 py-2 text-left">Display name</th><th className="px-4 py-2 text-left">Curriculum body</th><th className="px-4 py-2 text-left">Default</th><th className="px-4 py-2 text-left">Status</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No programs. Add a standard one above.</td></tr>}
            {visible.map((p) => (
              <tr key={p.id} className={`border-t border-gray-100 dark:border-gray-700/50 ${!p.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">
                  {editId === p.id ? (
                    <span className="flex items-center gap-1">
                      <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveRename(p.id)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                      <button onClick={() => saveRename(p.id)} className="p-1 text-green-600"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditId(null)} className="p-1 text-gray-400"><X className="w-4 h-4" /></button>
                    </span>
                  ) : (
                    <button onClick={() => { setEditId(p.id); setEditName(p.display_name); }} className="hover:underline text-left" title="Click to rename">{p.display_name}{p.code ? <span className="ml-1 text-[11px] text-gray-400 font-mono">{p.code}</span> : null}</button>
                  )}
                </td>
                <td className="px-4 py-2">
                  <select value={p.curriculum_body || ''} onChange={(e) => patch(p.id, { curriculum_body: e.target.value })} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs">
                    <option value="">—</option>{BODIES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  {p.is_default ? <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium"><Star className="w-3.5 h-3.5 fill-amber-500" />Default</span>
                    : p.is_active ? <button onClick={() => patch(p.id, { is_default: true })} className="text-xs text-indigo-600 hover:underline">Set default</button> : null}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{p.is_active ? 'Active' : 'Archived'}</td>
                <td className="px-4 py-2 text-right">
                  {p.is_active
                    ? <button onClick={() => patch(p.id, { is_active: false })} className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"><Archive className="w-3.5 h-3.5" />Archive</button>
                    : <button onClick={() => patch(p.id, { is_active: true })} className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline"><RotateCcw className="w-3.5 h-3.5" />Restore</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Click a name to rename it. Archived programs disappear from the enrollment form but keep historical records intact.</p>
    </div>
  );
}
