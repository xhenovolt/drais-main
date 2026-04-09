"use client";

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Activity, Clock, CheckCircle, AlertTriangle, Loader,
  Send, X, Server, RefreshCw, ChevronLeft, ChevronRight,
  Filter,
} from 'lucide-react';
import { fetcher } from '@/utils/fetcher';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:      { label: 'Pending',      color: 'text-yellow-700', bg: 'bg-yellow-100 dark:bg-yellow-900/30', icon: <Clock className="w-3 h-3" /> },
  sent:         { label: 'Sent',         color: 'text-blue-700',   bg: 'bg-blue-100 dark:bg-blue-900/30',   icon: <Send className="w-3 h-3" /> },
  acknowledged: { label: 'Success',      color: 'text-green-700',  bg: 'bg-green-100 dark:bg-green-900/30',  icon: <CheckCircle className="w-3 h-3" /> },
  failed:       { label: 'Failed',       color: 'text-red-700',    bg: 'bg-red-100 dark:bg-red-900/30',     icon: <AlertTriangle className="w-3 h-3" /> },
  expired:      { label: 'Expired',      color: 'text-gray-500',   bg: 'bg-gray-100 dark:bg-gray-700',      icon: <X className="w-3 h-3" /> },
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function truncateCommand(cmd: string, len = 60): string {
  if (cmd.length <= len) return cmd;
  return cmd.slice(0, len) + '…';
}

export default function CommandMonitorPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (statusFilter) params.set('status', statusFilter);
  if (deviceFilter) params.set('device_sn', deviceFilter);

  const { data, isLoading, error, mutate } = useSWR<any>(
    `/api/attendance/zk/commands?${params.toString()}`,
    fetcher,
    { refreshInterval: 5000 },
  );

  const commands = data?.data || [];
  const pagination = data?.pagination || { page: 1, total: 0, totalPages: 1 };

  // Stats from current commands
  const stats = useMemo(() => {
    const s = { pending: 0, sent: 0, acknowledged: 0, failed: 0, expired: 0 };
    commands.forEach((c: any) => { if (s[c.status as keyof typeof s] !== undefined) s[c.status as keyof typeof s]++; });
    return s;
  }, [commands]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100
      dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600
              bg-clip-text text-transparent flex items-center gap-3">
              <Activity className="w-7 h-7 text-blue-600" />
              Command Monitor
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              Live view of all ADMS commands — refreshes every 5s
            </p>
          </div>
          <button onClick={() => mutate()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600
              rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-sm">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
              className={`rounded-xl border p-4 text-center transition-all ${
                statusFilter === key
                  ? 'ring-2 ring-blue-500 border-blue-400'
                  : 'border-gray-200 dark:border-gray-700'
              } bg-white dark:bg-slate-800`}
            >
              <div className={`inline-flex items-center gap-1.5 ${cfg.color}`}>
                {cfg.icon}
                <span className="text-xs font-medium uppercase">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{stats[key as keyof typeof stats]}</p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter className="w-4 h-4" />
            <span>Filters:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Device SN..."
            value={deviceFilter}
            onChange={(e) => { setDeviceFilter(e.target.value); setPage(1); }}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-sm font-mono w-48"
          />
          {(statusFilter || deviceFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setDeviceFilter(''); setPage(1); }}
              className="text-xs text-red-500 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Commands table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {isLoading && commands.length === 0 ? (
            <div className="text-center py-16">
              <Loader className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
              <p className="text-gray-500 mt-3 text-sm">Loading commands...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-red-600 mt-3">Failed to load commands</p>
            </div>
          ) : commands.length === 0 ? (
            <div className="text-center py-16">
              <Activity className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-gray-500 mt-3">No commands found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-700 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Command</th>
                    <th className="px-4 py-3 text-left">Device</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-left">Sent</th>
                    <th className="px-4 py-3 text-left">ACK</th>
                    <th className="px-4 py-3 text-left">Retries</th>
                    <th className="px-4 py-3 text-left">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {commands.map((cmd: any) => {
                    const cfg = STATUS_CONFIG[cmd.status] || STATUS_CONFIG.expired;
                    return (
                      <tr key={cmd.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.color}`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs max-w-xs" title={cmd.command}>
                          {truncateCommand(cmd.command)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs">
                            <span className="font-mono">{cmd.device_sn}</span>
                            {cmd.device_name && (
                              <span className="text-gray-400 ml-1">({cmd.device_name})</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {cmd.created_at ? timeAgo(cmd.created_at) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {cmd.sent_at ? timeAgo(cmd.sent_at) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {cmd.ack_at ? timeAgo(cmd.ack_at) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-center">
                          <span className={cmd.retry_count >= cmd.max_retries ? 'text-red-600 font-bold' : 'text-gray-500'}>
                            {cmd.retry_count}/{cmd.max_retries}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-red-500 max-w-[200px] truncate" title={cmd.error_message || ''}>
                          {cmd.error_message || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-gray-500">
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{page}</span>
              <button
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page >= pagination.totalPages}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700"
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
