'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Clock,
  Fingerprint,
  User,
  Users,
  Wifi,
  WifiOff,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  device_sn: string;
  biometric_id: string;
  student_id: number | null;
  staff_id: number | null;
  check_time: string;
  verify_type: number | null;
  io_mode: number | null;
  matched: boolean;
  created_at: string;
  resolved_name: string | null;
  role: 'student' | 'staff' | 'unknown';
  class_info: string | null;
  device: {
    model: string | null;
    last_seen: string | null;
    seconds_ago: number | null;
    is_active: boolean;
  };
}

interface LiveData {
  logs: LogEntry[];
  total_count: number;
  latest_id: number;
  devices: {
    total: number;
    online: number;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeAgo(seconds: number | null): string {
  if (seconds === null) return 'Never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function verifyLabel(v: number | null): string {
  const map: Record<number, string> = {
    0: 'Password',
    1: 'Fingerprint',
    2: 'Card',
    15: 'Face',
  };
  return v !== null && map[v] ? map[v] : 'Unknown';
}

function ioLabel(v: number | null): string {
  const map: Record<number, string> = {
    0: 'Check-In',
    1: 'Check-Out',
    2: 'Break-Out',
    3: 'Break-In',
    4: 'OT-In',
    5: 'OT-Out',
  };
  return v !== null && map[v] ? map[v] : '-';
}

// ─── Sub-components ────────────────────────────────────────────────────────

function DeviceStatusDot({ isActive }: { isActive: boolean }) {
  return (
    <span className="relative inline-flex">
      <span
        className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}
      />
      {isActive && (
        <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-60" />
      )}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color = 'blue',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: 'blue' | 'green' | 'red' | 'yellow';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={18} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function BiometricMonitorPage() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestIdRef = useRef<number>(0);

  const fetchData = useCallback(async (isPolling = false) => {
    try {
      const sinceParam = isPolling && latestIdRef.current > 0
        ? `&since_id=${latestIdRef.current}`
        : '';
      const res = await fetch(`/api/attendance/zk/live?school_id=1&limit=50${sinceParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'API error');

      const incoming: LiveData = json.data;

      setData(prev => {
        if (!isPolling || !prev) {
          latestIdRef.current = incoming.latest_id;
          return incoming;
        }
        // Polling: prepend new records, keep max 50
        const merged = [...incoming.logs, ...prev.logs].slice(0, 50);
        if (incoming.logs.length > 0) {
          latestIdRef.current = incoming.logs[0].id;
          setNewCount(c => c + incoming.logs.length);
        }
        return {
          ...incoming,
          logs: merged,
        };
      });

      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + interval
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => fetchData(true), 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused, fetchData]);

  const handleRefresh = () => {
    setLoading(true);
    latestIdRef.current = 0;
    fetchData(false);
    setNewCount(0);
  };

  const matchedCount = data?.logs.filter(l => l.matched).length ?? 0;
  const unmatchedCount = data?.logs.filter(l => !l.matched).length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Fingerprint className="text-blue-600" size={28} />
              Biometric Live Monitor
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Real-time ZKTeco punch stream — auto-refreshes every 3 seconds
            </p>
          </div>
          <div className="flex items-center gap-2">
            {newCount > 0 && (
              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                +{newCount} new
              </span>
            )}
            <button
              onClick={() => setPaused(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                paused
                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100'
              }`}
            >
              {paused ? (
                <>
                  <Activity size={14} /> Resume
                </>
              ) : (
                <>
                  <Clock size={14} /> Pause
                </>
              )}
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Cpu}
          label="Total Devices"
          value={data?.devices.total ?? '—'}
          color="blue"
        />
        <StatCard
          icon={Wifi}
          label="Devices Online"
          value={data?.devices.online ?? '—'}
          color={
            (data?.devices.online ?? 0) > 0 ? 'green' : 'red'
          }
        />
        <StatCard
          icon={CheckCircle2}
          label="Matched (last 50)"
          value={matchedCount}
          color="green"
        />
        <StatCard
          icon={AlertCircle}
          label="Unmatched (last 50)"
          value={unmatchedCount}
          color={unmatchedCount > 0 ? 'yellow' : 'green'}
        />
      </div>

      {/* Live status bar */}
      <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
        <span
          className={`h-2 w-2 rounded-full ${paused ? 'bg-yellow-400' : 'bg-green-500 animate-pulse'}`}
        />
        <span>{paused ? 'Paused' : 'Live — polling every 3s'}</span>
        {error && (
          <span className="ml-2 text-red-500 font-medium">⚠ {error}</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading && !data ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw size={22} className="animate-spin mr-2" />
            Loading live data...
          </div>
        ) : (data?.logs ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Fingerprint size={40} className="mb-3 opacity-30" />
            <p className="font-medium">No punch records yet</p>
            <p className="text-sm mt-1">Waiting for device activity...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300 w-10">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Device</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Biometric ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Class / Position</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Method</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Mode</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.logs ?? []).map((log, idx) => (
                  <tr
                    key={log.id}
                    className={`border-b border-gray-100 dark:border-gray-700 transition-colors hover:bg-gray-50 dark:hover:bg-gray-750 ${
                      idx === 0 && newCount > 0 ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>

                    {/* Device */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <DeviceStatusDot isActive={log.device.is_active} />
                        <div>
                          <p className="font-mono font-medium text-gray-800 dark:text-gray-200 text-xs">
                            {log.device_sn}
                          </p>
                          {log.device.model && (
                            <p className="text-gray-400 text-xs">{log.device.model}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatTime(log.check_time)}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(log.check_time)}</p>
                    </td>

                    {/* Biometric ID */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
                        {log.biometric_id}
                      </span>
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3">
                      {log.resolved_name ? (
                        <span className="font-medium text-gray-900 dark:text-white">
                          {log.resolved_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Unresolved</span>
                      )}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      {log.role === 'student' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                          <User size={10} /> Student
                        </span>
                      ) : log.role === 'staff' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                          <Users size={10} /> Staff
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                          Unknown
                        </span>
                      )}
                    </td>

                    {/* Class / Position */}
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">
                      {log.class_info ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Verify method */}
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {verifyLabel(log.verify_type)}
                    </td>

                    {/* IO Mode */}
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {ioLabel(log.io_mode)}
                    </td>

                    {/* Match Status */}
                    <td className="px-4 py-3">
                      {log.matched ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                          <CheckCircle2 size={10} /> Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-semibold">
                          <AlertCircle size={10} /> Unmatched
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Showing last 50 records · Data from{' '}
        <code className="bg-gray-100 px-1 rounded">zk_attendance_logs</code>
      </p>
    </div>
  );
}
