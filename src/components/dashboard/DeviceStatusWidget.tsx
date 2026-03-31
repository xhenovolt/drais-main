'use client';

import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Server, Wifi, WifiOff, ArrowRight } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

/**
 * Dashboard Device Status Widget
 *
 * Shows: Total / Online / Offline device counts
 * Links to: /admin/devices for full monitor
 * Auto-refreshes every 30s via SWR
 */
export default function DeviceStatusWidget() {
  const { data, isLoading } = useSWR('/api/devices/summary', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  const summary = data?.data || { total: 0, online: 0, offline: 0 };
  const hasDevices = summary.total > 0;
  const allOnline = hasDevices && summary.offline === 0;

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    );
  }

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-xl border overflow-hidden ${
      allOnline
        ? 'border-green-200 dark:border-green-800'
        : summary.offline > 0
          ? 'border-red-200 dark:border-red-800'
          : 'border-gray-200 dark:border-gray-700'
    }`}>
      {/* Thin status bar */}
      <div className={`h-1 ${allOnline ? 'bg-green-500' : summary.offline > 0 ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'}`} />

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Server className="w-4 h-4" />
            Devices
          </h3>
          <Link
            href="/attendance/devices/monitor"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            Monitor <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {!hasDevices ? (
          <div className="text-center">
            <p className="text-sm text-red-500 dark:text-red-400 font-medium">No devices registered</p>
            <p className="text-xs text-gray-400 mt-1">Point a ZKTeco device at this server</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{summary.online}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                <Wifi className="w-3 h-3" /> Online
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.offline}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
