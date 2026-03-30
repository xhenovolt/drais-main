"use client";

import React, { useState } from 'react';
import {
  BarChart3, Download, RefreshCw, Filter, Server, Users, Calendar,
} from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';

type ReportType = 'daily' | 'user' | 'device';

export default function ZKReportsPage() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const [reportType, setReportType] = useState<ReportType>('daily');
  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [deviceSn, setDeviceSn] = useState('');

  const params = new URLSearchParams();
  params.set('type', reportType);
  params.set('date_from', dateFrom);
  params.set('date_to', dateTo);
  if (deviceSn) params.set('device_sn', deviceSn);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/zk/reports?${params.toString()}`,
    fetcher,
  );
  const { data: devicesData } = useSWR<any>('/api/attendance/zk/devices', fetcher);

  const rows = data?.data || [];
  const devices = devicesData?.data || [];

  const handleExport = () => {
    if (rows.length === 0) {
      toast.error('No data to export');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csvRows = [
      headers.join(','),
      ...rows.map((r: any) => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
    ].join('\n');
    const blob = new Blob([csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zk-report-${reportType}-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  const reportTabs: { key: ReportType; label: string; icon: React.ReactNode }[] = [
    { key: 'daily', label: 'Daily Summary', icon: <Calendar className="w-4 h-4" /> },
    { key: 'user', label: 'User Summary', icon: <Users className="w-4 h-4" /> },
    { key: 'device', label: 'Device Health', icon: <Server className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-green-500" />
            ZK Attendance Reports
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Analyze attendance data from biometric devices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => mutate()} className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Generate
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2">
        {reportTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setReportType(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              reportType === tab.key
                ? 'bg-green-600 text-white'
                : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      {reportType !== 'device' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Filters</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700" />
            </div>
            {reportType === 'daily' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Device</label>
                <select value={deviceSn} onChange={(e) => setDeviceSn(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700">
                  <option value="">All Devices</option>
                  {devices.map((d: any) => (
                    <option key={d.serial_number} value={d.serial_number}>{d.device_name || d.serial_number}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading report...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No data for the selected criteria</div>
        ) : reportType === 'daily' ? (
          <DailyReport rows={rows} />
        ) : reportType === 'user' ? (
          <UserReport rows={rows} />
        ) : (
          <DeviceReport rows={rows} />
        )}
      </div>
    </div>
  );
}

function DailyReport({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-300">
          <tr>
            <th className="text-left py-3 px-4">Date</th>
            <th className="text-left py-3 px-4">Device</th>
            <th className="text-right py-3 px-4">Total</th>
            <th className="text-right py-3 px-4">Unique Users</th>
            <th className="text-right py-3 px-4">Matched</th>
            <th className="text-right py-3 px-4">Unmatched</th>
            <th className="text-right py-3 px-4">Check-ins</th>
            <th className="text-right py-3 px-4">Check-outs</th>
            <th className="text-left py-3 px-4">First</th>
            <th className="text-left py-3 px-4">Last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
              <td className="py-2.5 px-4 font-medium">{r.date}</td>
              <td className="py-2.5 px-4">{r.device_name || r.device_sn}</td>
              <td className="py-2.5 px-4 text-right font-mono">{r.total_punches}</td>
              <td className="py-2.5 px-4 text-right font-mono">{r.unique_users}</td>
              <td className="py-2.5 px-4 text-right">
                <span className="text-green-600 font-medium">{r.matched}</span>
              </td>
              <td className="py-2.5 px-4 text-right">
                {Number(r.unmatched) > 0 ? (
                  <span className="text-red-500 font-medium">{r.unmatched}</span>
                ) : (
                  <span className="text-gray-400">0</span>
                )}
              </td>
              <td className="py-2.5 px-4 text-right font-mono">{r.check_ins}</td>
              <td className="py-2.5 px-4 text-right font-mono">{r.check_outs}</td>
              <td className="py-2.5 px-4 text-xs text-gray-500">
                {r.first_punch ? new Date(r.first_punch).toLocaleTimeString() : '—'}
              </td>
              <td className="py-2.5 px-4 text-xs text-gray-500">
                {r.last_punch ? new Date(r.last_punch).toLocaleTimeString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserReport({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-300">
          <tr>
            <th className="text-left py-3 px-4">Device User ID</th>
            <th className="text-left py-3 px-4">Type</th>
            <th className="text-left py-3 px-4">Linked</th>
            <th className="text-right py-3 px-4">Total Punches</th>
            <th className="text-right py-3 px-4">Days Present</th>
            <th className="text-left py-3 px-4">First Seen</th>
            <th className="text-left py-3 px-4">Last Seen</th>
            <th className="text-left py-3 px-4">Matched</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
              <td className="py-2.5 px-4 font-mono font-medium">{r.device_user_id}</td>
              <td className="py-2.5 px-4">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  r.user_type === 'student' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30' :
                  r.user_type === 'staff' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {r.user_type || 'unknown'}
                </span>
              </td>
              <td className="py-2.5 px-4 text-xs text-gray-500">
                {r.student_id ? `Student #${r.student_id}` : r.staff_id ? `Staff #${r.staff_id}` : '—'}
              </td>
              <td className="py-2.5 px-4 text-right font-mono">{r.total_punches}</td>
              <td className="py-2.5 px-4 text-right font-mono">{r.days_present}</td>
              <td className="py-2.5 px-4 text-xs text-gray-500">
                {r.first_seen ? new Date(r.first_seen).toLocaleString() : '—'}
              </td>
              <td className="py-2.5 px-4 text-xs text-gray-500">
                {r.last_seen ? new Date(r.last_seen).toLocaleString() : '—'}
              </td>
              <td className="py-2.5 px-4">
                {r.matched ? (
                  <span className="text-green-600 text-xs font-medium">Yes</span>
                ) : (
                  <span className="text-red-500 text-xs font-medium">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeviceReport({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-300">
          <tr>
            <th className="text-left py-3 px-4">Device</th>
            <th className="text-left py-3 px-4">Location</th>
            <th className="text-left py-3 px-4">Status</th>
            <th className="text-left py-3 px-4">Connection</th>
            <th className="text-right py-3 px-4">Today</th>
            <th className="text-right py-3 px-4">This Week</th>
            <th className="text-right py-3 px-4">Pending Cmds</th>
            <th className="text-right py-3 px-4">Failed Cmds</th>
            <th className="text-left py-3 px-4">Last Heartbeat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30">
              <td className="py-2.5 px-4">
                <p className="font-medium">{r.device_name || r.serial_number}</p>
                <p className="text-xs text-gray-500 font-mono">{r.serial_number}</p>
              </td>
              <td className="py-2.5 px-4 text-gray-500">{r.location || '—'}</td>
              <td className="py-2.5 px-4">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  r.status === 'active' ? 'bg-green-100 text-green-700' :
                  r.status === 'maintenance' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{r.status}</span>
              </td>
              <td className="py-2.5 px-4">
                <span className={`text-xs font-medium ${
                  r.connection_status === 'online' ? 'text-green-600' :
                  r.connection_status === 'delayed' ? 'text-yellow-600' : 'text-red-500'
                }`}>{r.connection_status}</span>
              </td>
              <td className="py-2.5 px-4 text-right font-mono">{r.punches_today}</td>
              <td className="py-2.5 px-4 text-right font-mono">{r.punches_week}</td>
              <td className="py-2.5 px-4 text-right">
                {Number(r.pending_commands) > 0 ? (
                  <span className="text-yellow-600 font-medium">{r.pending_commands}</span>
                ) : <span className="text-gray-400">0</span>}
              </td>
              <td className="py-2.5 px-4 text-right">
                {Number(r.failed_commands) > 0 ? (
                  <span className="text-red-500 font-medium">{r.failed_commands}</span>
                ) : <span className="text-gray-400">0</span>}
              </td>
              <td className="py-2.5 px-4 text-xs text-gray-500">
                {r.last_heartbeat ? new Date(r.last_heartbeat).toLocaleString() : 'Never'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
