"use client";
/**
 * DRCE Phase F — version history drawer.
 *
 * Lists per-save snapshots for the active document (most recent first) and
 * lets the user restore any one. Restoring writes a new version itself, so
 * it is undoable.
 */
import React, { useEffect, useState } from 'react';
import { History, Loader2, RotateCcw, X, CheckCircle2 } from 'lucide-react';

interface VersionRow {
  id:             number;
  document_id:    number;
  version_no:     number;
  name:           string | null;
  change_summary: string | null;
  author_user_id: number | null;
  created_at:     string;
}

export function VersionHistoryDrawer({
  documentId, open, onClose, onRestored, currentVersion,
}: {
  documentId:     number | null;
  open:           boolean;
  onClose:        () => void;
  onRestored:     () => void;
  currentVersion: number | undefined;
}) {
  const [rows, setRows] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !documentId) return;
    setLoading(true); setError('');
    fetch(`/api/dvcf/documents/${documentId}/versions`)
      .then(r => r.json())
      .then(data => {
        if (data?.success) setRows(data.versions ?? []);
        else setError(data?.error ?? 'Failed to load history');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, [open, documentId]);

  if (!open || !documentId) return null;

  async function restore(v: number) {
    if (!documentId) return;
    if (!window.confirm(`Restore version ${v}? Your current state will be saved as a new version first.`)) return;
    setRestoring(v); setError('');
    try {
      const res = await fetch(`/api/dvcf/documents/${documentId}/versions/${v}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setError(data?.error ?? 'Restore failed'); return;
      }
      onRestored();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <aside
        className="relative ml-auto w-full max-w-sm h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-gray-200 dark:border-slate-700 flex flex-col"
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-gray-800 dark:text-white">Version history</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {error && (
            <div className="mx-2 my-2 text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{error}</div>
          )}
          {!loading && rows.length === 0 && !error && (
            <p className="text-xs text-gray-400 px-3 py-6 text-center">No history yet. Save the document to create your first version.</p>
          )}
          <ul className="space-y-1">
            {rows.map(r => {
              const isCurrent = currentVersion === r.version_no;
              return (
                <li key={r.id}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    isCurrent
                      ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-700'
                      : 'border-transparent hover:border-gray-200 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                      v{r.version_no}
                      {isCurrent && <span className="text-[10px] font-semibold text-emerald-600 inline-flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />current</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {r.change_summary || r.name || 'Saved'}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => restore(r.version_no)}
                      disabled={restoring === r.version_no}
                      className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50"
                    >
                      {restoring === r.version_no
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RotateCcw className="w-3 h-3" />}
                      Restore
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="px-4 py-2 border-t border-gray-100 dark:border-slate-800 text-[10px] text-gray-400">
          Each save creates a version. Restoring is itself undoable.
        </footer>
      </aside>
    </div>
  );
}
