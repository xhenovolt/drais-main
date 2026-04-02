"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
  UserCheck, Users, Briefcase, Fingerprint, Activity, Clock,
  Wifi, WifiOff, Server, AlertTriangle, TrendingUp, Radio,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import useSWR from 'swr';
import Link from 'next/link';

// ── Helpers ────────────────────────────────────────────────────────────────
const verifyLabel = (v: number | null) => {
  const map: Record<number, string> = { 0: 'Password', 1: 'Fingerprint', 2: 'Card', 15: 'Face' };
  return v != null ? map[v] ?? `Type ${v}` : '—';
};
const ioLabel = (m: number | null) => {
  const map: Record<number, string> = { 0: 'Check-in', 1: 'Check-out', 2: 'Break Out', 3: 'Break In' };
  return m != null ? map[m] ?? `Mode ${m}` : '—';
};

// ── Live SSE Hook ──────────────────────────────────────────────────────────
function useLiveFeed() {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/attendance/stream');
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents((prev) => [data, ...prev].slice(0, 30));
      } catch { /* ignore */ }
    };
    es.onerror = () => setConnected(false);
    return () => { es.close(); esRef.current = null; };
  }, []);

  return { events, connected };
}

// ── Dashboard Page ─────────────────────────────────────────────────────────
export default function AttendanceDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [liveFeedOpen, setLiveFeedOpen] = useState(true);

  const { data, isLoading } = useSWR<any>(
    `/api/attendance/zk/dashboard?date=${date}`,
    { refreshInterval: 15000 },
  );

  const { events: liveEvents, connected: sseConnected } = useLiveFeed();

  const dashboard = data?.data || {};
  const deviceStats = dashboard.devices || {};
  const studentStats = dashboard.students || {};
  const staffStats = dashboard.staff || {};
  const punchStats = dashboard.punches || {};
  const commandStats = dashboard.commands || {};
  const hourly = dashboard.hourly || [];
  const recentPunches = dashboard.recentPunches || [];
  const deviceList = dashboard.deviceList || [];

  const totalPunches = Number(punchStats.total_punches || 0);
  const matchedPunches = Number(punchStats.matched_punches || 0);
  const unmatchedPunches = Number(punchStats.unmatched_punches || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100
      dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8 space-y-6">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600
              bg-clip-text text-transparent flex items-center gap-3">
              <Fingerprint className="w-8 h-8 text-blue-600" />
              Attendance Dashboard
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              Real-time biometric data — single source of truth
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                bg-white dark:bg-slate-800 text-sm"
            />
          </div>
        </div>

        {/* ── Metric Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Students */}
          <MetricCard
            label="Total Learners"
            value={studentStats.total ?? '—'}
            icon={<Users className="w-5 h-5 text-blue-600" />}
            color="blue"
          />
          {/* Present Today */}
          <MetricCard
            label="Learners Present"
            value={studentStats.present ?? 0}
            sub={studentStats.rate != null ? `${studentStats.rate}%` : totalPunches === 0 ? 'No data yet' : null}
            icon={<UserCheck className="w-5 h-5 text-green-600" />}
            color="green"
          />
          {/* Staff Present */}
          <MetricCard
            label="Staff Present"
            value={staffStats.present ?? 0}
            sub={staffStats.rate != null ? `${staffStats.rate}%` : null}
            icon={<Briefcase className="w-5 h-5 text-purple-600" />}
            color="purple"
          />
          {/* Total Punches */}
          <MetricCard
            label="Total Punches"
            value={totalPunches}
            sub={`${matchedPunches} matched`}
            icon={<Activity className="w-5 h-5 text-indigo-600" />}
            color="indigo"
          />
          {/* Unmatched */}
          <MetricCard
            label="Unmatched"
            value={unmatchedPunches}
            sub={unmatchedPunches > 0 ? 'Needs mapping' : null}
            icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
            color="amber"
            alert={unmatchedPunches > 0}
          />
        </div>

        {/* ── Device Status Bar ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200
            dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Devices</h3>
              <Link href="/attendance/devices" className="text-xs text-blue-600 hover:underline">
                Manage &rarr;
              </Link>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-lg font-bold text-green-600">
                  {Number(deviceStats.online_devices || 0)}
                </span>
                <span className="text-xs text-gray-400">Online</span>
              </div>
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-red-400" />
                <span className="text-lg font-bold text-red-500">
                  {Number(deviceStats.offline_devices || 0)}
                </span>
                <span className="text-xs text-gray-400">Offline</span>
              </div>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-gray-400" />
                <span className="text-lg font-bold text-gray-600 dark:text-gray-300">
                  {Number(deviceStats.total_devices || 0)}
                </span>
                <span className="text-xs text-gray-400">Total</span>
              </div>
            </div>
          </div>

          {/* Commands Status */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200
            dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Commands</h3>
              <Link href="/attendance/commands" className="text-xs text-blue-600 hover:underline">
                View &rarr;
              </Link>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <span className="text-lg font-bold text-yellow-600">
                  {Number(commandStats.total_pending || 0)}
                </span>
                <span className="text-xs text-gray-400 ml-1">Pending</span>
              </div>
              <div>
                <span className="text-lg font-bold text-red-500">
                  {Number(commandStats.failed || 0)}
                </span>
                <span className="text-xs text-gray-400 ml-1">Failed</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200
            dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Quick Links</h3>
            <div className="flex flex-wrap gap-2">
              <Link href="/attendance/logs" className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700
                dark:text-blue-300 rounded-lg text-xs font-medium hover:bg-blue-100">
                Attendance Logs
              </Link>
              <Link href="/attendance/mapping" className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700
                dark:text-purple-300 rounded-lg text-xs font-medium hover:bg-purple-100">
                User Mapping
              </Link>
              <Link href="/attendance/device-logs" className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-gray-700
                dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100">
                Raw Pipeline
              </Link>
            </div>
          </div>
        </div>

        {/* ── Hourly Chart ─────────────────────────────────────── */}
        {hourly.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200
            dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Hourly Breakdown
            </h3>
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 24 }, (_, h) => {
                const entry = hourly.find((e: any) => Number(e.hour) === h);
                const punches = entry ? Number(entry.punches) : 0;
                const maxPunches = Math.max(...hourly.map((e: any) => Number(e.punches)), 1);
                const height = punches > 0 ? Math.max((punches / maxPunches) * 100, 4) : 0;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1">
                    {punches > 0 && (
                      <span className="text-[9px] text-gray-400">{punches}</span>
                    )}
                    <div
                      className={`w-full rounded-t transition-all ${
                        punches > 0 ? 'bg-blue-500 dark:bg-blue-400' : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                      style={{ height: `${height}%`, minHeight: punches > 0 ? '4px' : '2px' }}
                    />
                    {h % 3 === 0 && (
                      <span className="text-[9px] text-gray-400">{h}:00</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Live Feed ────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200
          dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setLiveFeedOpen(!liveFeedOpen)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50
              dark:hover:bg-slate-700/50"
          >
            <div className="flex items-center gap-2">
              <Radio className={`w-4 h-4 ${sseConnected ? 'text-green-500 animate-pulse' : 'text-red-400'}`} />
              <span className="text-sm font-medium">Live Feed</span>
              <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-green-500' : 'bg-red-400'}`} />
              <span className="text-xs text-gray-400">{sseConnected ? 'Connected' : 'Reconnecting...'}</span>
            </div>
            {liveFeedOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {liveFeedOpen && (
            <div className="max-h-48 overflow-y-auto border-t border-gray-200 dark:border-gray-700
              divide-y divide-gray-100 dark:divide-gray-700">
              {liveEvents.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-gray-400">
                  Waiting for new attendance events...
                </p>
              )}
              {liveEvents.map((ev, i) => (
                <div key={`${ev.id}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-gray-500 text-xs whitespace-nowrap">
                    {ev.check_time ? new Date(ev.check_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                  </span>
                  {ev.person_name ? (
                    <span className="font-medium">{ev.person_name}</span>
                  ) : (
                    <span className="text-amber-600 font-mono text-xs">UID: {ev.device_user_id}</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-xs
                    ${ev.person_type === 'student' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : ev.person_type === 'staff' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'}`}>
                    {ev.person_type === 'student' ? 'Learner' : ev.person_type === 'staff' ? 'Staff' : 'Unmatched'}
                  </span>
                  {ev.device_name && <span className="text-xs text-gray-400 ml-auto">{ev.device_name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Punches ───────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200
          dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200
            dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Recent Punches (Last 20)
            </h3>
            <Link href="/attendance/logs" className="text-xs text-blue-600 hover:underline">
              View all &rarr;
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Person</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Device UID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Verify</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">IO</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {isLoading && recentPunches.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Loading...</td></tr>
                )}
                {!isLoading && recentPunches.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No attendance data yet. Punches will appear here when the device sends them.
                  </td></tr>
                )}
                {recentPunches.map((p: any) => {
                  const name = p.student_first_name
                    ? `${p.student_first_name} ${p.student_last_name || ''}`
                    : p.staff_first_name
                      ? `${p.staff_first_name} ${p.staff_last_name || ''}`
                      : null;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-2 text-sm whitespace-nowrap">
                        {p.check_time ? new Date(p.check_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {name ? (
                          <span className="font-medium">{name}</span>
                        ) : (
                          <span className="text-amber-600 font-mono text-xs">UID: {p.device_user_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-500">{p.device_user_id}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{verifyLabel(p.verify_type)}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          p.io_mode === 0
                            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                        }`}>
                          {ioLabel(p.io_mode)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {p.matched ? (
                          <span className="text-green-600 text-xs font-medium flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" /> Matched
                          </span>
                        ) : (
                          <span className="text-red-500 text-xs font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Unmatched
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Device List ──────────────────────────────────────── */}
        {deviceList.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200
            dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Registered Devices
              </h3>
              <Link href="/attendance/devices" className="text-xs text-blue-600 hover:underline">
                Manage &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {deviceList.map((d: any) => (
                <div
                  key={d.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    d.connection_status === 'online'
                      ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                      : 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10'
                  }`}
                >
                  {d.connection_status === 'online'
                    ? <Wifi className="w-4 h-4 text-green-500 shrink-0" />
                    : <WifiOff className="w-4 h-4 text-red-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {d.device_name || d.serial_number}
                    </p>
                    <p className="text-xs text-gray-400 font-mono truncate">{d.serial_number}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${
                    d.connection_status === 'online' ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {d.connection_status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Metric Card Component ──────────────────────────────────────────────────
function MetricCard({
  label, value, sub, icon, color, alert,
}: {
  label: string;
  value: number | string;
  sub?: string | null;
  icon: React.ReactNode;
  color: string;
  alert?: boolean;
}) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20',
    green: 'bg-green-50 dark:bg-green-900/20',
    purple: 'bg-purple-50 dark:bg-purple-900/20',
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20',
    amber: 'bg-amber-50 dark:bg-amber-900/20',
  };

  return (
    <div className={`rounded-xl border p-4 ${alert
      ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'
      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bgMap[color] || ''}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-0.5 ${alert ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-400'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
