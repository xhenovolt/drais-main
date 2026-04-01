'use client';

import React, { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Activity, Wifi, WifiOff, Server, Clock, MapPin, Hash,
  ArrowUpDown, FileSearch, Fingerprint, Settings, Users, Loader, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Device {
  id: number;
  sn: string;
  device_name: string | null;
  model_name: string | null;
  location: string | null;
  last_seen: string;
  ip_address: string | null;
  is_online: boolean;
  status: string;
  firmware_version: string | null;
  push_version: string | null;
  last_activity: string | null;
  seconds_ago: number;
  created_at: string;
}

function formatTimeAgo(seconds: number): string {
  if (seconds <= 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DeviceMonitorPage() {
  const { data, isLoading, error } = useSWR('/api/devices/list', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  const { data: summaryData } = useSWR('/api/devices/summary', fetcher, {
    refreshInterval: 30000,
  });

  const devices: Device[] = data?.data || [];
  const summary = summaryData?.data || { total: 0, online: 0, offline: 0 };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Activity className="w-6 h-6 text-blue-600" />
                Device Monitor
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Real-time device heartbeat tracking &bull; Auto-refreshes every 30s
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Quick links */}
              <div className="hidden sm:flex items-center gap-2">
                <Link href="/attendance/devices/logs" className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1">
                  <FileSearch className="w-3.5 h-3.5" /> Logs
                </Link>
                <Link href="/attendance/devices/commands" className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5" /> Commands
                </Link>
                <Link href="/attendance/devices/user-mapping" className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1">
                  <Fingerprint className="w-3.5 h-3.5" /> Mapping
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">LIVE</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Devices</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{summary.total}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Server className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Online</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{summary.online}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Wifi className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Offline</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{summary.offline}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <WifiOff className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Devices Grid */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-500 dark:text-gray-400 mt-3 text-sm">Loading devices…</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800">
            <WifiOff className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-red-600 dark:text-red-400 mt-3 font-medium">Failed to load devices</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Check server logs for details</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
            <Server className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto" />
            <p className="text-gray-600 dark:text-gray-400 mt-3 font-medium">No devices registered</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Devices auto-register on first heartbeat. Point your ZKTeco device at this server.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceCard({ device }: { device: Device }) {
  const isOnline = device.seconds_ago <= 120;
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'sent' | 'acknowledged' | 'failed'>('idle');
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);

  // Poll sync status when a sync is in progress
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attendance/zk/devices/sync-members?device_sn=${device.sn}`);
        const json = await res.json();
        if (!json.success) return;

        const status = json.sync_status;
        setSyncState(status);
        setMemberCount(json.member_count ?? null);

        if (status === 'acknowledged' || status === 'failed' || status === 'expired' || status === 'idle') {
          setPolling(false);
          if (status === 'acknowledged') {
            showToast('success', `${json.member_count} members synced from ${device.device_name || device.sn}`);
          } else if (status === 'failed' || status === 'expired') {
            showToast('error', 'Member sync failed — device may be offline');
          }
        }
      } catch {
        // silent
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [polling, device.sn, device.device_name]);

  const startSync = useCallback(async () => {
    setSyncState('pending');
    setPolling(true);
    try {
      await apiFetch('/api/attendance/zk/devices/sync-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.sn }),
        successMessage: 'Member sync queued — waiting for heartbeat…',
      });
    } catch (err: any) {
      setSyncState('idle');
      setPolling(false);
    }
  }, [device.sn]);

  const syncLabel = {
    idle: 'View Members',
    pending: 'Waiting for heartbeat…',
    sent: 'Device processing…',
    acknowledged: `${memberCount ?? '?'} members synced`,
    failed: 'Sync failed — retry?',
  }[syncState];

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-xl border overflow-hidden transition-all ${
      isOnline
        ? 'border-green-200 dark:border-green-800 shadow-sm'
        : 'border-red-200 dark:border-red-800/50 opacity-80'
    }`}>
      {/* Status bar at top */}
      <div className={`h-1 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />

      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isOnline
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              {isOnline
                ? <Wifi className="w-5 h-5 text-green-600 dark:text-green-400" />
                : <WifiOff className="w-5 h-5 text-red-500 dark:text-red-400" />}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                {device.device_name || device.sn}
              </h3>
              {device.device_name && (
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{device.sn}</p>
              )}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
            isOnline
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Detail rows */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>
              Last seen{' '}
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {formatTimeAgo(device.seconds_ago)}
              </span>
            </span>
          </div>
          {device.ip_address && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <MapPin className="w-4 h-4 flex-shrink-0" />
              <span className="font-mono text-xs">{device.ip_address}</span>
            </div>
          )}
          {device.location && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Settings className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">{device.location}</span>
            </div>
          )}
          {device.model_name && (
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Hash className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs">{device.model_name}</span>
            </div>
          )}
        </div>

        {/* Sync Members Button */}
        <button
          onClick={startSync}
          disabled={syncState === 'pending' || syncState === 'sent'}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            syncState === 'pending' || syncState === 'sent'
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 cursor-wait'
              : syncState === 'acknowledged'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'
              : syncState === 'failed'
              ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
              : 'bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400'
          }`}
        >
          {syncState === 'pending' || syncState === 'sent' ? (
            <Loader className="w-3.5 h-3.5 animate-spin" />
          ) : syncState === 'acknowledged' ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : syncState === 'failed' ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <Users className="w-3.5 h-3.5" />
          )}
          {syncLabel}
        </button>
      </div>
    </div>
  );
}
