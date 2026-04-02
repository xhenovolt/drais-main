"use client";

import React, { useState } from 'react';
import {
  Activity,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Radio,
  Download,
  Wifi,
  Fingerprint,
  Database,
  Clock,
  FileText,
  Layers,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'raw' | 'parsed' | 'errors';

interface RawRow {
  id: number;
  device_sn: string | null;
  http_method: string;
  query_string: string | null;
  raw_body_preview: string | null;
  body_length: number;
  source_ip: string | null;
  user_agent: string | null;
  endpoint: string | null;
  created_at: string;
}

interface ParsedRow {
  id: number;
  raw_log_id: number;
  device_sn: string | null;
  table_name: string | null;
  raw_line: string | null;
  user_id: string | null;
  check_time: string | null;
  verify_type: number | null;
  inout_mode: number | null;
  work_code: string | null;
  log_id: string | null;
  matched: number;
  student_id: number | null;
  staff_id: number | null;
  status: 'success' | 'failed';
  error_message: string | null;
  created_at: string;
  device_name: string | null;
  device_location: string | null;
  student_name: string | null;
  staff_name: string | null;
}

interface ApiResponse {
  success: boolean;
  tab: string;
  summary: Record<string, number>;
  data: any[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return ts; }
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3600_000)}h ago`;
}

function MethodBadge({ method }: { method: string }) {
  const color = method === 'POST'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  return <span className={clsx('px-2 py-0.5 rounded text-xs font-mono font-bold', color)}>{method}</span>;
}

function StatusPill({ status }: { status: string }) {
  return status === 'failed' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <CheckCircle className="w-3 h-3" /> OK
    </span>
  );
}

function MatchBadge({ matched, status }: { matched: number; status: string }) {
  if (status === 'failed') return <StatusPill status="failed" />;
  return matched ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <CheckCircle className="w-3 h-3" /> Matched
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
      <AlertTriangle className="w-3 h-3" /> Unmatched
    </span>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className={clsx('rounded-xl border p-4 flex items-center gap-3', 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700')}>
      <div className={clsx('p-2 rounded-lg', color)}>{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'raw',    label: 'Raw Logs',    icon: <Database className="w-4 h-4" />,  desc: 'Every HTTP exchange — forensic evidence, never modified' },
  { key: 'parsed', label: 'Parsed Logs', icon: <Layers className="w-4 h-4" />,    desc: 'Per-record interpretation with matching status' },
  { key: 'errors', label: 'Errors',      icon: <AlertTriangle className="w-4 h-4" />, desc: 'Failed records — parsing failures, missing fields, save errors' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeviceObservabilityPage() {
  const today = new Date().toISOString().split('T')[0];

  const [tab, setTab]             = useState<Tab>('raw');
  const [page, setPage]           = useState(1);
  const [deviceSn, setDeviceSn]   = useState('');
  const [dateFrom, setDateFrom]   = useState(today);
  const [dateTo, setDateTo]       = useState(today);
  const [search, setSearch]       = useState('');
  const [tableName, setTableName] = useState('');
  const [liveMode, setLiveMode]   = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Build query
  const params = new URLSearchParams();
  params.set('tab',   tab);
  params.set('page',  String(page));
  params.set('limit', '50');
  if (deviceSn)  params.set('device_sn',   deviceSn);
  if (dateFrom)  params.set('date_from',   dateFrom);
  if (dateTo)    params.set('date_to',     dateTo);
  if (search)    params.set('search',      search);
  if (tableName && tab !== 'raw') params.set('table_name', tableName);

  const { data, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/zk/pipeline?${params.toString()}`,
    { refreshInterval: liveMode ? 6000 : 0 },
  );

  const { data: devicesData } = useSWR<any>('/api/devices/list');
  const deviceOptions: any[] = devicesData?.data || [];

  const rows     = data?.data       || [];
  const summary  = data?.summary    || {};
  const pagMeta  = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const switchTab = (t: Tab) => { setTab(t); setPage(1); setExpandedId(null); };
  const resetFilters = () => { setDeviceSn(''); setDateFrom(today); setDateTo(today); setSearch(''); setTableName(''); setPage(1); };

  // CSV
  const handleExport = () => {
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const header = keys.join(',');
    const csv = rows.map(r => keys.map(k => String(r[k] ?? '').replace(/,/g, ';')).join(','));
    const blob = new Blob([[header, ...csv].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `pipeline-${tab}-${dateFrom}.csv`; a.click();
    showToast('success', 'Exported CSV');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-blue-600" />
            Device Observability
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Raw-first pipeline &mdash; every byte captured, every record tracked &bull; {pagMeta.total.toLocaleString()} records
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setLiveMode(m => !m)}
            className={clsx('flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg font-medium transition-colors',
              liveMode ? 'bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
                       : 'bg-gray-100 text-gray-600 border border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600')}>
            <Radio className={clsx('w-4 h-4', liveMode && 'animate-pulse')} />
            {liveMode ? 'Live' : 'Paused'}
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => mutate()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {TAB_CONFIG.map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
              tab === t.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}>
            {t.icon} {t.label}
            {t.key === 'errors' && (summary as any).failed_24h > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{(summary as any).failed_24h}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Summary Stats (tab-specific) ───────────────────────────────── */}
      {tab === 'raw' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total (24h)" value={summary.total_24h ?? 0}   color="bg-blue-100 dark:bg-blue-900/30"   icon={<Activity className="w-4 h-4 text-blue-600" />} />
          <StatCard label="GET"         value={summary.gets_24h ?? 0}    color="bg-gray-100 dark:bg-gray-700"       icon={<Wifi className="w-4 h-4 text-gray-600" />} />
          <StatCard label="POST"        value={summary.posts_24h ?? 0}   color="bg-blue-100 dark:bg-blue-900/30"   icon={<Database className="w-4 h-4 text-blue-600" />} />
          <StatCard label="Devices"     value={summary.devices_24h ?? 0} color="bg-purple-100 dark:bg-purple-900/30" icon={<Radio className="w-4 h-4 text-purple-600" />} />
        </div>
      )}
      {(tab === 'parsed' || tab === 'errors') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total (24h)"  value={summary.total_24h ?? 0}     color="bg-blue-100 dark:bg-blue-900/30"     icon={<Activity className="w-4 h-4 text-blue-600" />} />
          <StatCard label="Success"      value={summary.success_24h ?? 0}   color="bg-green-100 dark:bg-green-900/30"   icon={<CheckCircle className="w-4 h-4 text-green-600" />} />
          <StatCard label="Failed"       value={summary.failed_24h ?? 0}    color="bg-red-100 dark:bg-red-900/30"       icon={<XCircle className="w-4 h-4 text-red-600" />} />
          <StatCard label="Matched"      value={summary.matched_24h ?? 0}   color="bg-green-100 dark:bg-green-900/30"   icon={<Fingerprint className="w-4 h-4 text-green-600" />} />
          <StatCard label="Unmatched"    value={summary.unmatched_24h ?? 0} color="bg-yellow-100 dark:bg-yellow-900/30" icon={<AlertTriangle className="w-4 h-4 text-yellow-600" />} />
          <StatCard label="Devices"      value={summary.devices_24h ?? 0}   color="bg-purple-100 dark:bg-purple-900/30" icon={<Radio className="w-4 h-4 text-purple-600" />} />
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Filter className="w-4 h-4" /> Filters
          </span>
          <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Reset</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
          <select value={deviceSn} onChange={e => { setDeviceSn(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
            <option value="">All Devices</option>
            {deviceOptions.map((d: any) => <option key={d.sn} value={d.sn}>{d.device_name || d.sn}</option>)}
          </select>
          {tab !== 'raw' && (
            <select value={tableName} onChange={e => { setTableName(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
              <option value="">All Tables</option>
              <option value="ATTLOG">ATTLOG</option>
              <option value="OPERLOG">OPERLOG</option>
              <option value="USERINFO">USERINFO</option>
            </select>
          )}
          <input type="text" placeholder="Search…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading && rows.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 dark:text-gray-400 mt-3 text-sm">Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto" />
            <p className="text-gray-500 dark:text-gray-400 mt-3 font-medium">No {tab} logs found</p>
            <p className="text-gray-400 dark:text-gray-500 mt-1 text-sm">
              {tab === 'errors' ? 'No processing failures — that\'s a good sign!' : 'Try adjusting the filters or date range'}
            </p>
          </div>
        ) : tab === 'raw' ? (
          <RawTable rows={rows as RawRow[]} expandedId={expandedId} setExpandedId={setExpandedId} />
        ) : (
          <ParsedTable rows={rows as ParsedRow[]} expandedId={expandedId} setExpandedId={setExpandedId} isErrors={tab === 'errors'} />
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      {pagMeta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagMeta.page} of {pagMeta.totalPages} &bull; {pagMeta.total.toLocaleString()} total
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pagMeta.totalPages}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Tab description ────────────────────────────────────────────── */}
      <p className="text-center text-xs text-gray-400 dark:text-gray-500">
        {TAB_CONFIG.find(t => t.key === tab)?.desc}
      </p>
    </div>
  );
}

// ─── Raw Logs Table ───────────────────────────────────────────────────────────

function RawTable({ rows, expandedId, setExpandedId }: { rows: RawRow[]; expandedId: number | null; setExpandedId: (id: number | null) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-900/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Method</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Device</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">IP</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Body</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Size</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(r => (
            <React.Fragment key={r.id}>
              <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 text-sm cursor-pointer transition-colors"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-gray-900 dark:text-white text-xs font-mono">{fmtTime(r.created_at)}</div>
                  <div className="text-gray-400 text-xs">{timeAgo(r.created_at)}</div>
                </td>
                <td className="px-4 py-3"><MethodBadge method={r.http_method} /></td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-gray-800 dark:text-gray-200">{r.device_sn || '—'}</div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 font-mono">{r.source_ip || '—'}</td>
                <td className="px-4 py-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-mono max-w-[300px] truncate">
                    {r.raw_body_preview || <span className="text-gray-300 italic">empty</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {r.body_length > 0 ? `${r.body_length}B` : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-300 dark:text-gray-600 font-mono">#{r.id}</td>
              </tr>
              {expandedId === r.id && (
                <tr className="bg-gray-50 dark:bg-gray-900/30">
                  <td colSpan={7} className="px-6 py-4">
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-gray-600 dark:text-gray-400">
                        <div><span className="font-medium">Raw Log ID:</span> #{r.id}</div>
                        <div><span className="font-medium">Device:</span> {r.device_sn || 'unknown'}</div>
                        <div><span className="font-medium">IP:</span> {r.source_ip || '—'}</div>
                        <div><span className="font-medium">Endpoint:</span> {r.endpoint || '—'}</div>
                      </div>
                      {r.query_string && (
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">Query: </span>
                          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">{r.query_string}</code>
                        </div>
                      )}
                      {r.raw_body_preview && (
                        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg font-mono text-xs whitespace-pre-wrap break-all max-h-64 overflow-auto">
                          {r.raw_body_preview}
                        </div>
                      )}
                      {r.user_agent && (
                        <div className="text-gray-400 truncate"><span className="font-medium">UA:</span> {r.user_agent}</div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Parsed / Errors Table ────────────────────────────────────────────────────

function ParsedTable({ rows, expandedId, setExpandedId, isErrors }: {
  rows: ParsedRow[]; expandedId: number | null; setExpandedId: (id: number | null) => void; isErrors: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-900/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Device</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Table</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">User / Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Check Time</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
            {isErrors && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Error</th>}
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Raw Log</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(r => (
            <React.Fragment key={r.id}>
              <tr className={clsx(
                  'hover:bg-gray-50 dark:hover:bg-gray-700/30 text-sm cursor-pointer transition-colors',
                  r.status === 'failed' && 'bg-red-50/50 dark:bg-red-900/10',
                )}
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-gray-900 dark:text-white text-xs font-mono">{fmtTime(r.created_at)}</div>
                  <div className="text-gray-400 text-xs">{timeAgo(r.created_at)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-gray-800 dark:text-gray-200">{r.device_sn || '—'}</div>
                  {r.device_name && <div className="text-xs text-gray-400">{r.device_name}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-medium',
                    r.table_name === 'ATTLOG'  && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                    r.table_name === 'OPERLOG' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
                    r.table_name === 'USERINFO' && 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
                    !r.table_name && 'bg-gray-100 text-gray-500',
                  )}>{r.table_name || '—'}</span>
                </td>
                <td className="px-4 py-3">
                  {r.user_id ? (
                    <>
                      <div className="flex items-center gap-1 font-mono text-xs text-gray-800 dark:text-gray-200">
                        <Fingerprint className="w-3 h-3 text-gray-400" /> {r.user_id}
                      </div>
                      {(r.student_name || r.staff_name) && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
                          {r.student_name || r.staff_name}
                        </div>
                      )}
                    </>
                  ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {r.check_time ? (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(r.check_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  ) : '—'}
                </td>
                <td className="px-4 py-3"><MatchBadge matched={r.matched} status={r.status} /></td>
                {isErrors && (
                  <td className="px-4 py-3 text-xs text-red-600 dark:text-red-400 max-w-[200px] truncate">
                    {r.error_message || '—'}
                  </td>
                )}
                <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                  <span className="text-gray-300 dark:text-gray-600">#{r.id}</span>
                  {r.raw_log_id && <span className="ml-1 text-gray-400">→ raw #{r.raw_log_id}</span>}
                </td>
              </tr>
              {expandedId === r.id && (
                <tr className="bg-gray-50 dark:bg-gray-900/30">
                  <td colSpan={isErrors ? 8 : 7} className="px-6 py-4">
                    <div className="space-y-2 text-xs">
                      {r.error_message && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <span className="font-semibold text-red-700 dark:text-red-400">Error: </span>
                          <span className="text-red-600 dark:text-red-300 font-mono">{r.error_message}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-gray-600 dark:text-gray-400">
                        <div><span className="font-medium">Parsed ID:</span> #{r.id}</div>
                        <div><span className="font-medium">Raw Log:</span> #{r.raw_log_id}</div>
                        <div><span className="font-medium">Device:</span> {r.device_sn || '—'}</div>
                        <div><span className="font-medium">Table:</span> {r.table_name || '—'}</div>
                        <div><span className="font-medium">User ID:</span> {r.user_id || '—'}</div>
                        <div><span className="font-medium">Student:</span> {r.student_name || (r.student_id ? `#${r.student_id}` : '—')}</div>
                        <div><span className="font-medium">Staff:</span> {r.staff_name || (r.staff_id ? `#${r.staff_id}` : '—')}</div>
                        <div><span className="font-medium">Verify:</span> {r.verify_type ?? '—'}</div>
                      </div>
                      {r.raw_line && (
                        <div>
                          <span className="font-medium text-gray-600 dark:text-gray-400">Raw line: </span>
                          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono break-all">{r.raw_line}</code>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
