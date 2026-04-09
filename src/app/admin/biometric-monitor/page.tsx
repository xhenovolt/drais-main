"use client";

import React, { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import {
  Activity, Wifi, WifiOff, Fingerprint, Clock, User,
  Shield, AlertTriangle, CheckCircle, Loader, Radio,
  Terminal, Zap, Server, MapPin, Hash, Settings,
  Trash2, Users, UserPlus, Send, RotateCcw, ShieldAlert,
  Database, Power, Timer, Info, Download, Edit2, X, Save,
  RefreshCw, Eye, EyeOff,
} from 'lucide-react';
import { fetcher } from '@/utils/fetcher';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

function timeAgo(seconds: number): string {
  if (seconds <= 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
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

function SyncStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'unknown') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-800 text-gray-400">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
        Unknown
      </span>
    );
  }
  if (status === 'synced') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-900/50 text-green-400">
        <CheckCircle className="w-3 h-3" />
        Synced
      </span>
    );
  }
  if (status === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-900/50 text-blue-400">
        <Loader className="w-3 h-3 animate-spin" />
        Syncing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-900/50 text-red-400">
      <ShieldAlert className="w-3 h-3" />
      Out of Sync
    </span>
  );
}

/* --- Tooltip Action Button --- */
function ActionIcon({
  icon, label, color, loading, done, disabled, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  loading?: boolean;
  done?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    blue: 'hover:bg-blue-900/50 text-blue-400',
    green: 'hover:bg-green-900/50 text-green-400',
    red: 'hover:bg-red-900/50 text-red-400',
    purple: 'hover:bg-purple-900/50 text-purple-400',
    teal: 'hover:bg-teal-900/50 text-teal-400',
    orange: 'hover:bg-orange-900/50 text-orange-400',
    gray: 'hover:bg-gray-800 text-gray-400',
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={loading || disabled}
        className={`p-2 rounded-lg transition-colors ${
          disabled ? 'opacity-30 cursor-not-allowed' : colorMap[color] || colorMap.gray
        } ${loading ? 'animate-pulse' : ''}`}
      >
        {loading ? <Loader className="w-4 h-4 animate-spin" /> : done ? <CheckCircle className="w-4 h-4 text-green-400" /> : icon}
      </button>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-700 border border-slate-600
        text-white text-[10px] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none
        transition-opacity z-50">
        {label}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 rotate-45 bg-slate-700 border-r border-b border-slate-600" />
      </div>
    </div>
  );
}

/* --- Device Management Card --- */
function DeviceCard({ device, onMutate, showHidden }: { device: any; onMutate: () => void; showHidden?: boolean }) {
  const isOnline = device.live_status === 'online';
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    device_name: device.device_name || '',
    location: device.location || '',
  });
  const [saving, setSaving] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'sent' | 'acknowledged' | 'failed'>('idle');
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const [idSyncing, setIdSyncing] = useState(false);
  const [idProgress, setIdProgress] = useState<{
    total: number; pending: number; sent: number; acknowledged: number; failed: number; status: string;
  } | null>(null);
  const [idPolling, setIdPolling] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hiding, setHiding] = useState(false);

  const sn = device.sn;
  const isHidden = Boolean(device.is_hidden);

  const runDeviceAction = useCallback(async (action: string, label: string, confirmMsg?: string) => {
    if (!isOnline) { showToast('error', 'Device is offline — cannot send commands'); return; }
    if (confirmMsg) {
      const ok = await confirmAction(label, confirmMsg, label);
      if (!ok) return;
    }
    setActionLoading(action);
    try {
      await apiFetch<any>('/api/attendance/zk/devices/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: sn, action }),
        successMessage: `${label} queued`,
      });
      onMutate();
    } catch { /* apiFetch shows toast */ } finally { setActionLoading(null); }
  }, [sn, isOnline, onMutate]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attendance/zk/devices/sync-members?device_sn=${sn}`);
        const json = await res.json();
        if (!json.success) return;
        setSyncState(json.sync_status);
        setMemberCount(json.member_count ?? null);
        if (['acknowledged', 'failed', 'expired', 'idle'].includes(json.sync_status)) {
          setPolling(false);
          if (json.sync_status === 'acknowledged') showToast('success', `${json.member_count} members synced`);
          else if (json.sync_status === 'failed' || json.sync_status === 'expired') showToast('error', 'Sync failed');
        }
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [polling, sn]);

  useEffect(() => {
    if (!idPolling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attendance/zk/devices/sync-identities?device_sn=${sn}`);
        const json = await res.json();
        if (!json.success) return;
        setIdProgress({
          total: json.total, pending: json.pending, sent: json.sent,
          acknowledged: json.acknowledged, failed: json.failed, status: json.sync_status,
        });
        if (['complete', 'idle', 'failed'].includes(json.sync_status)) {
          setIdPolling(false);
          setIdSyncing(false);
          if (json.sync_status === 'complete') showToast('success', `All ${json.acknowledged} identities synced`);
          else if (json.sync_status === 'failed') showToast('error', `Sync had ${json.failed} failures`);
          onMutate();
        }
      } catch { /* silent */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [idPolling, sn, onMutate]);

  const startIdentitySync = useCallback(async () => {
    setIdSyncing(true);
    try {
      const res = await apiFetch<any>('/api/attendance/zk/devices/sync-identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: sn }),
        successMessage: 'Identity sync started',
      });
      if (res.queued === 0) {
        showToast('info', res.message || 'All users already synced');
        setIdSyncing(false);
        return;
      }
      setIdProgress({ total: res.queued, pending: res.queued, sent: 0, acknowledged: 0, failed: 0, status: 'syncing' });
      setIdPolling(true);
    } catch { setIdSyncing(false); }
  }, [sn]);

  const startSync = useCallback(async () => {
    setSyncState('pending');
    setPolling(true);
    try {
      await apiFetch('/api/attendance/zk/devices/sync-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: sn }),
        successMessage: 'Sync queued — waiting for heartbeat...',
      });
    } catch { setSyncState('idle'); setPolling(false); }
  }, [sn]);

  const handleResync = useCallback(async () => {
    const confirmed = await confirmAction(
      'Re-sync Device',
      `Re-push all mapped users from Drais DB to "${device.device_name || sn}". Safe — does not wipe device first.`,
      'Re-sync Device',
    );
    if (!confirmed) return;
    setActionLoading('resync');
    try {
      const res = await apiFetch<any>('/api/devices/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: sn }),
        successMessage: 'Re-sync queued',
      });
      showToast('success', `${res.queued ?? 0} user commands queued`);
      onMutate();
    } catch { } finally { setActionLoading(null); }
  }, [device, sn, onMutate]);

  const handleResetAndSync = useCallback(async () => {
    const confirmed = await confirmAction(
      'Reset & Rebuild Device',
      `This will wipe ALL users from "${device.device_name || sn}", then re-push from Drais DB. Continue?`,
      'Reset & Rebuild',
    );
    if (!confirmed) return;
    setActionLoading('reset');
    try {
      const res = await apiFetch<any>('/api/devices/reset-and-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: sn }),
        successMessage: 'Device wipe + rebuild queued',
      });
      showToast('success', `Reset queued. ${res.users_queued ?? 0} users will reload.`);
      onMutate();
    } catch { } finally { setActionLoading(null); }
  }, [device, sn, onMutate]);

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      'Remove Device',
      `Remove "${device.device_name || sn}" from the registry? Attendance logs are preserved.`,
      'Remove Device',
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/attendance/zk/devices?id=${device.id}`, { method: 'DELETE', successMessage: 'Device removed' });
      onMutate();
    } catch { } finally { setDeleting(false); }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/attendance/zk/devices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: device.id, device_name: editForm.device_name || null, location: editForm.location || null }),
        successMessage: 'Device updated',
      });
      setEditing(false);
      onMutate();
    } catch { } finally { setSaving(false); }
  };

  const lastSeenSeconds = device.seconds_ago || 99999;
  const syncStatus: string = device.sync_status || 'unknown';
  const isOutOfSync = syncStatus === 'out_of_sync';

  return (
    <div className={`relative rounded-xl border overflow-hidden transition-all ${
      isOutOfSync ? 'border-red-700 bg-red-950/20 shadow-red-900/20 shadow-md'
        : isOnline ? 'border-green-800 bg-slate-900/80 shadow-sm'
        : 'border-slate-700 bg-slate-900/50'
    } ${isHidden ? 'opacity-50' : ''
    }`}>
      <div className={`h-1 ${isOutOfSync ? 'bg-gradient-to-r from-red-500 to-orange-500' : isOnline ? 'bg-green-500' : 'bg-red-500'}`} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isOnline ? 'bg-green-900/40' : 'bg-red-900/30'
            }`}>
              {isOnline ? <Wifi className="w-5 h-5 text-green-400" /> : <WifiOff className="w-5 h-5 text-red-500" />}
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">{device.device_name || sn}</h3>
              <p className="text-xs text-slate-500 font-mono">{sn}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
              isOnline ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <SyncStatusBadge status={syncStatus} />
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            <input type="text" placeholder="Device name" value={editForm.device_name}
              onChange={(e) => setEditForm({ ...editForm, device_name: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-slate-600 rounded-lg bg-slate-800 text-white" />
            <input type="text" placeholder="Location" value={editForm.location}
              onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-slate-600 rounded-lg bg-slate-800 text-white" />
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs">
                {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
              </button>
              <button onClick={() => setEditing(false)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-slate-600 text-slate-300 rounded-lg text-xs">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Last seen <span className="font-medium text-slate-200">{timeAgo(lastSeenSeconds)}</span></span>
              </div>
              {device.ip_address && (
                <div className="flex items-center gap-2 text-slate-400">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span className="font-mono text-xs">{device.ip_address}</span>
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                <span>1h: <strong className="text-slate-300">{device.punches_1h || 0}</strong> punches</span>
                <span>Mapped: <strong className="text-slate-300">{device.mapped_users || 0}</strong></span>
              </div>
            </div>

            {isOutOfSync && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-950/40 rounded-lg border border-red-800">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <p className="text-[11px] text-red-400 font-medium">Device data mismatch — re-sync.</p>
              </div>
            )}

            {(idSyncing || (idProgress && idProgress.status === 'syncing')) && idProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-400 font-medium flex items-center gap-1">
                    <Send className="w-3 h-3" /> Syncing identities...
                  </span>
                  <span className="text-slate-400 font-mono">
                    {idProgress.sent + idProgress.acknowledged}/{idProgress.total}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${idProgress.total > 0 ? Math.round(((idProgress.sent + idProgress.acknowledged) / idProgress.total) * 100) : 0}%` }} />
                </div>
              </div>
            )}

            {syncState !== 'idle' && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {(syncState === 'pending' || syncState === 'sent')
                  ? <Loader className="w-3 h-3 animate-spin text-blue-400" />
                  : syncState === 'acknowledged' ? <CheckCircle className="w-3 h-3 text-green-400" /> : null}
                <span>
                  {syncState === 'pending' ? 'Waiting for heartbeat...' :
                    syncState === 'sent' ? 'Device processing...' :
                    syncState === 'acknowledged' ? `${memberCount ?? '?'} members synced` :
                    'Sync failed — retry?'}
                </span>
              </div>
            )}

            {/* ACTION BAR */}
            <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-700/50">
              <ActionIcon icon={<UserPlus className="w-4 h-4" />} label="Sync Users -> Device" color="purple"
                loading={idSyncing} done={idProgress?.status === 'complete'} disabled={!isOnline} onClick={startIdentitySync} />
              <ActionIcon icon={<Download className="w-4 h-4" />} label="Pull Users from Device" color="blue"
                loading={syncState === 'pending' || syncState === 'sent'} done={syncState === 'acknowledged'}
                disabled={!isOnline} onClick={startSync} />
              <ActionIcon icon={<RotateCcw className="w-4 h-4" />} label="Re-sync Device" color={isOutOfSync ? 'red' : 'blue'}
                loading={actionLoading === 'resync'} disabled={!isOnline} onClick={handleResync} />
              <ActionIcon icon={<Timer className="w-4 h-4" />} label="Sync Time" color="teal"
                loading={actionLoading === 'sync_time'} disabled={!isOnline}
                onClick={() => runDeviceAction('sync_time', 'Sync Time')} />
              <ActionIcon icon={<Trash2 className="w-4 h-4" />} label="Clear Logs" color="orange"
                loading={actionLoading === 'clear_logs'} disabled={!isOnline}
                onClick={() => runDeviceAction('clear_logs', 'Clear Logs', 'Clear all attendance logs on device? (DB logs preserved)')} />
              <ActionIcon icon={<Power className="w-4 h-4" />} label="Restart Device" color="red"
                loading={actionLoading === 'restart'} disabled={!isOnline}
                onClick={() => runDeviceAction('restart', 'Restart', 'Reboot device?')} />
              <ActionIcon icon={<ShieldAlert className="w-4 h-4" />} label="Reset & Rebuild" color="red"
                loading={actionLoading === 'reset'} disabled={!isOnline} onClick={handleResetAndSync} />
              <ActionIcon icon={<Edit2 className="w-4 h-4" />} label="Edit" color="gray"
                onClick={() => setEditing(true)} />
              <ActionIcon icon={isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                label={isHidden ? 'Unhide Device' : 'Hide Device'} color={isHidden ? 'green' : 'gray'}
                loading={hiding} onClick={async () => {
                  setHiding(true);
                  try {
                    if (isHidden) {
                      await apiFetch(`/api/admin/biometric-monitor/hide?device_id=${device.id}`, {
                        method: 'DELETE', successMessage: 'Device unhidden',
                      });
                    } else {
                      await apiFetch('/api/admin/biometric-monitor/hide', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ device_id: device.id }),
                        successMessage: 'Device hidden from this school',
                      });
                    }
                    onMutate();
                  } catch {} finally { setHiding(false); }
                }} />
              <ActionIcon icon={<Trash2 className="w-4 h-4" />} label="Remove Device" color="red"
                loading={deleting} onClick={handleDelete} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* === MAIN PAGE === */

export default function BiometricMonitorPage() {
  const [showHidden, setShowHidden] = useState(false);

  const { data, isLoading, error, mutate } = useSWR<MonitorData>('/api/admin/biometric-monitor', fetcher, {
    refreshInterval: 5000,
  });

  const allDevices = data?.devices || [];
  const hiddenCount = allDevices.filter((d: any) => d.is_hidden).length;
  const devices = showHidden ? allDevices : allDevices.filter((d: any) => !d.is_hidden);
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
              <h1 className="text-2xl font-bold">Biometric Command Center</h1>
              <p className="text-sm text-slate-400">
                Live monitoring + full device management — auto-refreshes every 5s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hiddenCount > 0 && (
              <button onClick={() => setShowHidden(!showHidden)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  showHidden
                    ? 'border-yellow-700 bg-yellow-950/30 text-yellow-400'
                    : 'border-slate-700 hover:bg-slate-800 text-slate-400'
                }`}>
                {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {showHidden ? `Showing ${hiddenCount} hidden` : `${hiddenCount} hidden`}
              </button>
            )}
            <button onClick={() => mutate()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-sm text-slate-300">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Devices Online" value={`${onlineCount}/${devices.length}`}
            icon={<Wifi className="w-5 h-5" />} color={onlineCount > 0 ? 'green' : 'red'} />
          <StatCard label="Punches (1h)" value={totalPunches1h}
            icon={<Fingerprint className="w-5 h-5" />} color="blue" />
          <StatCard label="Pending Cmds" value={cmdMap['pending'] || 0}
            icon={<Clock className="w-5 h-5" />} color="yellow" />
          <StatCard label="Acknowledged" value={cmdMap['acknowledged'] || 0}
            icon={<CheckCircle className="w-5 h-5" />} color="green" />
          <StatCard label="Failed Cmds" value={cmdMap['failed'] || 0}
            icon={<AlertTriangle className="w-5 h-5" />} color={(cmdMap['failed'] || 0) > 0 ? 'red' : 'slate'} />
        </div>

        {/* DEVICE MANAGEMENT CARDS */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            Device Management
          </h2>
          {devices.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed border-slate-700">
              <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3 animate-pulse" />
              <p className="text-slate-400 font-medium">No devices registered</p>
              <p className="text-xs text-slate-600 mt-1">Devices auto-register on first heartbeat</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {devices.map((d: any) => (
                <DeviceCard key={d.id} device={d} onMutate={() => mutate()} showHidden={showHidden} />
              ))}
            </div>
          )}
        </div>

        {/* Two-column: Live Feed + Heartbeats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                          {log.check_time ? new Date(log.check_time).toLocaleTimeString() : '--'}
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
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-500">{hb.ip}</span>
                      <span className="ml-auto text-slate-600 whitespace-nowrap">
                        {hb.created_at ? new Date(hb.created_at).toLocaleTimeString() : '--'}
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
