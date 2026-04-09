'use client';
/**
 * /admin/audit-logs
 * Paginated audit trail table — Admin only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Shield, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';

interface AuditLog {
  id: number;
  actor_name: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown> | string | null;
  source: string | null;
  ip: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const ACTION_COLORS: Record<string, string> = {
  PHOTO_UPLOAD:           'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  BULK_PHOTO_UPLOAD:      'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
  BULK_PHOTO_AUTO_MATCH:  'bg-sky-100    text-sky-700    dark:bg-sky-900/30    dark:text-sky-300',
  BULK_PHOTO_MANUAL_CONFIRM: 'bg-sky-100 text-sky-700    dark:bg-sky-900/30    dark:text-sky-300',
  ENROLLMENT_REVERT:      'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300',
  promote:                'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  photo_upload:           'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
};

function actionBadge(action: string) {
  const cls = ACTION_COLORS[action] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {action}
    </span>
  );
}

export default function AuditLogsPage() {
  const [logs,        setLogs]        = useState<AuditLog[]>([]);
  const [pagination,  setPagination]  = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 1 });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId,  setExpandedId]  = useState<number | null>(null);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      const res  = await fetch(`/api/admin/audit-logs?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to load logs');
      setLogs(data.data);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Audit Trail</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {pagination.total} total event{pagination.total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchLogs(pagination.page)}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by action…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchLogs(1)}
          />
        </div>
        {actionFilter && (
          <button
            onClick={() => setActionFilter('')}
            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Clear
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {['Time', 'User', 'Action', 'Entity', 'ID', 'IP', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 dark:text-slate-500">
                    No audit logs yet
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                        {fmt(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                        {log.actor_name?.trim() || <span className="text-slate-400 italic">System</span>}
                      </td>
                      <td className="px-4 py-3">{actionBadge(log.action)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{log.entity_type}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-500 font-mono text-xs">{log.entity_id ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400 dark:text-slate-500 font-mono text-xs">{log.ip ?? '—'}</td>
                      <td className="px-4 py-3">
                        {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 && (
                          <button
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200"
                          >
                            {expandedId === log.id ? 'Hide' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={7} className="px-4 pb-3 pt-0 bg-slate-50/60 dark:bg-slate-800/40">
                          <pre className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 rounded-lg p-3 overflow-x-auto max-h-48">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Page {pagination.page} of {pagination.pages} · {pagination.total} records
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
