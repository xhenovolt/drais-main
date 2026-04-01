"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, RefreshCw, ChevronLeft, ChevronRight, Fingerprint,
  UserCheck, UserX, Loader, CheckCircle, AlertTriangle, Radio, Download,
} from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type SyncState = 'idle' | 'pending' | 'sent' | 'acknowledged' | 'failed';

export default function DeviceMappingsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deviceSn, setDeviceSn] = useState('');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [polling, setPolling] = useState(false);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '100');
  if (search) params.set('search', search);
  if (statusFilter) params.set('status', statusFilter);
  if (deviceSn) params.set('device_sn', deviceSn);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/device-mappings?${params.toString()}`,
    fetcher,
    { refreshInterval: syncState === 'acknowledged' ? 3000 : 0 },
  );

  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher);
  const devices = devicesData?.data || [];
  const users = data?.data || [];
  const stats = data?.stats || { total: 0, linked: 0, unlinked: 0 };
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  // ── Sync polling ──
  useEffect(() => {
    if (!polling || !deviceSn) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attendance/zk/devices/sync-members?device_sn=${deviceSn}`);
        const json = await res.json();
        if (!json.success) return;

        const s = json.sync_status;
        setSyncState(s);

        if (s === 'acknowledged') {
          setPolling(false);
          toast.success(`${json.member_count} members synced from device`);
          mutate(); // Refresh the table
        } else if (s === 'failed' || s === 'expired' || s === 'idle') {
          setPolling(false);
          if (s === 'failed' || s === 'expired') {
            toast.error('Sync failed — device may be offline');
          }
        }
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [polling, deviceSn, mutate]);

  const startSync = useCallback(async () => {
    if (!deviceSn) {
      toast.error('Select a device first');
      return;
    }
    setSyncState('pending');
    setPolling(true);
    try {
      const res = await fetch('/api/attendance/zk/devices/sync-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: deviceSn }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed');
        setSyncState('idle');
        setPolling(false);
        return;
      }
      setSyncState(json.status || 'pending');
      toast.success('Sync queued — waiting for device heartbeat…');
    } catch {
      toast.error('Network error');
      setSyncState('idle');
      setPolling(false);
    }
  }, [deviceSn]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Fingerprint className="w-7 h-7 text-blue-500" />
            Device Mappings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            Cross-reference device users with DRAIS learners &bull; Linked: {stats.linked} / Unlinked: {stats.unlinked}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => mutate()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Total Users on Device</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Linked to DRAIS</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{stats.linked}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Unlinked</p>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.unlinked}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <UserX className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters + Sync Trigger */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Device selector */}
        <select
          value={deviceSn}
          onChange={e => { setDeviceSn(e.target.value); setPage(1); setSyncState('idle'); }}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
        >
          <option value="">All Devices</option>
          {devices.map((d: any) => (
            <option key={d.sn} value={d.sn}>{d.device_name || d.sn}</option>
          ))}
        </select>

        {/* Status filter */}
        <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
          {[
            { key: '', label: 'All' },
            { key: 'linked', label: 'Linked' },
            { key: 'unlinked', label: 'Unlinked' },
          ].map(btn => (
            <button
              key={btn.key}
              onClick={() => { setStatusFilter(btn.key); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                statusFilter === btn.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by ID, name…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Force Sync Button */}
        <button
          onClick={startSync}
          disabled={!deviceSn || syncState === 'pending' || syncState === 'sent'}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            syncState === 'pending' || syncState === 'sent'
              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 cursor-wait'
              : syncState === 'acknowledged'
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          {syncState === 'pending' || syncState === 'sent' ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : syncState === 'acknowledged' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {syncState === 'idle' && 'Force Sync from Device'}
          {syncState === 'pending' && 'Waiting for heartbeat…'}
          {syncState === 'sent' && 'Device processing…'}
          {syncState === 'acknowledged' && 'Sync Complete'}
          {syncState === 'failed' && 'Retry Sync'}
        </button>
      </div>

      {/* Sync progress overlay */}
      {(syncState === 'pending' || syncState === 'sent') && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-4">
          <Loader className="w-6 h-6 text-blue-500 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {syncState === 'pending' ? 'Synchronizing…' : 'Device is uploading user list…'}
            </p>
            <p className="text-xs text-blue-500 dark:text-blue-500 mt-0.5">
              {syncState === 'pending'
                ? 'Waiting for K40 to pick up the command on its next heartbeat (within ~60s)'
                : 'The device is sending its enrolled user list. This table will refresh automatically.'}
            </p>
          </div>
          <div className="ml-auto">
            <div className="w-32 h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
              <div className={`h-full bg-blue-500 rounded-full transition-all duration-1000 ${
                syncState === 'pending' ? 'w-1/3 animate-pulse' : 'w-2/3 animate-pulse'
              }`} />
            </div>
          </div>
        </div>
      )}

      {/* User Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 mt-2 text-sm">Loading mappings…</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Fingerprint className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No device users found</p>
            <p className="text-sm mt-1">
              {deviceSn
                ? 'Click "Force Sync from Device" to fetch the user list from the K40'
                : 'Select a device above and sync to see enrolled users'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Learner / Staff</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class / Position</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map((u: any, i: number) => (
                  <tr key={`${u.device_user_id}-${u.device_sn}-${i}`}
                    className={`transition-colors ${
                      u.linked
                        ? 'hover:bg-green-50/50 dark:hover:bg-green-900/5'
                        : 'hover:bg-amber-50/50 dark:hover:bg-amber-900/5'
                    }`}>
                    <td className="px-4 py-2.5 font-mono font-bold text-gray-900 dark:text-white">
                      {u.device_user_id}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.person_name ? (
                        <span className="font-medium text-gray-900 dark:text-white">{u.person_name}</span>
                      ) : (
                        <span className="text-gray-400 italic">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.user_type === 'staff' || u.user_type === 'teacher'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {u.user_type === 'teacher' ? 'staff' : u.user_type || 'student'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                      {u.class_name || u.staff_position || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {u.linked ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-semibold">
                          <UserCheck className="w-3.5 h-3.5" /> Linked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                          <UserX className="w-3.5 h-3.5" /> Unlinked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">
                      {u.source === 'zk_mapping' ? 'ZK Sync' : 'Enrolled'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} &bull; {pagination.total} users
          </p>
          <div className="flex gap-2">
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
