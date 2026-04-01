"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  Radio, RefreshCw, ChevronLeft, ChevronRight, Wifi, WifiOff,
  Heart, Fingerprint, Send, AlertTriangle, X, Trash2, Eye, Zap,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const EVENT_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  HEARTBEAT:    { bg: 'bg-green-50 dark:bg-green-900/10',  text: 'text-green-700 dark:text-green-400',  icon: <Heart className="w-3.5 h-3.5" /> },
  PUNCH:        { bg: 'bg-blue-50 dark:bg-blue-900/10',    text: 'text-blue-700 dark:text-blue-400',    icon: <Fingerprint className="w-3.5 h-3.5" /> },
  COMMAND_SENT: { bg: 'bg-purple-50 dark:bg-purple-900/10', text: 'text-purple-700 dark:text-purple-400', icon: <Send className="w-3.5 h-3.5" /> },
  COMMAND_ACK:  { bg: 'bg-indigo-50 dark:bg-indigo-900/10', text: 'text-indigo-700 dark:text-indigo-400', icon: <Zap className="w-3.5 h-3.5" /> },
  USERINFO:     { bg: 'bg-cyan-50 dark:bg-cyan-900/10',    text: 'text-cyan-700 dark:text-cyan-400',    icon: <Wifi className="w-3.5 h-3.5" /> },
  ERROR:        { bg: 'bg-red-50 dark:bg-red-900/10',      text: 'text-red-700 dark:text-red-400',      icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  SYSTEM:       { bg: 'bg-gray-50 dark:bg-gray-800',       text: 'text-gray-600 dark:text-gray-400',    icon: <Radio className="w-3.5 h-3.5" /> },
};

const FILTER_BUTTONS = [
  { key: '',             label: 'All' },
  { key: 'HEARTBEAT',    label: 'Heartbeats' },
  { key: 'PUNCH',        label: 'Punches' },
  { key: 'COMMAND_SENT', label: 'Commands' },
  { key: 'ERROR',        label: 'Errors' },
];

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function SystemLogsPage() {
  const [eventFilter, setEventFilter] = useState('');
  const [deviceSn, setDeviceSn] = useState('');
  const [live, setLive] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '100');
  if (eventFilter) params.set('event_type', eventFilter);
  if (deviceSn) params.set('device_sn', deviceSn);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/system-logs?${params.toString()}`,
    fetcher,
    { refreshInterval: live ? 5000 : 0, revalidateOnFocus: live },
  );

  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher, { refreshInterval: 30000 });
  const devices = devicesData?.data || [];
  const logs = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const offlineDevices: any[] = data?.offline_devices || [];

  const handleCleanup = async () => {
    if (!await confirmAction('Clean up old logs?', 'Delete heartbeat logs older than 7 days?', 'Delete')) return;
    try {
      await apiFetch('/api/attendance/system-logs', {
        method: 'DELETE',
        successMessage: 'Old logs cleaned up',
      });
      mutate();
    } catch (err: any) {
      // apiFetch already showed error toast
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Radio className="w-7 h-7 text-blue-500" />
            System Logs
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            Live event stream from ZKTeco ADMS &bull; {pagination.total ?? logs.length} events
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Live toggle */}
          <button
            onClick={() => setLive(l => !l)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              live
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {live && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            )}
            {live ? 'LIVE' : 'Paused'}
          </button>
          <button onClick={() => mutate()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={handleCleanup}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30">
            <Trash2 className="w-4 h-4" /> Cleanup
          </button>
        </div>
      </div>

      {/* Offline device warnings */}
      {offlineDevices.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium text-sm mb-2">
            <WifiOff className="w-4 h-4" />
            {offlineDevices.length} Device{offlineDevices.length > 1 ? 's' : ''} Offline
          </div>
          <div className="flex flex-wrap gap-2">
            {offlineDevices.map((d: any) => (
              <span key={d.sn} className="inline-flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 px-2 py-1 rounded-full">
                <WifiOff className="w-3 h-3" />
                {d.device_name || d.sn}
                <span className="text-red-400">({timeAgo(d.last_seen)})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Event type filter pills */}
        <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
          {FILTER_BUTTONS.map(btn => (
            <button
              key={btn.key}
              onClick={() => { setEventFilter(btn.key); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                eventFilter === btn.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Device filter */}
        <select
          value={deviceSn}
          onChange={e => { setDeviceSn(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
        >
          <option value="">All Devices</option>
          {devices.map((d: any) => (
            <option key={d.sn} value={d.sn}>{d.device_name || d.sn}</option>
          ))}
        </select>
      </div>

      {/* Log Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 mt-2 text-sm">Loading logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Radio className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No system logs yet</p>
            <p className="text-sm mt-1">Logs will appear here when the K40 sends its first heartbeat</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log: any) => {
                  const style = EVENT_COLORS[log.event_type] || EVENT_COLORS.SYSTEM;
                  return (
                    <tr key={log.id} className={`${style.bg} hover:opacity-80 transition-opacity`}>
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">{log.id}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${style.text}`}>
                          {style.icon}
                          {log.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {log.device_name || log.device_sn || '—'}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className={log.direction === 'OUTGOING'
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-gray-500'}>
                          {log.direction === 'OUTGOING' ? '↑ OUT' : '↓ IN'}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500">{log.ip_address || '—'}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap" title={new Date(log.created_at).toLocaleString()}>
                        {timeAgo(log.created_at)}
                      </td>
                      <td className="px-4 py-2">
                        {log.raw_data && (
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} &bull; {pagination.total} total
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages}
              className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Raw Data Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden m-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Raw Data — Log #{selectedLog.id}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedLog.event_type} &bull; {selectedLog.device_sn || 'no device'} &bull; {new Date(selectedLog.created_at).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedLog.raw_data), null, 2);
                  } catch {
                    return selectedLog.raw_data;
                  }
                })()}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
