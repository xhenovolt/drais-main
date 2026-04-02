"use client";

import React, { useState, useCallback, useRef } from 'react';
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
  Zap,
  Database,
  Clock,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'HEARTBEAT' | 'DATA_RECEIVED' | 'DATA_PARSED' | 'PUNCH_SAVED' | 'ERROR' | '';
type StatusFilter = 'success' | 'failed' | '';

interface LogRow {
  id: number;
  device_sn: string;
  ip_address: string | null;
  event_type: EventType;
  table_name: string | null;
  record_count: number;
  user_id: string | null;
  check_time: string | null;
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

interface Summary {
  total_24h: number;
  heartbeats_24h: number;
  punches_24h: number;
  errors_24h: number;
  unmatched_24h: number;
  active_devices_24h: number;
}

interface ApiResponse {
  success: boolean;
  summary: Summary;
  data: LogRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  HEARTBEAT:     'Heartbeat',
  DATA_RECEIVED: 'Raw Data',
  DATA_PARSED:   'Parsed',
  PUNCH_SAVED:   'Punch',
  ERROR:         'Error',
};

const EVENT_COLORS: Record<string, string> = {
  HEARTBEAT:     'bg-blue-100  text-blue-700  dark:bg-blue-900/40  dark:text-blue-300',
  DATA_RECEIVED: 'bg-gray-100  text-gray-700  dark:bg-gray-700     dark:text-gray-300',
  DATA_PARSED:   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  PUNCH_SAVED:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  ERROR:         'bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-300',
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  HEARTBEAT:     <Wifi className="w-3 h-3" />,
  DATA_RECEIVED: <Database className="w-3 h-3" />,
  DATA_PARSED:   <Zap className="w-3 h-3" />,
  PUNCH_SAVED:   <Fingerprint className="w-3 h-3" />,
  ERROR:         <AlertTriangle className="w-3 h-3" />,
};

function EventBadge({ type }: { type: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      EVENT_COLORS[type] ?? 'bg-gray-100 text-gray-600',
    )}>
      {EVENT_ICONS[type]}
      {EVENT_LABELS[type] ?? type}
    </span>
  );
}

function StatusBadge({ status, matched, eventType }: { status: string; matched: number; eventType: string }) {
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <XCircle className="w-3 h-3" /> Error
      </span>
    );
  }
  if (eventType === 'PUNCH_SAVED') {
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
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
      <CheckCircle className="w-3 h-3" /> OK
    </span>
  );
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return ts;
  }
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)  return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3600_000)}h ago`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, color, icon,
}: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className={clsx(
      'rounded-xl border p-4 flex items-center gap-3',
      'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    )}>
      <div className={clsx('p-2 rounded-lg', color)}>{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeviceObservabilityPage() {
  const today = new Date().toISOString().split('T')[0];

  // Filters
  const [page, setPage]           = useState(1);
  const [deviceSn, setDeviceSn]   = useState('');
  const [eventType, setEventType] = useState<EventType>('');
  const [status, setStatus]       = useState<StatusFilter>('');
  const [matched, setMatched]     = useState('');
  const [dateFrom, setDateFrom]   = useState(today);
  const [dateTo, setDateTo]       = useState(today);
  const [search, setSearch]       = useState('');
  const [liveMode, setLiveMode]   = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Build query string
  const params = new URLSearchParams();
  params.set('page',  String(page));
  params.set('limit', '50');
  if (deviceSn)  params.set('device_sn',  deviceSn);
  if (eventType) params.set('event_type', eventType);
  if (status)    params.set('status',     status);
  if (matched)   params.set('matched',    matched);
  if (dateFrom)  params.set('date_from',  dateFrom);
  if (dateTo)    params.set('date_to',    dateTo);
  if (search)    params.set('search',     search);

  const { data, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/zk/logs?${params.toString()}`,
    { refreshInterval: liveMode ? 6000 : 0 },
  );

  // Devices list for filter dropdown
  const { data: devicesData } = useSWR<any>('/api/devices/list');
  const deviceOptions: any[] = devicesData?.data || [];

  const logs      = data?.data        || [];
  const summary   = data?.summary     || {} as Summary;
  const pagMeta   = data?.pagination  || { page: 1, totalPages: 1, total: 0 };

  // ── CSV export ──────────────────────────────────────────────────────────
  const handleExport = () => {
    const header = 'ID,Device SN,Event Type,User ID,Name,Check Time,Matched,Status,Error,Created At';
    const csvRows = logs.map(l => [
      l.id,
      l.device_sn,
      l.event_type,
      l.user_id ?? '',
      l.student_name || l.staff_name || '',
      l.check_time ?? '',
      l.matched ? 'Yes' : 'No',
      l.status,
      (l.error_message ?? '').replace(/,/g, ';'),
      l.created_at,
    ].join(','));
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `device-observability-${dateFrom}-${dateTo}.csv`;
    a.click();
    showToast('success', 'Exported CSV');
  };

  const resetFilters = () => {
    setDeviceSn(''); setEventType(''); setStatus('');
    setMatched(''); setDateFrom(today); setDateTo(today);
    setSearch(''); setPage(1);
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
            Real-time intelligence for every ZKTeco ADMS interaction &bull; {pagMeta.total.toLocaleString()} records
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setLiveMode(m => !m)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg font-medium transition-colors',
              liveMode
                ? 'bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
                : 'bg-gray-100 text-gray-600 border border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
            )}
          >
            <Radio className={clsx('w-4 h-4', liveMode && 'animate-pulse')} />
            {liveMode ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => mutate()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Summary Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total (24h)"     value={summary.total_24h          ?? 0} color="bg-blue-100 dark:bg-blue-900/30"   icon={<Activity className="w-4 h-4 text-blue-600" />} />
        <StatCard label="Heartbeats"      value={summary.heartbeats_24h     ?? 0} color="bg-cyan-100 dark:bg-cyan-900/30"   icon={<Wifi className="w-4 h-4 text-cyan-600" />} />
        <StatCard label="Punches"         value={summary.punches_24h        ?? 0} color="bg-green-100 dark:bg-green-900/30" icon={<Fingerprint className="w-4 h-4 text-green-600" />} />
        <StatCard label="Errors"          value={summary.errors_24h         ?? 0} color="bg-red-100 dark:bg-red-900/30"     icon={<AlertTriangle className="w-4 h-4 text-red-600" />} />
        <StatCard label="Unmatched"       value={summary.unmatched_24h      ?? 0} color="bg-yellow-100 dark:bg-yellow-900/30" icon={<XCircle className="w-4 h-4 text-yellow-600" />} />
        <StatCard label="Active Devices"  value={summary.active_devices_24h ?? 0} color="bg-purple-100 dark:bg-purple-900/30" icon={<Radio className="w-4 h-4 text-purple-600" />} />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Filter className="w-4 h-4" /> Filters
          </span>
          <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* Date From */}
          <input type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
          {/* Date To */}
          <input type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
          {/* Device */}
          <select value={deviceSn} onChange={e => { setDeviceSn(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
            <option value="">All Devices</option>
            {deviceOptions.map((d: any) => (
              <option key={d.sn} value={d.sn}>{d.device_name || d.sn}</option>
            ))}
          </select>
          {/* Event Type */}
          <select value={eventType} onChange={e => { setEventType(e.target.value as EventType); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
            <option value="">All Events</option>
            <option value="HEARTBEAT">Heartbeat</option>
            <option value="DATA_RECEIVED">Raw Data</option>
            <option value="DATA_PARSED">Parsed</option>
            <option value="PUNCH_SAVED">Punch</option>
            <option value="ERROR">Error</option>
          </select>
          {/* Status */}
          <select value={status} onChange={e => { setStatus(e.target.value as StatusFilter); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
            <option value="">Any Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
          {/* Matched */}
          <select value={matched} onChange={e => { setMatched(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
            <option value="">All</option>
            <option value="1">Matched</option>
            <option value="0">Unmatched</option>
          </select>
          {/* Search User ID */}
          <input type="text" placeholder="User ID…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
        </div>
      </div>

      {/* ── Log Table ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading && logs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 dark:text-gray-400 mt-3 text-sm">Loading logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto" />
            <p className="text-gray-500 dark:text-gray-400 mt-3 font-medium">No events found</p>
            <p className="text-gray-400 dark:text-gray-500 mt-1 text-sm">Try adjusting the filters or date range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Device</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">User / Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Check Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map(log => (
                  <React.Fragment key={log.id}>
                    <tr
                      className={clsx(
                        'hover:bg-gray-50 dark:hover:bg-gray-700/30 text-sm cursor-pointer transition-colors',
                        log.status === 'failed' && 'bg-red-50/50 dark:bg-red-900/10',
                      )}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      {/* Time */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-gray-900 dark:text-white text-xs font-mono">{fmtTime(log.created_at)}</div>
                        <div className="text-gray-400 text-xs">{timeAgo(log.created_at)}</div>
                      </td>
                      {/* Device */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white text-xs font-mono">
                          {log.device_sn}
                        </div>
                        {(log.device_name || log.device_location) && (
                          <div className="text-xs text-gray-400">{log.device_name}{log.device_location && ` • ${log.device_location}`}</div>
                        )}
                        {log.ip_address && (
                          <div className="text-xs text-gray-300 dark:text-gray-600">{log.ip_address}</div>
                        )}
                      </td>
                      {/* Event */}
                      <td className="px-4 py-3">
                        <EventBadge type={log.event_type} />
                        {log.table_name && log.event_type !== 'HEARTBEAT' && (
                          <div className="text-xs text-gray-400 mt-1">{log.table_name}</div>
                        )}
                      </td>
                      {/* User / Name */}
                      <td className="px-4 py-3">
                        {log.user_id ? (
                          <>
                            <div className="flex items-center gap-1 font-mono text-xs text-gray-800 dark:text-gray-200">
                              <Fingerprint className="w-3 h-3 text-gray-400" />
                              {log.user_id}
                            </div>
                            {(log.student_name || log.staff_name) && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-medium">
                                {log.student_name || log.staff_name}
                              </div>
                            )}
                            {log.student_id && <div className="text-xs text-gray-400">Student #{log.student_id}</div>}
                            {log.staff_id   && <div className="text-xs text-gray-400">Staff #{log.staff_id}</div>}
                          </>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                        )}
                      </td>
                      {/* Check Time */}
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {log.check_time ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(log.check_time).toLocaleString(undefined, {
                              month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </div>
                        ) : '—'}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status} matched={log.matched} eventType={log.event_type} />
                      </td>
                      {/* Details trigger */}
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {log.record_count > 0 && (
                          <span className="text-gray-500">{log.record_count} rec</span>
                        )}
                        {log.error_message && (
                          <span className="text-red-500 truncate max-w-[120px] block">
                            {log.error_message.substring(0, 60)}
                          </span>
                        )}
                        <span className="text-gray-300 dark:text-gray-600 text-xs">#{log.id}</span>
                      </td>
                    </tr>

                    {/* ── Expanded error/raw detail row ────────────────── */}
                    {expandedId === log.id && (
                      <tr className="bg-gray-50 dark:bg-gray-900/30">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-2 text-xs">
                            {log.error_message && (
                              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <span className="font-semibold text-red-700 dark:text-red-400">Error: </span>
                                <span className="text-red-600 dark:text-red-300 font-mono">{log.error_message}</span>
                              </div>
                            )}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-gray-600 dark:text-gray-400">
                              <div><span className="font-medium">Event ID:</span> #{log.id}</div>
                              <div><span className="font-medium">Device SN:</span> {log.device_sn}</div>
                              <div><span className="font-medium">IP:</span> {log.ip_address || '—'}</div>
                              <div><span className="font-medium">Records:</span> {log.record_count}</div>
                              <div><span className="font-medium">Table:</span> {log.table_name || '—'}</div>
                              <div><span className="font-medium">User ID:</span> {log.user_id || '—'}</div>
                              <div><span className="font-medium">Check Time:</span> {log.check_time || '—'}</div>
                              <div><span className="font-medium">Created:</span> {fmtTime(log.created_at)}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      {pagMeta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagMeta.page} of {pagMeta.totalPages} &bull; {pagMeta.total.toLocaleString()} total
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= pagMeta.totalPages}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
