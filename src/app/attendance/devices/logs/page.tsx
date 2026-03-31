"use client";

import React, { useState } from 'react';
import {
  FileSearch, Filter, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Fingerprint, Download,
} from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const verifyLabel = (v: number | null) => {
  const map: Record<number, string> = { 0: 'Password', 1: 'Fingerprint', 2: 'Card', 15: 'Face' };
  return v != null ? map[v] ?? `Type ${v}` : '—';
};
const ioLabel = (m: number | null) => {
  const map: Record<number, string> = { 0: 'Check-in', 1: 'Check-out', 2: 'Break Out', 3: 'Break In' };
  return m != null ? map[m] ?? `Mode ${m}` : '—';
};

export default function DeviceLogsPage() {
  const today = new Date().toISOString().split('T')[0];
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [deviceSn, setDeviceSn] = useState('');
  const [matchedFilter, setMatchedFilter] = useState('');
  const [userType, setUserType] = useState('');
  const [search, setSearch] = useState('');

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '50');
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);
  if (deviceSn) params.set('device_sn', deviceSn);
  if (matchedFilter) params.set('matched', matchedFilter);
  if (userType) params.set('user_type', userType);
  if (search) params.set('search', search);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/zk/logs?${params.toString()}`,
    fetcher,
    { refreshInterval: 30000 },
  );

  // Fetch devices for filter dropdown — uses the unified devices API
  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher);
  const devices = devicesData?.data || [];

  const logs = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const handleExport = () => {
    const csvRows = [
      'Device SN,User ID,Student ID,Staff ID,Check Time,Verify,IO Mode,Matched',
      ...logs.map((l: any) =>
        [l.device_sn, l.device_user_id, l.student_id ?? '', l.staff_id ?? '',
         l.check_time, verifyLabel(l.verify_type), ioLabel(l.io_mode), l.matched ? 'Yes' : 'No'].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csvRows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `device-logs-${dateFrom}-${dateTo}.csv`;
    a.click();
    toast.success('Exported CSV');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <FileSearch className="w-7 h-7" />
            Device Logs
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            Attendance punches from biometric devices &bull; {pagination.total} records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => mutate()} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
          <Filter className="w-4 h-4" /> Filters
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
          <select value={deviceSn} onChange={e => { setDeviceSn(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
            <option value="">All Devices</option>
            {devices.map((d: any) => <option key={d.sn} value={d.sn}>{d.device_name || d.sn}</option>)}
          </select>
          <select value={matchedFilter} onChange={e => { setMatchedFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
            <option value="">All</option>
            <option value="1">Matched</option>
            <option value="0">Unmatched</option>
          </select>
          <select value={userType} onChange={e => { setUserType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white">
            <option value="">All Types</option>
            <option value="student">Students</option>
            <option value="staff">Staff</option>
          </select>
          <input type="text" placeholder="Search User ID…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 dark:text-gray-400 mt-3 text-sm">Loading logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <FileSearch className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto" />
            <p className="text-gray-500 dark:text-gray-400 mt-3">No logs found for selected filters</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verify</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IO Mode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Matched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 text-sm">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{log.device_name || log.device_sn}</div>
                    {log.device_location && <div className="text-xs text-gray-400">{log.device_location}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Fingerprint className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-mono">{log.device_user_id}</span>
                    </div>
                    {log.student_id && <div className="text-xs text-blue-500">Student #{log.student_id}</div>}
                    {log.staff_id && <div className="text-xs text-purple-500">Staff #{log.staff_id}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {new Date(log.check_time).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{verifyLabel(log.verify_type)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ioLabel(log.io_mode)}</td>
                  <td className="px-4 py-3">
                    {log.matched ? (
                      <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle className="w-4 h-4" /> Yes</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-500"><XCircle className="w-4 h-4" /> No</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
