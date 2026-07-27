'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Trash2, Archive, RotateCcw, AlertTriangle, Loader2, Search,
  Inbox, X, ShieldAlert,
} from 'lucide-react';
import { showToast, confirmAction } from '@/lib/toast';

interface CatalogEntry {
  code:        string;
  label:       string;
  pluralLabel: string;
}

interface TrashRow {
  entity:         string;
  entityLabel:    string;
  id:             number;
  label:          string;
  subtitle:       string | null;
  deletedAt:      string;
  deletedBy:      number | null;
  deletedByName:  string | null;
  deleteReason:   string | null;
  restoredBefore: boolean;
}

interface ListResponse {
  success: boolean;
  catalog: CatalogEntry[];
  items:   TrashRow[];
  total:   number;
  page:    number;
  limit:   number;
}

interface DependencyReport {
  label:    string;
  count:    number;
  blocking: boolean;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface 4xx/5xx as a thrown Error so SWR's error state catches it
    // instead of letting the page render with an undefined `items` array.
    const err = new Error(body?.error || `Request failed (${res.status})`);
    (err as any).status = res.status;
    throw err;
  }
  return body;
};

/**
 * Universal trash management page.
 *
 * Lists every archived row across every registered entity, tabbed by
 * type, searchable, with one-click Restore and a guarded Purge flow
 * that shows the dependency blast radius before the row is permanently
 * removed.
 */
export default function TrashPage() {
  const [entity, setEntity]   = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [page,   setPage]     = useState(1);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (entity) sp.set('entity', entity);
    if (search) sp.set('search', search);
    sp.set('page', String(page));
    sp.set('limit', '50');
    return sp.toString();
  }, [entity, search, page]);

  const { data, error, isLoading, mutate } = useSWR<ListResponse>(
    `/api/admin/trash?${queryString}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashRow | null>(null);

  // ── Bulk selection + bulk purge/restore ──────────────────────────────────
  const rows = data?.items ?? [];
  const keyOf = (r: { entity: string; id: number }) => `${r.entity}:${r.id}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | { verb: string; done: number; total: number }>(null);
  // Reset selection whenever the visible slice changes (keys would go stale).
  useEffect(() => { setSelected(new Set()); }, [entity, page, search]);

  const allChecked = rows.length > 0 && rows.every(r => selected.has(keyOf(r)));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map(keyOf)));
  const toggleOne = (r: TrashRow) => setSelected(prev => {
    const n = new Set(prev); const k = keyOf(r); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  // Fetch EVERY trashed row (all pages) for a category or the whole bin.
  const fetchAllRows = useCallback(async (entityFilter: string | null): Promise<TrashRow[]> => {
    const out: TrashRow[] = [];
    for (let p = 1; p <= 500; p++) {
      const sp = new URLSearchParams();
      if (entityFilter) sp.set('entity', entityFilter);
      sp.set('page', String(p)); sp.set('limit', '200');
      const res = await fetch(`/api/admin/trash?${sp}`, { credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const items: TrashRow[] = json.items ?? [];
      out.push(...items);
      if (items.length === 0 || out.length >= (json.total ?? 0)) break;
    }
    return out;
  }, []);

  // One purge per row (reuses the dependency-gated endpoint), chunked with
  // progress. Blocked (dependency) rows are counted + reported, never dropped.
  const bulkPurge = useCallback(async (targets: TrashRow[], noun: string) => {
    if (targets.length === 0) return;
    const ok = await confirmAction(
      '⚠️ Permanently delete',
      `Permanently delete ${targets.length} ${noun}? This CANNOT be undone. Items with blocking dependencies are skipped.`,
      'Delete Forever',
    );
    if (!ok) return;
    setBulk({ verb: 'Purging', done: 0, total: targets.length });
    let purged = 0, blocked = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      try {
        const res = await fetch('/api/admin/trash/purge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: r.entity, id: r.id, confirmation: true }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) purged++;
        else if (json?.code === 'DEPENDENCIES_PRESENT') blocked++;
        else failed++;
      } catch { failed++; }
      setBulk({ verb: 'Purging', done: i + 1, total: targets.length });
    }
    setBulk(null); setSelected(new Set());
    showToast(blocked || failed ? 'warning' : 'success',
      `Purged ${purged}${blocked ? `, ${blocked} blocked by dependencies` : ''}${failed ? `, ${failed} failed` : ''}`);
    mutate();
  }, [mutate]);

  const bulkRestore = useCallback(async (targets: TrashRow[]) => {
    if (targets.length === 0) return;
    setBulk({ verb: 'Restoring', done: 0, total: targets.length });
    let ok = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const r = targets[i];
      try {
        const res = await fetch('/api/admin/trash/restore', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: r.entity, id: r.id }),
        });
        if (res.ok) ok++; else failed++;
      } catch { failed++; }
      setBulk({ verb: 'Restoring', done: i + 1, total: targets.length });
    }
    setBulk(null); setSelected(new Set());
    showToast(failed ? 'warning' : 'success', `Restored ${ok}${failed ? `, ${failed} failed` : ''}`);
    mutate();
  }, [mutate]);

  const selectedRows = () => rows.filter(r => selected.has(keyOf(r)));
  const purgeCategory = async () => bulkPurge(await fetchAllRows(entity), entity ? `${entity} item(s)` : 'item(s)');
  const purgeEverything = async () => bulkPurge(await fetchAllRows(null), 'items across ALL categories');

  async function handleRestore(row: TrashRow) {
    const key = `${row.entity}:${row.id}`;
    setBusyId(key);
    try {
      const res = await fetch('/api/admin/trash/restore', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entity: row.entity, id: row.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      showToast('success', `${row.entityLabel} restored`);
      mutate();
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Trash2 className="w-6 h-6" /> Trash
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Archived items across DRAIS. Restore returns the item to active
          state. Purge permanently deletes it (super-admin only).
        </p>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        <button
          onClick={() => { setEntity(null); setPage(1); }}
          className={`px-3 py-1.5 text-xs rounded-md ${entity === null ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        >
          All
        </button>
        {data?.catalog?.map(c => (
          <button
            key={c.code}
            onClick={() => { setEntity(c.code); setPage(1); }}
            className={`px-3 py-1.5 text-xs rounded-md ${entity === c.code ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            {c.pluralLabel}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search archived items by name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
      </div>

      {/* Bulk actions */}
      {data && (data.items?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {bulk ? (
            <span className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin" /> {bulk.verb} {bulk.done}/{bulk.total}…
            </span>
          ) : (
            <>
              {selected.size > 0 && (
                <>
                  <span className="text-xs text-slate-500">{selected.size} selected</span>
                  <button
                    onClick={() => bulkRestore(selectedRows())}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  ><RotateCcw className="w-3.5 h-3.5" /> Restore selected</button>
                  <button
                    onClick={() => bulkPurge(selectedRows(), 'selected item(s)')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-rose-600 text-white hover:bg-rose-700"
                  ><Trash2 className="w-3.5 h-3.5" /> Purge selected ({selected.size})</button>
                  <span className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-600" />
                </>
              )}
              {entity ? (
                <button
                  onClick={purgeCategory}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                ><Trash2 className="w-3.5 h-3.5" /> Purge all {data.catalog?.find(c => c.code === entity)?.pluralLabel ?? 'items'} ({data.total})</button>
              ) : (
                <button
                  onClick={purgeEverything}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-rose-700 text-white hover:bg-rose-800"
                ><ShieldAlert className="w-3.5 h-3.5" /> Purge everything ({data.total})</button>
              )}
            </>
          )}
        </div>
      )}

      {error && (() => {
        const status = (error as any)?.status as number | undefined;
        const message = error instanceof Error ? error.message : 'Failed to load trash';
        const isAuth = status === 401 || status === 403;
        return (
          <div className="rounded border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-700 dark:text-rose-300 flex items-start gap-3">
            {isAuth ? <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            <div className="flex-1">
              <p className="font-semibold">{isAuth ? 'Access denied' : 'Failed to load trash'}</p>
              <p className="text-xs mt-0.5 opacity-90">{message}</p>
              {isAuth && (
                <p className="text-xs mt-2 opacity-90">
                  Your role needs the <code className="px-1 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 font-mono">trash.read</code> permission.
                  Ask an administrator to grant it from <span className="font-mono">/admin/roles</span>.
                </p>
              )}
              <button
                onClick={() => mutate()}
                className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-rose-400 text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-900/40"
              >
                <RotateCcw className="w-3 h-3" /> Retry
              </button>
            </div>
          </div>
        );
      })()}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading trash…
        </div>
      )}

      {data && !isLoading && (data.items?.length ?? 0) === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center text-slate-500 flex flex-col items-center gap-2">
          <Inbox className="w-10 h-10 text-slate-300" />
          <p className="text-sm font-medium">Trash is empty</p>
          <p className="text-xs">Archived items appear here. Active data is unaffected.</p>
        </div>
      )}

      {data && (data.items?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all on this page" />
                  </th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Archived on</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(row => {
                  const key = `${row.entity}:${row.id}`;
                  return (
                    <tr key={key} className={`border-t border-slate-200 dark:border-slate-700 ${selected.has(key) ? 'bg-rose-50/40 dark:bg-rose-950/20' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(key)} onChange={() => toggleOne(row)} aria-label={`Select ${row.label}`} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.label}</div>
                        {row.subtitle && (
                          <div className="text-[11px] text-slate-500">{row.subtitle}</div>
                        )}
                        {row.restoredBefore && (
                          <div className="text-[10px] text-amber-600 mt-0.5">previously restored</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          {row.entityLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {new Date(row.deletedAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.deletedByName ?? (row.deletedBy ? `user #${row.deletedBy}` : '—')}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate" title={row.deleteReason ?? ''}>
                        {row.deleteReason ?? '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleRestore(row)}
                            disabled={busyId === key}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </button>
                          <button
                            onClick={() => setPurgeTarget(row)}
                            disabled={busyId === key}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
                          >
                            <Trash2 className="w-3 h-3" /> Purge
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.total > data.limit && (
            <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              <span>{(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={data.page === 1}
                  className="px-2 py-1 rounded border disabled:opacity-40"
                >Prev</button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={data.page * data.limit >= data.total}
                  className="px-2 py-1 rounded border disabled:opacity-40"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {purgeTarget && (
        <PurgeModal
          row={purgeTarget}
          onClose={() => setPurgeTarget(null)}
          onDone={() => { setPurgeTarget(null); mutate(); }}
        />
      )}
    </div>
  );
}

function PurgeModal(props: {
  row:     TrashRow;
  onClose: () => void;
  onDone:  () => void;
}) {
  const { row, onClose, onDone } = props;
  const [deps, setDeps] = useState<DependencyReport[] | null>(null);
  const [depsError, setDepsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const loadDeps = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/trash/dependencies', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entity: row.entity, id: row.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setDeps(json.dependencies as DependencyReport[]);
    } catch (e: unknown) {
      setDepsError(e instanceof Error ? e.message : 'Failed to load dependencies');
    }
  }, [row.entity, row.id]);

  useEffect(() => { loadDeps(); }, [loadDeps]);

  async function handlePurge() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/trash/purge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entity: row.entity, id: row.id, confirmation: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.code === 'DEPENDENCIES_PRESENT') {
          showToast('error', json.error);
        } else {
          showToast('error', json?.error || `HTTP ${res.status}`);
        }
        return;
      }
      showToast('success', `${row.entityLabel} permanently deleted`);
      onDone();
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Purge failed');
    } finally {
      setBusy(false);
    }
  }

  const totalAffected = (deps ?? []).reduce((sum, d) => sum + d.count, 0);
  const blockers      = (deps ?? []).filter(d => d.blocking && d.count > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 p-3">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="w-4 h-4 text-rose-600" /> Permanently delete
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              This permanently removes <b>{row.label}</b> ({row.entityLabel}) from the database.
              The action is irreversible. Source records will remain audited in the audit log.
            </span>
          </div>

          {deps === null && !depsError && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking dependencies…
            </div>
          )}
          {depsError && <div className="text-xs text-rose-600">{depsError}</div>}
          {deps && deps.length === 0 && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              No referencing records found.
            </div>
          )}
          {deps && deps.length > 0 && (
            <div className="rounded border border-slate-200 dark:border-slate-700 p-2 text-xs">
              <div className="font-medium mb-1">Affected records ({totalAffected} total):</div>
              <ul className="space-y-0.5">
                {deps.map(d => (
                  <li key={d.label} className="flex justify-between">
                    <span className={d.blocking && d.count > 0 ? 'text-rose-700 font-medium' : 'text-slate-600'}>
                      {d.label}{d.blocking ? ' (blocking)' : ''}
                    </span>
                    <span className="tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
              {blockers.length > 0 && (
                <div className="mt-2 text-rose-700 text-[11px]">
                  Blocking dependencies must be cleared before purge.
                </div>
              )}
            </div>
          )}

          <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            I understand this action is irreversible.
          </label>
        </div>
        <div className="flex justify-end gap-2 p-3 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border">Cancel</button>
          <button
            onClick={handlePurge}
            disabled={!acknowledged || busy || blockers.length > 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Permanently delete
          </button>
        </div>
      </div>
    </div>
  );
}
