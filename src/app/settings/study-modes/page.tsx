"use client";
/**
 * Settings — Study Modes
 *
 * Manage how students attend: Full-time, Part-time, Distance, etc.
 * Actions: create, rename, set-as-default, deactivate (soft-delete).
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Layers, Plus, Star, Pencil, Trash2, Check, X,
  AlertCircle, ShieldAlert, RotateCcw,
} from 'lucide-react';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import clsx from 'clsx';

interface StudyMode {
  id: number;
  school_id: number | null;
  name: string;
  is_default: number;
  is_active: number;
}

export default function StudyModesPage() {
  const { data, mutate } = useSWR<{ success: boolean; data: StudyMode[] }>(
    '/api/study-modes',
  );

  const modes: StudyMode[] = data?.data ?? [];
  const isSystemFallback = modes.length > 0 && modes[0].school_id == null;

  // Add form state
  const [addName, setAddName] = useState('');
  const [addDefault, setAddDefault] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = addName.trim();
    if (!name) { showToast('error', 'Name is required'); return; }
    setAddLoading(true);
    try {
      await apiFetch('/api/study-modes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, is_default: addDefault }),
        successMessage: `"${name}" added`,
      });
      setAddName('');
      setAddDefault(false);
      mutate();
    } catch (err: any) {
      // apiFetch already showed toast
    } finally {
      setAddLoading(false);
    }
  };

  const startEdit = (mode: StudyMode) => {
    setEditingId(mode.id);
    setEditName(mode.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = async (id: number) => {
    const name = editName.trim();
    if (!name) { showToast('error', 'Name cannot be empty'); return; }
    setEditLoading(true);
    try {
      await apiFetch('/api/study-modes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
        successMessage: 'Renamed successfully',
      });
      setEditingId(null);
      mutate();
    } catch (err: any) {
      // apiFetch already showed toast
    } finally {
      setEditLoading(false);
    }
  };

  const setDefault = async (id: number) => {
    try {
      await apiFetch('/api/study-modes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_default: true }),
        successMessage: 'Default updated',
      });
      mutate();
    } catch (err: any) {
      // apiFetch already showed toast
    }
  };

  const confirmDelete = async (id: number) => {
    try {
      await apiFetch(`/api/study-modes?id=${id}`, { method: 'DELETE' });
      setDeletingId(null);
      mutate();
    } catch (err: any) {
      // apiFetch already showed toast
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Study Modes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Define how students attend (e.g. Full-time, Part-time, Distance). One must be the default.
            </p>
          </div>
        </div>

        {/* System-default warning */}
        {isSystemFallback && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Using system defaults</p>
              <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-400">
                Your school has no custom study modes. The list below shows system-wide defaults.
                Add your own modes to override them.
              </p>
            </div>
          </div>
        )}

        {/* Required notice */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-400 font-semibold">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          Study mode is <strong className="mx-1">required</strong> for every enrollment. At least one must be configured.
        </div>

        {/* Existing modes */}
        <div className="card-glass divide-y divide-slate-100 dark:divide-slate-700/50 overflow-hidden">
          {modes.length === 0 && (
            <div className="px-6 py-10 text-center text-slate-400 dark:text-slate-500">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No study modes yet. Add one below.</p>
            </div>
          )}

          {modes.map(mode => (
            <div key={mode.id} className="flex items-center gap-3 px-5 py-4">

              {/* Icon */}
              <div className={clsx(
                'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                mode.is_default
                  ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-400',
              )}>
                <Layers className="w-4 h-4" />
              </div>

              {/* Name / edit field */}
              <div className="flex-1 min-w-0">
                {editingId === mode.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit(mode.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="w-full px-3 py-1.5 rounded-lg border-2 border-indigo-400 dark:border-indigo-500 bg-white dark:bg-slate-800 text-sm focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800 dark:text-white truncate">{mode.name}</span>
                    {mode.is_default === 1 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
                        <Star className="w-2.5 h-2.5" /> Default
                      </span>
                    )}
                    {mode.school_id == null && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                        System
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {editingId === mode.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(mode.id)}
                      disabled={editLoading}
                      title="Save"
                      className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition"
                    >
                      {editLoading ? <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin inline-block" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={cancelEdit} title="Cancel" className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : deletingId === mode.id ? (
                  <>
                    <span className="text-xs text-red-600 dark:text-red-400 font-semibold mr-1">Remove?</span>
                    <button
                      onClick={() => confirmDelete(mode.id)}
                      className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60 transition"
                      title="Confirm remove"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeletingId(null)} className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition" title="Cancel">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    {mode.is_default !== 1 && mode.school_id != null && (
                      <button
                        onClick={() => setDefault(mode.id)}
                        title="Set as default"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    {mode.school_id != null && (
                      <>
                        <button
                          onClick={() => startEdit(mode)}
                          title="Rename"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(mode.id)}
                          title="Remove"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add new mode */}
        <div className="card-glass p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-500" />
            Add Study Mode
          </h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-3">
              <input
                type="text"
                value={addName}
                onChange={e => setAddName(e.target.value)}
                placeholder="e.g. Full-time, Part-time, Distance…"
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                type="submit"
                disabled={addLoading || !addName.trim()}
                className="btn-primary px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addLoading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Plus className="w-4 h-4" />
                }
                Add
              </button>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addDefault}
                onChange={e => setAddDefault(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-slate-600 dark:text-slate-300">Set as default study mode</span>
            </label>
          </form>
        </div>

        {/* Usage note */}
        <div className="px-4 py-3 rounded-2xl bg-white/50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p className="font-semibold text-slate-600 dark:text-slate-300">How study modes work</p>
          <p>Every enrollment must have a study mode. The default is pre-selected automatically when enrolling.</p>
          <p>System modes (marked <em>System</em>) cannot be edited here — add your own to override.</p>
          <p>Removing a mode hides it from new enrollments but does not affect existing ones.</p>
        </div>

      </div>
    </div>
  );
}
