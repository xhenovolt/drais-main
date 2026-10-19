'use client';
/**
 * /admin/audit-logs
 * Paginated audit trail table — Admin only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Shield, ChevronLeft, ChevronRight, RefreshCw, Search, Download, Trash2 } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { apiErrorMessage } from '@/lib/errorMessage';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

/** Server English in Arabic → the page's own message. */
const serverText = (s: string | null | undefined, fallback: string) => (s && !(uiIsArabic() && isEnglishText(s)) ? s : fallback);

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
  const { t, rich, lang, digits } = useI18n();
  const [logs,        setLogs]        = useState<AuditLog[]>([]);
  const [pagination,  setPagination]  = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 1 });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [purgeOpen,   setPurgeOpen]   = useState(false);
  const [purgeBefore, setPurgeBefore] = useState('');
  const [purgeAction, setPurgeAction] = useState('');
  const [purgeReason, setPurgeReason] = useState('');
  const [purgeBusy,   setPurgeBusy]   = useState(false);
  const [purgeMsg,    setPurgeMsg]    = useState<string | null>(null);

  const runPurge = async () => {
    setPurgeBusy(true);
    setPurgeMsg(null);
    try {
      const res = await fetch('/api/admin/audit-logs', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          before: purgeBefore || undefined,
          action: purgeAction.trim() || undefined,
          reason: purgeReason.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPurgeMsg(serverText(apiErrorMessage(j, 'Deletion failed.'), t('staffPages.audit.deletionFailed', "Deletion failed.")));
      } else {
        setPurgeMsg(serverText(j?.message, t('staffPages.audit.deletedN', { n: j?.deleted ?? 0 })));
        setPurgeReason('');
        fetchLogs(1);
      }
    } catch {
      setPurgeMsg(t('staffPages.audit.noServer', "Could not reach the server."));
    } finally {
      setPurgeBusy(false);
    }
  };

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      const res  = await fetch(`/api/admin/audit-logs?${params}`);
      const data = await res.json().catch(() => null);
      // DRAIS returns errors in two shapes; `data.error` is a string in one and
      // an object in the other. Passing the object straight to new Error() made
      // this screen display "[object Object]" in place of the audit trail
      // whenever a session expired or a permission was missing.
      if (!res.ok || !data?.success) {
        throw new Error(serverText(apiErrorMessage(data, `Could not load the audit trail (${res.status}).`), t('staffPages.audit.loadFailed', { status: res.status })));
      }
      setLogs(Array.isArray(data.data) ? data.data : []);
      setPagination(data.pagination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, t]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">{t('operations.auditTrail')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('staffPages.audit.totalEvents', { count: pagination.total })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const p = new URLSearchParams({ format: 'csv' });
              if (actionFilter.trim()) p.set('action', actionFilter.trim());
              window.open(`/api/admin/audit-logs?${p}`, '_blank');
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title={t('staffPages.audit.exportTitle', "Export the current filter to CSV (audited)")}
          >
            <Download className="w-4 h-4" /> {t('staffPages.audit.exportCsv', "Export CSV")}
          </button>
          <button
            onClick={() => fetchLogs(pagination.page)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('staffPages.audit.refresh', "Refresh")}
          </button>
          {/* Permanent deletion. Super-admin only, server-enforced; a non-super
              admin sees the button and gets a clear 403 rather than the control
              being hidden and the capability looking absent. */}
          <button
            onClick={() => setPurgeOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            title={t('staffPages.audit.deleteTitle', "Permanently delete audit entries (recorded, irreversible)")}
          >
            <Trash2 className="w-4 h-4" /> {t('staffPages.audit.delete', "Delete")}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('staffPages.audit.filterPh', "Filter by action…")}
            className="w-full ps-9 pe-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-400"
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
            {t('staffPages.audit.clear', "Clear")}
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
                {['time', 'user', 'action', 'entity', 'id', 'ip', ''].map(h => (
                  <th key={h} className="text-start px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                    {h ? t(`staffPages.audit.col.${h}`) : ''}
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
                    {t('staffPages.audit.none', "No audit logs yet")}
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
                        {log.actor_name?.trim() || <span className="text-slate-400 italic">{t('staffPages.audit.system', "System")}</span>}
                      </td>
                      <td className="px-4 py-3">{actionBadge(log.action)}</td>
                      <td dir="ltr" className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs text-start rtl:text-end">{log.entity_type}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-500 font-mono text-xs">{log.entity_id != null ? digits(log.entity_id) : '—'}</td>
                      <td className="px-4 py-3 text-slate-400 dark:text-slate-500 font-mono text-xs" dir="ltr">{log.ip ?? '—'}</td>
                      <td className="px-4 py-3">
                        {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 && (
                          <button
                            onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200"
                          >
                            {expandedId === log.id ? t('staffPages.audit.hide', "Hide") : t('staffPages.audit.details', "Details")}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={7} className="px-4 pb-3 pt-0 bg-slate-50/60 dark:bg-slate-800/40">
                          <pre dir="ltr" className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 rounded-lg p-3 overflow-x-auto max-h-48">
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
              {t('staffPages.audit.pageLine', { page: pagination.page, pages: pagination.pages, total: pagination.total })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page <= 1} aria-label={t('staffPages.audit.prev', "Previous page")}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" />
              </button>
              <button
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages} aria-label={t('staffPages.audit.next', "Next page")}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Permanent-deletion dialog.
          Everything here is written to make irreversibility unmistakable: the
          scope must be stated explicitly (no "delete all" default), a reason is
          mandatory and permanent, and the copy says plainly that the purge
          record itself cannot be removed. */}
      {purgeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/30">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-white">{t('staffPages.audit.purgeTitle', "Delete audit history")}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('staffPages.audit.purgeIntro', "This is permanent. Deleted entries are not recoverable — there is no Trash for audit history.")}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                {rich('staffPages.audit.purgeRecorded', { strong: <strong>{t('staffPages.audit.cannotDelete', 'cannot be deleted from here')}</strong> })}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('staffPages.audit.olderThan', "Delete entries older than")} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={purgeBefore}
                  onChange={(e) => setPurgeBefore(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 mt-1">{t('staffPages.audit.olderHelp', "Required. Entries on or after this date are kept.")}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('staffPages.audit.onlyAction', "Only this action")} <span className="font-normal text-slate-400">{t('staffPages.audit.optional', "(optional)")}</span>
                </label>
                <input
                  value={purgeAction}
                  onChange={(e) => setPurgeAction(e.target.value)}
                  placeholder={t('staffPages.audit.actionPh', "e.g. IMPORT_ROW_ERROR")}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('staffPages.audit.actionHelp', "Leave blank to delete every action in the range. Narrowing to import errors clears noise without touching records of who changed what.")}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('staffPages.audit.reason', "Reason")} <span className="text-rose-500">*</span>
                </label>
                <input
                  value={purgeReason}
                  onChange={(e) => setPurgeReason(e.target.value)}
                  placeholder={t('staffPages.audit.reasonPh', "Why these entries are being removed")}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-400 mt-1">{t('staffPages.audit.reasonHelp', "Stored permanently with your name.")}</p>
              </div>
            </div>

            {purgeMsg && (
              <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200">
                {purgeMsg}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setPurgeOpen(false); setPurgeMsg(null); }}
                className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('staffPages.audit.close', "Close")}
              </button>
              <button
                onClick={runPurge}
                disabled={purgeBusy || !purgeBefore || purgeReason.trim().length < 5}
                className="px-3 py-2 text-sm rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
              >
                {purgeBusy ? t('staffPages.audit.deleting', "Deleting…") : t('staffPages.audit.deletePermanently', "Delete permanently")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
