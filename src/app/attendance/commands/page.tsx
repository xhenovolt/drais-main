"use client";

import React, { useState } from 'react';
import {
  ArrowUpDown, Send, Trash2, Clock, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, ChevronLeft, ChevronRight, Plus, Loader,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const COMMON_COMMANDS = [
  { label: 'Restart Device', command: 'REBOOT', desc: 'Restart the device immediately' },
  { label: 'Clear Logs', command: 'CLEAR LOG', desc: 'Clear attendance logs on device' },
  { label: 'Sync Time', command: 'SET OPTION ServerTimeSync=1', desc: 'Force time sync with server' },
  { label: 'Get Info', command: 'INFO', desc: 'Request device information' },
  { label: 'View Members', command: 'DATA QUERY USERINFO', desc: 'Request enrolled user list from device' },
  { label: 'Clear Data', command: 'CLEAR DATA', desc: 'Clear all user data on device' },
  { label: 'Check Status', command: 'CHECK', desc: 'Ping the device' },
];

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  acknowledged: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function DeviceCommandsPage() {
  const [page, setPage] = useState(1);
  const [filterDevice, setFilterDevice] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCommand, setNewCommand] = useState({ device_sn: '', command: '', priority: 0, expires_in_hours: 24 });
  const [sending, setSending] = useState(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '30');
  if (filterDevice) params.set('device_sn', filterDevice);
  if (filterStatus) params.set('status', filterStatus);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/zk/commands?${params.toString()}`,
    fetcher,
    { refreshInterval: 10000 },
  );

  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher);

  const commands = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };
  const devices = devicesData?.data || [];

  const sendCommand = async () => {
    if (!newCommand.device_sn || !newCommand.command) {
      showToast('error', 'Device and command are required');
      return;
    }
    setSending(true);
    try {
      await apiFetch<{ id: number }>('/api/attendance/zk/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCommand),
        successMessage: 'Command queued',
      });
      setShowNewForm(false);
      setNewCommand({ device_sn: '', command: '', priority: 0, expires_in_hours: 24 });
      mutate();
    } catch {
      // apiFetch already showed error toast
    } finally {
      setSending(false);
    }
  };

  const cancelCommand = async (id: number) => {
    try {
      await apiFetch(`/api/attendance/zk/commands?id=${id}`, {
        method: 'DELETE',
        successMessage: 'Command cancelled',
      });
      mutate();
    } catch {
      // apiFetch already showed error toast
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <ArrowUpDown className="w-7 h-7 text-blue-500" />
            Command Center
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Queue and monitor device commands
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNewForm(!showNewForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="w-4 h-4" /> New Command
          </button>
          <button onClick={() => mutate()} className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* New Command Form */}
      {showNewForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-500" /> Queue New Command
          </h3>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-2">Quick Commands</label>
            <div className="flex flex-wrap gap-2">
              {COMMON_COMMANDS.map((c) => (
                <button key={c.command}
                  onClick={() => setNewCommand(p => ({ ...p, command: c.command }))}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                    newCommand.command === c.command
                      ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  title={c.desc}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Device *</label>
              <select value={newCommand.device_sn} onChange={(e) => setNewCommand(p => ({ ...p, device_sn: e.target.value }))}
                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700">
                <option value="">Select device...</option>
                {devices.map((d: any) => (
                  <option key={d.sn} value={d.sn}>{d.device_name || d.sn}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Command *</label>
              <input type="text" value={newCommand.command}
                onChange={(e) => setNewCommand(p => ({ ...p, command: e.target.value }))}
                placeholder="e.g. DATA UPDATE USERINFO PIN=1\tName=John"
                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 font-mono" />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Priority</label>
                <input type="number" value={newCommand.priority}
                  onChange={(e) => setNewCommand(p => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                  className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700" />
              </div>
              <button onClick={sendCommand} disabled={sending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2">
                {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Queue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select value={filterDevice} onChange={(e) => { setFilterDevice(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800">
          <option value="">All Devices</option>
          {devices.map((d: any) => (
            <option key={d.sn} value={d.sn}>{d.device_name || d.sn}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="failed">Failed</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {/* Commands Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300">
            <tr>
              <th className="text-left py-3 px-4">ID</th>
              <th className="text-left py-3 px-4">Device</th>
              <th className="text-left py-3 px-4">Command</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Priority</th>
              <th className="text-left py-3 px-4">Created</th>
              <th className="text-left py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {commands.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-gray-500 py-12">No commands found</td></tr>
            ) : (
              commands.map((c: any) => (
                <tr key={c.id} className="border-t dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-2.5 px-4 font-mono text-xs">#{c.id}</td>
                  <td className="py-2.5 px-4 font-medium">{c.device_name || c.device_sn}</td>
                  <td className="py-2.5 px-4 font-mono text-xs max-w-[300px] truncate" title={c.command}>{c.command}</td>
                  <td className="py-2.5 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[c.status] || statusColors.expired}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-center">{c.priority}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-500 whitespace-nowrap">
                    {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    {c.status === 'pending' && (
                      <button onClick={() => cancelCommand(c.id)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600"
                        title="Cancel">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {c.status === 'failed' && c.error_message && (
                      <span className="text-xs text-red-500" title={c.error_message}>
                        <AlertTriangle className="w-3.5 h-3.5 inline" />
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </p>
          <div className="flex items-center gap-2">
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
    </div>
  );
}
