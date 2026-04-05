"use client";

import React, { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import {
  Activity, Wifi, WifiOff, Server, Clock, MapPin, Hash,
  Trash2, Users, Loader, CheckCircle, AlertTriangle, Settings,
  Fingerprint, RefreshCw, Edit2, X, Save, UserPlus, Send,
  RotateCcw, ShieldAlert, Database,
} from 'lucide-react';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

function formatTimeAgo(seconds: number): string {
  if (seconds <= 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function SyncStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'unknown') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        Unknown
      </span>
    );
  }
  if (status === 'synced') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" />
        Synced
      </span>
    );
  }
  if (status === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
        <Loader className="w-3 h-3 animate-spin" />
        Syncing
      </span>
    );
  }
  // out_of_sync
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
      <ShieldAlert className="w-3 h-3" />
      Out of Sync
    </span>
  );
}

export default function DevicesPage() {
  const { data, isLoading, error, mutate } = useSWR<any>('/api/attendance/zk/devices', {
    refreshInterval: 30000,
  });

  const devices = data?.data || [];
  const online = devices.filter((d: any) => d.connection_status === 'online').length;
  const offline = devices.length - online;
  const outOfSync = devices.filter((d: any) => d.sync_status === 'out_of_sync').length;

  // Alert: toast for every out-of-sync device on load
  useEffect(() => {
    if (!data?.data) return;
    const bad = (data.data as any[]).filter((d) => d.sync_status === 'out_of_sync');
    if (bad.length > 0) {
      showToast('error',
        `${bad.length} device${bad.length > 1 ? 's' : ''} ha${bad.length > 1 ? 've' : 's'} data mismatch. Please re-sync.`,
      );
    }
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100
      dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600
              bg-clip-text text-transparent flex items-center gap-3">
              <Fingerprint className="w-8 h-8 text-blue-600" />
              Device Management
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              Drais is the source of truth — auto-refreshes every 30s
            </p>
          </div>
          <button
            onClick={() => mutate()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600
              rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Total Devices</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{devices.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Server className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Online</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{online}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Wifi className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Offline</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{offline}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <WifiOff className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className={`rounded-xl border p-5 ${outOfSync > 0
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Out of Sync</p>
                <p className={`text-3xl font-bold mt-1 ${outOfSync > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                  {outOfSync}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                outOfSync > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                <ShieldAlert className={`w-6 h-6 ${outOfSync > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Out-of-sync banner */}
        {outOfSync > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                {outOfSync} device{outOfSync > 1 ? 's' : ''} {outOfSync > 1 ? 'have' : 'has'} data mismatch
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Device data does not match Drais DB. Use "Re-sync Device" to push DB state, or "Reset &amp; Rebuild" for a full wipe + reload.
              </p>
            </div>
          </div>
        )}

        {/* Devices Grid */}
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-gray-500 mt-3 text-sm">Loading devices...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-red-200">
            <WifiOff className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-red-600 mt-3 font-medium">Failed to load devices</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-gray-300">
            <Server className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="text-gray-600 mt-3 font-medium">No devices registered</p>
            <p className="text-gray-400 text-sm mt-1">
              Devices auto-register on first heartbeat. Point your ZKTeco device at this server.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map((device: any) => (
              <DeviceCard key={device.id} device={device} onMutate={() => mutate()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceCard({ device, onMutate }: { device: any; onMutate: () => void }) {
  const isOnline = device.connection_status === 'online';
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

  // ── Sync Identities state ──
  const [idSyncing, setIdSyncing] = useState(false);
  const [idProgress, setIdProgress] = useState<{ total: number; pending: number; sent: number; acknowledged: number; failed: number; status: string } | null>(null);
  const [idPolling, setIdPolling] = useState(false);

  // ── Re-sync / Reset state ──
  const [resyncing, setResyncing] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attendance/zk/devices/sync-members?device_sn=${device.serial_number}`);
        const json = await res.json();
        if (!json.success) return;
        const status = json.sync_status;
        setSyncState(status);
        setMemberCount(json.member_count ?? null);
        if (status === 'acknowledged' || status === 'failed' || status === 'expired' || status === 'idle') {
          setPolling(false);
          if (status === 'acknowledged') showToast('success', `${json.member_count} members synced`);
          else if (status === 'failed' || status === 'expired') showToast('error', 'Sync failed');
        }
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [polling, device.serial_number]);

  // ── Sync Identities polling ──
  useEffect(() => {
    if (!idPolling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attendance/zk/devices/sync-identities?device_sn=${device.serial_number}`);
        const json = await res.json();
        if (!json.success) return;
        setIdProgress({
          total: json.total,
          pending: json.pending,
          sent: json.sent,
          acknowledged: json.acknowledged,
          failed: json.failed,
          status: json.sync_status,
        });
        if (json.sync_status === 'complete' || json.sync_status === 'idle' || json.sync_status === 'failed') {
          setIdPolling(false);
          setIdSyncing(false);
          if (json.sync_status === 'complete') showToast('success', `All ${json.acknowledged} identities synced to device`);
          else if (json.sync_status === 'failed') showToast('error', `Sync had ${json.failed} failures`);
          onMutate();
        }
      } catch { /* silent */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [idPolling, device.serial_number, onMutate]);

  const startIdentitySync = useCallback(async () => {
    setIdSyncing(true);
    try {
      const res = await apiFetch<any>('/api/attendance/zk/devices/sync-identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number }),
        successMessage: 'Identity sync started',
      });
      if (res.queued === 0) {
        showToast('info', res.message || 'All users already synced');
        setIdSyncing(false);
        return;
      }
      setIdProgress({ total: res.queued, pending: res.queued, sent: 0, acknowledged: 0, failed: 0, status: 'syncing' });
      setIdPolling(true);
    } catch {
      setIdSyncing(false);
    }
  }, [device.serial_number]);

  const startSync = useCallback(async () => {
    setSyncState('pending');
    setPolling(true);
    try {
      await apiFetch('/api/attendance/zk/devices/sync-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number }),
        successMessage: 'Sync queued — waiting for heartbeat...',
      });
    } catch {
      setSyncState('idle');
      setPolling(false);
    }
  }, [device.serial_number]);

  // ── Re-sync Device (push all mapped users) ──
  const handleResync = useCallback(async () => {
    const confirmed = await confirmAction(
      'Re-sync Device',
      `Re-push all ${device.expected_user_count ?? 'mapped'} users from Drais DB to "${device.device_name || device.serial_number}". Safe — does not wipe device first.`,
      'Re-sync Device',
    );
    if (!confirmed) return;
    setResyncing(true);
    try {
      const res = await apiFetch<any>('/api/devices/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number }),
        successMessage: `Re-sync queued: commands will push on next heartbeat`,
      });
      showToast('success', `${res.queued ?? 0} user commands queued for re-sync`);
      onMutate();
    } catch {
      // apiFetch shows error toast
    } finally {
      setResyncing(false);
    }
  }, [device, onMutate]);

  // ── Reset & Rebuild (wipe + re-push all) ──
  const handleResetAndSync = useCallback(async () => {
    const confirmed = await confirmAction(
      '⚠️ Reset & Rebuild Device',
      `This will send CLEAR DATA USER to "${device.device_name || device.serial_number}", wiping ALL users from the device, then immediately re-push all users from Drais DB.\n\nDevice will be temporarily empty until commands are processed. Continue?`,
      'Reset & Rebuild',
    );
    if (!confirmed) return;
    setResetting(true);
    try {
      const res = await apiFetch<any>('/api/devices/reset-and-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number }),
        successMessage: `Device wipe + rebuild queued`,
      });
      showToast('success', `Reset queued. ${res.users_queued ?? 0} users will reload after wipe.`);
      onMutate();
    } catch {
      // apiFetch shows error toast
    } finally {
      setResetting(false);
    }
  }, [device, onMutate]);

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      'Remove Device',
      `Are you sure? This will remove "${device.device_name || device.serial_number}" from the registry. Existing attendance logs will be preserved.`,
      'Remove Device',
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiFetch(`/api/attendance/zk/devices?id=${device.id}`, {
        method: 'DELETE',
        successMessage: 'Device removed successfully',
      });
      onMutate();
    } catch {
      // apiFetch shows toast
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/attendance/zk/devices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: device.id,
          device_name: editForm.device_name || null,
          location: editForm.location || null,
        }),
        successMessage: 'Device updated',
      });
      setEditing(false);
      onMutate();
    } catch {
      // apiFetch shows toast
    } finally {
      setSaving(false);
    }
  };

  const syncLabel: Record<string, string> = {
    idle: 'View Members',
    pending: 'Waiting for heartbeat...',
    sent: 'Device processing...',
    acknowledged: `${memberCount ?? '?'} members synced`,
    failed: 'Sync failed — retry?',
  };

  const lastSeenSeconds = device.last_heartbeat
    ? Math.floor((Date.now() - new Date(device.last_heartbeat).getTime()) / 1000)
    : 99999;

  const syncStatus: string = device.sync_status || 'unknown';
  const isOutOfSync = syncStatus === 'out_of_sync';

  return (
    <div className={`relative bg-white dark:bg-slate-800 rounded-xl border overflow-hidden transition-all ${
      isOutOfSync
        ? 'border-red-300 dark:border-red-700 shadow-red-100 dark:shadow-red-900/20 shadow-md'
        : isOnline ? 'border-green-200 dark:border-green-800 shadow-sm' : 'border-red-200 dark:border-red-800/50 opacity-90'
    }`}>
      <div className={`h-1 ${isOutOfSync ? 'bg-gradient-to-r from-red-500 to-orange-500' : isOnline ? 'bg-green-500' : 'bg-red-500'}`} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isOnline ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              {isOnline ? <Wifi className="w-5 h-5 text-green-600" /> : <WifiOff className="w-5 h-5 text-red-500" />}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                {device.device_name || device.serial_number}
              </h3>
              <p className="text-xs text-gray-500 font-mono">{device.serial_number}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
              isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <SyncStatusBadge status={syncStatus} />
          </div>
        </div>

        {editing ? (
          <div className="space-y-2">
            <input type="text" placeholder="Device name" value={editForm.device_name}
              onChange={(e) => setEditForm({ ...editForm, device_name: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900" />
            <input type="text" placeholder="Location" value={editForm.location}
              onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900" />
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs">
                {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
              </button>
              <button onClick={() => setEditing(false)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-gray-300 rounded-lg text-xs">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Last seen <span className="font-medium text-gray-800 dark:text-gray-200">{formatTimeAgo(lastSeenSeconds)}</span></span>
              </div>
              {device.ip_address && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span className="font-mono text-xs">{device.ip_address}</span>
                </div>
              )}
              {device.location && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Settings className="w-4 h-4 shrink-0" />
                  <span className="text-xs">{device.location}</span>
                </div>
              )}
              {device.model && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Hash className="w-4 h-4 shrink-0" />
                  <span className="text-xs">{device.model}</span>
                </div>
              )}

              {/* Sync state stats */}
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  <span>Expected: <strong className="text-gray-800 dark:text-gray-200">{device.expected_user_count ?? '—'}</strong></span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Users className="w-3.5 h-3.5 text-green-400" />
                  <span>On device: <strong className={`${isOutOfSync ? 'text-red-600' : 'text-gray-800 dark:text-gray-200'}`}>
                    {device.last_known_device_user_count ?? '—'}
                  </strong></span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                <span>Today: <strong>{device.today_punches || 0}</strong> punches</span>
                <span>Pending: <strong>{device.pending_commands || 0}</strong> cmds</span>
                <span>Mapped: <strong>{device.mapped_users || 0}</strong></span>
              </div>
            </div>

            {/* Out-of-sync alert strip */}
            {isOutOfSync && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <p className="text-[11px] text-red-700 dark:text-red-300 font-medium">
                  Device data mismatch detected. Please re-sync.
                </p>
              </div>
            )}

            {/* Sync Identities — progress bar */}
            {(idSyncing || (idProgress && idProgress.status === 'syncing')) && idProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-600 font-medium flex items-center gap-1">
                    <Send className="w-3 h-3" /> Syncing identities to device...
                  </span>
                  <span className="text-gray-500 font-mono">
                    {idProgress.sent + idProgress.acknowledged}/{idProgress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${idProgress.total > 0 ? Math.round(((idProgress.sent + idProgress.acknowledged) / idProgress.total) * 100) : 0}%` }} />
                </div>
                <div className="flex gap-3 text-[10px] text-gray-400">
                  <span>Pending: {idProgress.pending}</span>
                  <span>Sent: {idProgress.sent}</span>
                  <span className="text-green-600">Done: {idProgress.acknowledged}</span>
                  {idProgress.failed > 0 && <span className="text-red-500">Failed: {idProgress.failed}</span>}
                </div>
              </div>
            )}

            {/* Action buttons row 1: Sync Identities + Edit + Delete */}
            <div className="flex gap-2">
              <button onClick={startIdentitySync} disabled={idSyncing || !isOnline}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  idSyncing ? 'bg-purple-50 text-purple-600 cursor-wait'
                    : idProgress?.status === 'complete' ? 'bg-green-50 text-green-700 hover:bg-green-100'
                      : 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 hover:bg-purple-100'
                }`}>
                {idSyncing
                  ? <Loader className="w-3.5 h-3.5 animate-spin" />
                  : idProgress?.status === 'complete' ? <CheckCircle className="w-3.5 h-3.5" />
                    : <UserPlus className="w-3.5 h-3.5" />}
                {idSyncing ? 'Syncing...' : idProgress?.status === 'complete' ? 'Device Up to Date' : 'Sync Identities'}
              </button>
              <button onClick={() => { setEditForm({ device_name: device.device_name || '', location: device.location || '' }); setEditing(true); }}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-500" title="Edit">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="p-2 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Remove device">
                {deleting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Action buttons row 2: Re-sync + Reset & Rebuild */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleResync}
                disabled={resyncing || resetting}
                title="Re-push all DB users to device without wiping"
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  resyncing
                    ? 'bg-blue-50 text-blue-600 cursor-wait'
                    : isOutOfSync
                      ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                      : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100'
                }`}>
                {resyncing
                  ? <Loader className="w-3.5 h-3.5 animate-spin" />
                  : <RotateCcw className="w-3.5 h-3.5" />}
                {resyncing ? 'Queuing...' : 'Re-sync Device'}
              </button>
              <button
                onClick={handleResetAndSync}
                disabled={resetting || resyncing}
                title="Wipe device users completely, then rebuild from DB"
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  resetting
                    ? 'bg-orange-50 text-orange-600 border-orange-200 cursor-wait'
                    : 'border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                }`}>
                {resetting
                  ? <Loader className="w-3.5 h-3.5 animate-spin" />
                  : <ShieldAlert className="w-3.5 h-3.5" />}
                {resetting ? 'Queuing...' : 'Reset & Rebuild'}
              </button>
            </div>

            {/* Existing View Members button — smaller row */}
            <button onClick={startSync} disabled={syncState === 'pending' || syncState === 'sent'}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                syncState === 'pending' || syncState === 'sent' ? 'bg-blue-50 text-blue-600 cursor-wait'
                  : syncState === 'acknowledged' ? 'bg-green-50 text-green-700 hover:bg-green-100'
                    : 'bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-blue-50 hover:text-blue-600'
              }`}>
              {syncState === 'pending' || syncState === 'sent'
                ? <Loader className="w-3 h-3 animate-spin" />
                : syncState === 'acknowledged' ? <CheckCircle className="w-3 h-3" />
                  : <Users className="w-3 h-3" />}
              {syncLabel[syncState]}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
