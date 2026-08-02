'use client';

/**
 * Database Backup Center — shared UI, driven entirely from the client.
 *
 * Generation is a client-driven step loop (see src/lib/backup/orchestrator.ts
 * for why: Vercel Hobby has no durable background-worker infrastructure and
 * short serverless timeouts, so the browser itself drives progress one
 * bounded call at a time). Every table's status is rendered live, from the
 * moment `start` returns the discovered list — never a bare spinner.
 *
 * Used by both /backup (school-scoped, apiBase="/api/backup") and
 * /control/backup (apiBase="/api/control-center/backup", with a school
 * picker supplied by the caller).
 */
import React, { useCallback, useState } from 'react';
import useSWR from 'swr';
import { Database, Loader2, CheckCircle2, AlertTriangle, Download, Trash2, RefreshCw, HardDrive } from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

type TableRow = { table: string; ownership: 'direct' | 'indirect'; estimatedRows: number };
type TableStatus = 'pending' | 'in_progress' | 'done';

interface Props {
  apiBase: string; // '/api/backup' or '/api/control-center/backup'
  schoolId?: number | null; // control-center: the operator-chosen school; school-side: ignored (session-derived server-side)
  schoolPicker?: React.ReactNode; // control-center only
  canGenerate: boolean;
}

const STAGE_LABEL: Record<string, string> = {
  discovering: 'Preparing backup…',
  generating: 'Generating SQL…',
  finalizing: 'Compressing…',
  uploading: 'Uploading…',
  verifying: 'Verifying…',
  completed: 'Backup completed successfully.',
  failed: 'Backup failed.',
};

export function BackupCenter({ apiBase, schoolId, schoolPicker, canGenerate }: Props) {
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [tableStatus, setTableStatus] = useState<Record<string, { status: TableStatus; rowsDone: number }>>({});
  const [sizeWarning, setSizeWarning] = useState(false);
  const [estimatedRowCount, setEstimatedRowCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeBackupId, setActiveBackupId] = useState<number | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [search, setSearch] = useState('');

  const historyUrl = `${apiBase}/history?page=${historyPage}&limit=20${schoolId ? `&school_id=${schoolId}` : ''}`;
  const { data: historyData, mutate: reloadHistory } = useSWR(historyUrl, fetcher, { refreshInterval: running ? 4000 : 0 });
  const records: any[] = historyData?.records || [];
  const filteredRecords = search.trim()
    ? records.filter((r) => (r.school_name_snapshot || '').toLowerCase().includes(search.trim().toLowerCase()) || (r.file_name || '').toLowerCase().includes(search.trim().toLowerCase()))
    : records;

  const post = useCallback(async (url: string, body?: any) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  }, []);

  const runBackup = useCallback(async () => {
    if (schoolId === null || schoolId === undefined ? false : !schoolId && apiBase.includes('control-center')) {
      toast.error('Choose a school first');
      return;
    }
    setRunning(true);
    setError(null);
    setTableStatus({});
    setStage('discovering');
    try {
      const startBody = apiBase.includes('control-center') ? { schoolId } : undefined;
      const start = await post(`${apiBase}/start`, startBody);
      setActiveBackupId(start.backupId);
      setTables(start.tables);
      setSizeWarning(start.sizeWarning);
      setEstimatedRowCount(start.estimatedRowCount);
      const initial: Record<string, { status: TableStatus; rowsDone: number }> = {};
      for (const t of start.tables) initial[t.table] = { status: 'pending', rowsDone: 0 };
      setTableStatus(initial);
      setStage('generating');

      // Step loop — one table at a time, one batch per call. Tables the
      // pre-flight estimate already knows are empty skip the row-fetch
      // round trip server-side (knownEmpty) — the single biggest lever
      // given how many school-scoped tables are empty for any one school.
      for (let i = 0; i < start.tables.length; i++) {
        const tableName = start.tables[i].table;
        const knownEmpty = start.tables[i].estimatedRows === 0;
        setTableStatus((s) => ({ ...s, [tableName]: { status: 'in_progress', rowsDone: 0 } }));
        let offset = 0;
        let tableDone = false;
        while (!tableDone) {
          const step = await post(`${apiBase}/${start.backupId}/step`, { tableIndex: i, offset, knownEmpty });
          offset = step.nextOffset;
          tableDone = step.tableDone;
          setTableStatus((s) => ({ ...s, [tableName]: { status: tableDone ? 'done' : 'in_progress', rowsDone: offset } }));
        }
      }

      // Finalize loop — assemble/split -> upload each part -> verify.
      setStage('finalizing');
      for (;;) {
        const fin = await post(`${apiBase}/${start.backupId}/finalize`);
        setStage(fin.stage);
        if (fin.stage === 'completed') break;
        if (fin.stage === 'failed') { setError(fin.error || 'Backup failed'); break; }
      }
      reloadHistory();
      toast.success('Backup completed successfully.');
    } catch (e: any) {
      setError(e.message || 'Backup failed');
      setStage('failed');
      toast.error(e.message || 'Backup failed');
    } finally {
      setRunning(false);
    }
  }, [apiBase, schoolId, post, reloadHistory]);

  const deleteBackup = useCallback(async (id: number) => {
    if (!confirm('Delete this backup? This removes it from Cloudinary and DRAIS permanently.')) return;
    const r = await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
    if (!r.ok) { toast.error('Delete failed'); return; }
    toast.success('Deleted');
    reloadHistory();
  }, [apiBase, reloadHistory]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Database className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Database Backup Center</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Generate a complete, restorable SQL backup, stored in Cloudinary, fully audited.</p>
        </div>
      </div>

      {schoolPicker}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <button
          onClick={runBackup}
          disabled={running || !canGenerate}
          className="flex items-center gap-2 px-5 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold"
        >
          {running && <Loader2 className="w-4 h-4 animate-spin" />}
          {running ? (STAGE_LABEL[stage || ''] || 'Working…') : 'Generate Backup'}
        </button>

        {sizeWarning && running && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> This is a large backup (~{estimatedRowCount.toLocaleString()} rows) — it will take a while and upload in multiple parts.
          </p>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-sm text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {/* Live per-table checklist — always visible during a run, never a bare progress bar. */}
        {tables.length > 0 && (running || stage === 'failed') && (
          <div className="mt-4 border-t border-gray-100 dark:border-gray-700/50 pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">{STAGE_LABEL[stage || ''] || stage}</p>
            <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50 text-xs">
              {tables.map((t) => {
                const st = tableStatus[t.table]?.status ?? 'pending';
                return (
                  <li key={t.table} className="py-1.5 flex items-center justify-between font-mono">
                    <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      {st === 'done' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : st === 'in_progress' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> : <span className="w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-600" />}
                      {t.table}
                    </span>
                    <span className="text-gray-400">
                      {st === 'done' ? `${tableStatus[t.table]?.rowsDone ?? t.estimatedRows} rows` : st === 'in_progress' ? `${tableStatus[t.table]?.rowsDone ?? 0}…` : `~${t.estimatedRows}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-indigo-500" /> Backup History</p>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search school or filename…" className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700" />
            <button onClick={() => reloadHistory()} className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left py-1.5 pr-3">School</th>
                <th className="text-left py-1.5 pr-3">Started</th>
                <th className="text-left py-1.5 pr-3">Status</th>
                <th className="text-right py-1.5 pr-3">Size</th>
                <th className="text-right py-1.5 pr-3">Duration</th>
                <th className="text-left py-1.5 pr-3">By</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filteredRecords.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-400">No backups yet.</td></tr>}
              {filteredRecords.map((r: any) => (
                <tr key={r.id}>
                  <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">{r.school_name_snapshot}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : r.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                      {r.status}
                    </span>
                    {r.status === 'failed' && r.error_message && <p className="text-[10px] text-rose-500 mt-0.5 max-w-[200px] truncate" title={r.error_message}>{r.error_message}</p>}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-gray-500">{r.compressed_bytes ? `${(r.compressed_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-500">{r.duration_ms ? `${Math.round(r.duration_ms / 1000)}s` : '—'}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{r.initiated_by_name || (r.initiated_via === 'control' ? 'Control Center' : '—')}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {r.status === 'completed' && (
                      <a href={`${apiBase}/${r.id}/download`} target="_blank" rel="noreferrer" className="p-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded inline-block" title="Download"><Download className="w-3.5 h-3.5" /></a>
                    )}
                    <button onClick={() => deleteBackup(r.id)} className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {historyData?.pagination?.pages > 1 && (
          <div className="flex items-center justify-end gap-2 mt-3 text-xs">
            <button disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40">Prev</button>
            <span className="text-gray-400">{historyPage} / {historyData.pagination.pages}</span>
            <button disabled={historyPage >= historyData.pagination.pages} onClick={() => setHistoryPage((p) => p + 1)} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
