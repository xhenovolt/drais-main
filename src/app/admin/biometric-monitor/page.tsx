"use client";

import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Activity, Wifi, WifiOff, Fingerprint, Clock, User,
  Shield, AlertTriangle, CheckCircle, Loader, Radio,
  Terminal, Zap,
} from 'lucide-react';
import { fetcher } from '@/utils/fetcher';

function timeAgo(seconds: number): string {
  if (seconds <= 0) return 'just now';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const VERIFY_LABELS: Record<number, string> = {
  0: 'Password', 1: 'Fingerprint', 2: 'Card', 15: 'Face',
};

interface MonitorData {
  devices: any[];
  recent_logs: any[];
  heartbeats: any[];
  command_stats: any[];
}

export default function BiometricMonitorPage() {
  const { data, isLoading, error } = useSWR<MonitorData>('/api/admin/biometric-monitor', fetcher, {
    refreshInterval: 5000, // 5s real-time refresh
  });

  const devices = data?.devices || [];
  const logs = data?.recent_logs || [];
  const heartbeats = data?.heartbeats || [];
  const commandStats = data?.command_stats || [];

  const onlineCount = devices.filter((d: any) => d.live_status === 'online').length;
  const totalPunches1h = devices.reduce((sum: number, d: any) => sum + (d.punches_1h || 0), 0);

  const cmdMap: Record<string, number> = {};
  commandStats.forEach((s: any) => { cmdMap[s.status] = s.count; });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="container mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radio className="w-8 h-8 text-green-400" />
              {onlineCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold">Biometric Monitor</h1>
              <p className="text-sm text-slate-400">
                Live feed — auto-refreshes every 5s
              </p>
            </div>
          </div>
          {isLoading && <Loader className="w-5 h-5 text-blue-400 animate-spin" />}
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Devices Online" value={`${onlineCount}/${devices.length}`}
            icon={<Wifi className="w-5 h-5" />} color={onlineCount > 0 ? 'green' : 'red'} />
          <StatCard label="Punches (1h)" value={totalPunches1h}
            icon={<Fingerprint className="w-5 h-5" />} color="blue" />
          <StatCard label="Pending Cmds" value={cmdMap['pending'] || 0}
            icon={<Clock className="w-5 h-5" />} color="yellow" />
          <StatCard label="Sent Cmds" value={cmdMap['sent'] || 0}
            icon={<Zap className="w-5 h-5" />} color="purple" />
          <StatCard label="Failed Cmds" value={cmdMap['failed'] || 0}
            icon={<AlertTriangle className="w-5 h-5" />} color={(cmdMap['failed'] || 0) > 0 ? 'red' : 'slate'} />
        </div>

        {/* Device Status Strip */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Device Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {devices.length === 0 ? (
              <div className="col-span-full text-center py-8 text-slate-500">
                <Activity className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                <p>No devices registered. Waiting for connections...</p>
              </div>
            ) : devices.map((d: any) => {
              const isOnline = d.live_status === 'online';
              return (
                <div key={d.id} className={`flex items-center gap-3 p-4 rounded-xl border ${
                  isOnline
                    ? 'border-green-800 bg-green-950/50'
                    : 'border-red-900 bg-red-950/30'
                }`}>
                  <div className="relative">
                    {isOnline
                      ? <Wifi className="w-6 h-6 text-green-400" />
                      : <WifiOff className="w-6 h-6 text-red-500" />
                    }
                    {isOnline && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {d.device_name || d.sn}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">{d.sn}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                      {isOnline ? 'ONLINE' : 'OFFLINE'}
                    </p>
                    <p className="text-xs text-slate-500">{timeAgo(d.seconds_ago || 99999)} ago</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Two-column: Live Feed + Heartbeats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Attendance Feed */}
          <div className="lg:col-span-2 space-y-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400" />
              Live Attendance Feed
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Fingerprint className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>No attendance events yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-800 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs text-slate-400">Time</th>
                      <th className="px-3 py-2 text-left text-xs text-slate-400">Person</th>
                      <th className="px-3 py-2 text-left text-xs text-slate-400">Device</th>
                      <th className="px-3 py-2 text-left text-xs text-slate-400">Verify</th>
                      <th className="px-3 py-2 text-left text-xs text-slate-400">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="px-3 py-2 text-xs text-slate-400 font-mono whitespace-nowrap">
                          {log.check_time ? new Date(log.check_time).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-sm truncate max-w-[150px]">{log.person_name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400 font-mono">
                          {log.device_name || log.device_sn?.slice(-6)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {VERIFY_LABELS[log.verify_type] || `Type ${log.verify_type}`}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {log.match_type === 'unmatched' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-400">
                              <AlertTriangle className="w-3 h-3" /> Unmatched
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-green-400">
                              <CheckCircle className="w-3 h-3" /> {log.match_type}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Heartbeat Log */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-400" />
              Recent Heartbeats
            </h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
              {heartbeats.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Radio className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>No heartbeats recorded</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {heartbeats.map((hb: any, i: number) => (
                    <div key={i} className="px-3 py-2 flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                      <span className="font-mono text-slate-400 truncate">{hb.sn?.slice(-8)}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-500">{hb.ip}</span>
                      <span className="ml-auto text-slate-600 whitespace-nowrap">
                        {hb.created_at ? new Date(hb.created_at).toLocaleTimeString() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'border-green-800 bg-green-950/30 text-green-400',
    red: 'border-red-800 bg-red-950/30 text-red-400',
    blue: 'border-blue-800 bg-blue-950/30 text-blue-400',
    yellow: 'border-yellow-800 bg-yellow-950/30 text-yellow-400',
    purple: 'border-purple-800 bg-purple-950/30 text-purple-400',
    slate: 'border-slate-700 bg-slate-900 text-slate-400',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.slate}`}>
      <div className="flex items-center justify-between mb-1">
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-60">{label}</p>
    </div>
  );
}
