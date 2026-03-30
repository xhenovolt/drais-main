"use client";

import React, { useState } from 'react';
import {
  Activity, Server, Radio, AlertTriangle, Clock, Users, Fingerprint,
  CheckCircle, XCircle, ArrowUpDown, RefreshCw, Wifi, WifiOff,
  ChevronRight, Zap, BarChart3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { fetcher } from '@/utils/fetcher';

const verifyLabel = (v: number | null) => {
  const map: Record<number, string> = { 0: 'Password', 1: 'Fingerprint', 2: 'Card', 15: 'Face' };
  return v != null ? map[v] ?? `Type ${v}` : '—';
};
const ioLabel = (m: number | null) => {
  const map: Record<number, string> = { 0: 'Check-in', 1: 'Check-out', 2: 'Break Out', 3: 'Break In' };
  return m != null ? map[m] ?? `Mode ${m}` : '—';
};

export default function ZKDashboardPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const { data, mutate, isLoading } = useSWR<any>(
    `/api/attendance/zk/dashboard?date=${date}`,
    fetcher,
    { refreshInterval: 15000 },
  );

  const d = data?.data;
  const devices = d?.devices || {};
  const punches = d?.punches || {};
  const commands = d?.commands || {};
  const hourly = d?.hourly || [];
  const recentPunches = d?.recentPunches || [];
  const deviceList = d?.deviceList || [];

  const handleRefresh = async () => {
    await mutate();
    toast.success('Dashboard refreshed');
  };

  const maxHourlyPunches = Math.max(1, ...hourly.map((h: any) => Number(h.punches) || 0));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Zap className="w-8 h-8 text-yellow-500" />
            ZK Device Intelligence
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Real-time biometric device monitoring & attendance feed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-sm"
          />
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Server className="w-6 h-6" />}
          label="Total Devices"
          value={Number(devices.total_devices || 0)}
          color="blue"
        />
        <StatCard
          icon={<Wifi className="w-6 h-6" />}
          label="Online"
          value={Number(devices.online_devices || 0)}
          color="green"
          sub={`${Number(devices.offline_devices || 0)} offline`}
        />
        <StatCard
          icon={<Fingerprint className="w-6 h-6" />}
          label="Today's Punches"
          value={Number(punches.total_punches || 0)}
          color="purple"
          sub={`${Number(punches.unique_users || 0)} unique users`}
        />
        <StatCard
          icon={<AlertTriangle className="w-6 h-6" />}
          label="Unmatched"
          value={Number(punches.unmatched_punches || 0)}
          color={Number(punches.unmatched_punches || 0) > 0 ? 'red' : 'green'}
          sub={Number(commands.total_pending || 0) > 0 ? `${commands.total_pending} cmds pending` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Hourly Chart */}
        <div className="xl:col-span-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            Hourly Punch Distribution
          </h2>
          {hourly.length === 0 ? (
            <div className="text-center text-gray-500 py-12">No data for this date</div>
          ) : (
            <div className="flex items-end gap-1 h-48">
              {Array.from({ length: 24 }, (_, h) => {
                const entry = hourly.find((e: any) => Number(e.hour) === h);
                const count = entry ? Number(entry.punches) : 0;
                const pct = (count / maxHourlyPunches) * 100;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1" title={`${h}:00 — ${count} punches`}>
                    <span className="text-[10px] text-gray-500">{count > 0 ? count : ''}</span>
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-blue-500 to-blue-400 min-h-[2px] transition-all"
                      style={{ height: `${Math.max(2, pct)}%` }}
                    />
                    <span className="text-[10px] text-gray-400">{h}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Device Status Panel */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Radio className="w-5 h-5 text-green-500" />
              Device Status
            </h2>
            <Link href="/attendance/zk/devices" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3 max-h-[250px] overflow-y-auto">
            {deviceList.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No devices registered</p>
            ) : (
              deviceList.map((dev: any) => (
                <div key={dev.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      dev.connection_status === 'online' ? 'bg-green-500 animate-pulse' :
                      dev.connection_status === 'delayed' ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                    <div>
                      <p className="text-sm font-medium">{dev.device_name || dev.serial_number}</p>
                      <p className="text-xs text-gray-500">{dev.location || dev.ip_address || '—'}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    dev.connection_status === 'online' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    dev.connection_status === 'delayed' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {dev.connection_status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Live Feed */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-500" />
            Live Attendance Feed
            <span className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </h2>
          <Link href="/attendance/zk/logs" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            All logs <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 border-b dark:border-gray-700">
              <tr>
                <th className="text-left py-2 px-3">Time</th>
                <th className="text-left py-2 px-3">Device</th>
                <th className="text-left py-2 px-3">User ID</th>
                <th className="text-left py-2 px-3">Verify</th>
                <th className="text-left py-2 px-3">Direction</th>
                <th className="text-left py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {recentPunches.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-500 py-8">No recent punches</td></tr>
                ) : (
                  recentPunches.map((p: any) => (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="border-b dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30"
                    >
                      <td className="py-2 px-3 font-mono text-xs">
                        {p.check_time ? new Date(p.check_time).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-medium">{p.device_name || p.device_sn}</span>
                        {p.location && <span className="text-gray-400 ml-1 text-xs">({p.location})</span>}
                      </td>
                      <td className="py-2 px-3 font-mono">{p.device_user_id}</td>
                      <td className="py-2 px-3">{verifyLabel(p.verify_type)}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          Number(p.io_mode) === 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                        }`}>
                          {Number(p.io_mode) === 0 ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {ioLabel(p.io_mode)}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {p.matched ? (
                          <span className="text-green-600 text-xs font-medium">Matched</span>
                        ) : (
                          <span className="text-red-500 text-xs font-medium">Unmatched</span>
                        )}
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/attendance/zk/commands" className="block p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ArrowUpDown className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold group-hover:text-blue-600 transition">Command Center</p>
              <p className="text-xs text-gray-500">Send commands to devices</p>
            </div>
          </div>
        </Link>
        <Link href="/attendance/zk/students" className="block p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-semibold group-hover:text-purple-600 transition">Student Mapping</p>
              <p className="text-xs text-gray-500">Link device IDs to students</p>
            </div>
          </div>
        </Link>
        <Link href="/attendance/zk/reports" className="block p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold group-hover:text-green-600 transition">Reports</p>
              <p className="text-xs text-gray-500">Daily & device analytics</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: number; color: string; sub?: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color] || colors.blue}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
          {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </motion.div>
  );
}
