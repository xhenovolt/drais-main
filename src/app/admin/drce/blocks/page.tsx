"use client";
/**
 * /admin/drce/blocks — Block library admin.
 *
 * CRUD UI for the shared blocks introduced in Phase H. Globals (NULL school)
 * are shown read-only; school-owned blocks can be edited and deleted.
 *
 * Block payload is the raw DRCESection JSON — typically a container subtree
 * authored elsewhere and pasted here. Future iteration: an embedded block
 * editor. For now, JSON is the contract.
 */
import React, { useEffect, useState } from 'react';
import { Library, Plus, Trash2, Loader2, Save, X, Globe, Lock } from 'lucide-react';

type Kind = 'header' | 'footer' | 'comment_rules' | 'custom';

interface BlockRow {
  id:           number;
  school_id:    number | null;
  name:         string;
  description:  string;
  kind:         Kind;
  section:      Record<string, unknown>;
  created_at:   string;
  updated_at:   string;
}

const KINDS: Kind[] = ['header', 'footer', 'comment_rules', 'custom'];

const TEMPLATE_SECTION = (name: string): Record<string, unknown> => ({
  id: `tpl-${Date.now()}`,
  type: 'container',
  visible: true,
  children: [],
  style: { layout: 'row', gap: 8, padding: '8px' },
  order: 0,
});

export default function BlockLibraryPage() {
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<BlockRow | null>(null);
  const [creating, setCreating] = useState(false);

  async function reload() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/drce/blocks');
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error ?? 'Failed to load'); return; }
      setBlocks(data.blocks ?? []);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { reload(); }, []);

  async function remove(b: BlockRow) {
    if (b.school_id === null) return;
    if (!window.confirm(`Delete block "${b.name}"? Documents that reference it will render an empty spacer instead.`)) return;
    const res = await fetch(`/api/drce/blocks/${b.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data?.success) { setError(data?.error ?? 'Delete failed'); return; }
    reload();
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600">
            <Library className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white">Block library</h1>
            <p className="text-xs text-slate-400">Reusable section subtrees referenced by documents via <code>block_ref</code>. Editing a block updates everywhere it's used.</p>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm">
          <Plus className="w-3.5 h-3.5" /> New block
        </button>
      </header>

      {error && (
        <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : blocks.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Library className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No blocks yet.</p>
          <p className="text-xs text-slate-400 mt-1">Create one to start building a header / footer / comment library.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {blocks.map(b => (
            <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                {b.school_id === null
                  ? <Globe className="w-4 h-4 text-emerald-500" />
                  : <Lock  className="w-4 h-4 text-indigo-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{b.name}</p>
                  <span className="text-[10px] uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">{b.kind}</span>
                  {b.school_id === null && <span className="text-[10px] uppercase tracking-wide bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded">global</span>}
                </div>
                {b.description && <p className="text-[11px] text-slate-400 truncate">{b.description}</p>}
                <p className="text-[10px] text-slate-400 mt-0.5">#{b.id} · updated {b.updated_at ? new Date(b.updated_at).toLocaleString() : '—'}</p>
              </div>
              <button
                onClick={() => setEditing(b)}
                disabled={b.school_id === null}
                title={b.school_id === null ? 'Global blocks are read-only here' : 'Edit'}
                className="px-2 py-1 text-xs rounded-md text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-40 disabled:hover:bg-transparent">
                Edit
              </button>
              <button
                onClick={() => remove(b)}
                disabled={b.school_id === null}
                title={b.school_id === null ? 'Global blocks cannot be deleted' : 'Delete'}
                className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:opacity-40 disabled:hover:bg-transparent">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <BlockEditor
          block={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); reload(); }}
        />
      )}
    </div>
  );
}

function BlockEditor({ block, onClose, onSaved }: {
  block:   BlockRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!block;
  const [name, setName]               = useState(block?.name ?? '');
  const [description, setDescription] = useState(block?.description ?? '');
  const [kind, setKind]               = useState<Kind>(block?.kind ?? 'header');
  const [sectionJson, setSectionJson] = useState(
    block ? JSON.stringify(block.section, null, 2) : JSON.stringify(TEMPLATE_SECTION('New block'), null, 2),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function save() {
    setError('');
    let section;
    try { section = JSON.parse(sectionJson); }
    catch (e) { setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`); return; }
    if (!section?.type) { setError('Section must have a "type" field'); return; }
    if (!name.trim())   { setError('Name is required'); return; }
    setSaving(true);
    try {
      const url = isEdit ? `/api/drce/blocks/${block!.id}` : '/api/drce/blocks';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), kind, section }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) { setError(data?.error ?? 'Save failed'); return; }
      onSaved();
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[6vh] px-4" onMouseDown={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[88vh]" onMouseDown={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">{isEdit ? `Edit block #${block!.id}` : 'New block'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Name</span>
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Kind</span>
              <select value={kind} onChange={e => setKind(e.target.value as Kind)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm outline-none">
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Description</span>
            <input value={description} onChange={e => setDescription(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Section JSON</span>
            <textarea value={sectionJson} onChange={e => setSectionJson(e.target.value)} rows={16} spellCheck={false}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-mono outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-[10px] text-slate-400">A DRCESection (typically a container with children). Paste from an existing document or hand-author.</span>
          </label>
        </div>

        <footer className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-60">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isEdit ? 'Save changes' : 'Create block'}
          </button>
        </footer>
      </div>
    </div>
  );
}
