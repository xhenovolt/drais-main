"use client";

import React, { useState } from 'react';
import {
  FileSearch, Filter, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, Fingerprint, Download,
} from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';

const verifyLabel = (v: number | null) => {
  const map: Record<number, string> = { 0: 'Password', 1: 'Fingerprint', 2: 'Card', 15: 'Face' };
  return v != null ? map[v] ?? `Type ${v}` : '—';
};
const ioLabel = (m: number | null) => {
  const map: Record<number, string> = { 0: 'Check-in', 1: 'Check-out', 2: 'Break Out', 3: 'Break In' };
  return m != null ? map[m] ?? `Mode ${m}` : '—';
};

export default function ZKLogsPage() {
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

  // Fetch devices for filter dropdown
  const { data: devicesData } = useSWR<any>('/api/attendance/zk/devices', fetcher);
  const devices = devicesData?.data || [];

  const logs = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const handleExport = () => {
    const csvRows = [
      ['ID', 'Time', 'Device', 'User ID', 'Verify', 'Direction', 'Matched', 'Student ID', 'Staff ID'].join(','),
      ...logs.map((l: any) =>
        [l.id, l.check_time, l.device_sn, l.device_user_id, verifyLabel(l.verify_type), ioLabel(l.io_mode), l.matched ? 'Yes' : 'No', l.student_id || '', l.staff_id || ''].join(',')
      ),
    ].join('\n');
    const blob = new Blob([csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zk-logs-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <FileSearch className="w-7 h-7 text-blue-500" />
            ZK Attendance Logs
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {pagination.total} records found
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => mutate()} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-slate-700" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-slate-700" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Device</label>
            <select value={deviceSn} onChange={(e) => { setDeviceSn(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-slate-700">
              <option value="">All Devices</option>
              {devices.map((d: any) => (
                <option key={d.serial_number} value={d.serial_number}>{d.device_name || d.serial_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Matched</label>
            <select value={matchedFilter} onChange={(e) => { setMatchedFilter(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-slate-700">
              <option value="">All</option>
              <option value="1">Matched</option>
              <option value="0">Unmatched</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">User Type</label>
            <select value={userType} onChange={(e) => { setUserType(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-slate-700">
              <option value="">All</option>
              <option value="student">Students</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Search User ID</label>
            <input type="text" placeholder="e.g. 101" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-slate-700" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="text-left py-3 px-4">Time</th>
                <th className="text-left py-3 px-4">Device</th>
                <th className="text-left py-3 px-4">User ID</th>
                <th className="text-left py-3 px-4">Verify</th>
                <th className="text-left py-3 px-4">Direction</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Linked</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-500 py-12">No logs found</td></tr>
              ) : (
                logs.map((l: any) => (
                  <tr key={l.id} className="border-t dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                    <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">
                      {l.check_time ? new Date(l.check_time).toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-medium">{l.device_name || l.device_sn}</span>
                      {l.device_location && <span className="text-gray-400 text-xs ml-1">({l.device_location})</span>}
                    </td>
                    <td className="py-2.5 px-4 font-mono">{l.device_user_id}</td>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center gap-1">
                        {Number(l.verify_type) === 1 && <Fingerprint className="w-3 h-3 text-blue-500" />}
                        {verifyLabel(l.verify_type)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                        Number(l.io_mode) === 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                      }`}>
                        {Number(l.io_mode) === 0 ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {ioLabel(l.io_mode)}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {l.matched ? (
                        <span className="text-green-600 font-medium text-xs">Matched</span>
                      ) : (
                        <span className="text-red-500 font-medium text-xs">Unmatched</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-gray-500">
                      {l.student_id ? `Student #${l.student_id}` : l.staff_id ? `Staff #${l.staff_id}` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-700">
            <p className="text-xs text-gray-500">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-slate-700"
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
