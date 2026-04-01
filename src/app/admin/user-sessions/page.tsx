'use client';
/**
 * /admin/user-sessions — Live user monitoring
 * Shows active sessions with online/offline status, device info, last seen.
 * Auto-refreshes every 30 seconds.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity, RefreshCw, Monitor, Smartphone, Globe,
  Clock, Wifi, WifiOff, XCircle, Users, LogOut,
} from 'lucide-react';

import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

interface Session {
  id: number;
  user_id: number;
  username: string;
  staff_name: string | null;
  ip_address: string | null;
  device_info: string | null;
  user_agent: string | null;
  created_at: string;
  last_activity_at: string | null;
  expires_at: string;
  is_online: boolean;
}

interface SessionSummary {
  sessions: Session[];
  online_count: number;
  active_count: number;
}

function DeviceIcon({ device }: { device: string | null }) {
  if (!device) return <Monitor className="w-4 h-4" />;
  const d = device.toLowerCase();
  if (d.includes('mobile') || d.includes('phone')) return <Smartphone className="w-4 h-4" />;
  if (d.includes('tablet'))                          return <Monitor className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
}

function fmtAgo(iso: string | null) {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'short' });
}

function fmtDuration(created: string) {
  const secs = Math.floor((Date.now() - new Date(created).getTime()) / 1000);
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export default function UserSessionsPage() {
  const [data,       setData]     = useState<SessionSummary | null>(null);
  const [loading,    setLoading]  = useState(true);
  const [error,      setError]    = useState<string | null>(null);
  const [terminating, setTerminating] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await apiFetch<SessionSummary>('/api/admin/user-sessions', { silent: true });
      setData(json);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 30_000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, load]);

  async function terminate(id: number) {
    if (!await confirmAction('Terminate session?', 'The user will be logged out immediately.', 'Terminate')) return;
    setTerminating(id);
    try {
      await apiFetch(`/api/admin/user-sessions?id=${id}`, {
        method: 'DELETE',
        successMessage: 'Session terminated',
      });
      load();
    } catch (e: any) { setError(e.message); }
    finally { setTerminating(null); }
  }

  async function terminateUser(userId: number, name: string) {
    if (!await confirmAction(`Force logout ${name}?`, 'All sessions will be terminated.', 'Logout All')) return;
    setTerminating(userId);
    try {
      await apiFetch(`/api/admin/user-sessions?user_id=${userId}`, {
        method: 'DELETE',
        successMessage: `All sessions for ${name} terminated`,
      });
      load();
    } catch (e: any) { setError(e.message); }
    finally { setTerminating(null); }
  }

  const sessions = data?.sessions ?? [];
  const online   = sessions.filter(s => s.is_online);
  const offline  = sessions.filter(s => !s.is_online);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-600">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">User Monitoring</h1>
            <p className="text-sm text-slate-500">Live session activity</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded" />
            Auto-refresh (30s)
          </label>
          <button onClick={load}
            className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 text-sm">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <Wifi className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Online Now</span>
          </div>
          <div className="text-3xl font-bold text-slate-800 dark:text-white">{data?.online_count ?? 0}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Active Sessions</span>
          </div>
          <div className="text-3xl font-bold text-slate-800 dark:text-white">{data?.active_count ?? 0}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
          <div className="flex items-center gap-2 text-slate-500 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Last Updated</span>
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{new Date().toLocaleTimeString()}</div>
        </div>
      </div>

      {/* Online sessions */}
      {online.length > 0 && (
        <Section title="Online" count={online.length} color="emerald">
          {online.map(s => (
            <SessionRow key={s.id} session={s} onTerminate={terminate} onTerminateUser={terminateUser} terminating={terminating} />
          ))}
        </Section>
      )}

      {/* Offline sessions */}
      {offline.length > 0 && (
        <Section title="Recently Active" count={offline.length} color="slate">
          {offline.map(s => (
            <SessionRow key={s.id} session={s} onTerminate={terminate} onTerminateUser={terminateUser} terminating={terminating} />
          ))}
        </Section>
      )}

      {!loading && sessions.length === 0 && (
        <div className="text-center py-16 text-slate-400">No active sessions found</div>
      )}
    </div>
  );
}

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
    slate:   'text-slate-600   bg-slate-50   dark:bg-slate-800/40',
  };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className={`px-4 py-2.5 flex items-center gap-2 ${colorMap[color] ?? colorMap.slate}`}>
        {color === 'emerald'
          ? <Wifi className="w-4 h-4" />
          : <WifiOff className="w-4 h-4" />
        }
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-black/20">{count}</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/40">
        {children}
      </div>
    </div>
  );
}

function SessionRow({ session: s, onTerminate, onTerminateUser, terminating }: {
  session: Session;
  onTerminate: (id: number) => void;
  onTerminateUser: (userId: number, name: string) => void;
  terminating: number | null;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`} />

      {/* User info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-slate-800 dark:text-white truncate">
          {s.staff_name ?? s.username}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{s.ip_address ?? 'unknown IP'}</span>
          <span className="flex items-center gap-1"><DeviceIcon device={s.device_info} />{s.device_info ?? 'Desktop'}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDuration(s.created_at)}</span>
        </div>
      </div>

      {/* Last seen */}
      <div className="text-xs text-slate-400 hidden sm:block flex-shrink-0">
        {s.is_online ? <span className="text-emerald-500 font-medium">Now</span> : fmtAgo(s.last_activity_at)}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onTerminate(s.id)}
          disabled={terminating === s.id}
          title="Terminate this session"
          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-colors disabled:opacity-50"
        >
          <XCircle className="w-4 h-4" />
        </button>
        <button
          onClick={() => onTerminateUser(s.user_id, s.staff_name ?? s.username)}
          disabled={terminating === s.user_id}
          title="Logout all sessions for this user"
          className="p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-400 transition-colors disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
