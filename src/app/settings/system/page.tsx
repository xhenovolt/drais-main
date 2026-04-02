"use client";
import React from 'react';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/apiClient';
import { Database, Cloud, Radio, Clock, RefreshCw, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const isOk = ['connected', 'configured', 'ok'].includes(status);
  const isFail = ['failed', 'error', 'not_configured'].includes(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
      isOk ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
      isFail ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    }`}>
      {isOk ? <CheckCircle className="w-3 h-3" /> : isFail ? <XCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {status}
    </span>
  );
}

export default function SystemStatusPage() {
  const { data, isLoading, mutate } = useSWR('/api/system-status', swrFetcher, { refreshInterval: 30000 });
  const checks = data?.checks || {};

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Status</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Real-time health monitoring for DRAIS infrastructure</p>
        </div>
        <button
          onClick={() => mutate()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Database */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Database</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {checks.database?.latency ? `${checks.database.latency}ms latency` : 'Checking...'}
              </p>
            </div>
            <StatusBadge status={checks.database?.status || 'unknown'} />
          </div>

          {/* Cloudinary */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <Cloud className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Cloudinary</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {checks.cloudinary?.cloud_name ? `Cloud: ${checks.cloudinary.cloud_name}` : 'Not configured'}
              </p>
            </div>
            <StatusBadge status={checks.cloudinary?.status || 'unknown'} />
          </div>

          {/* Devices */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
              <Radio className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Devices</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {checks.devices?.status === 'ok'
                  ? `${checks.devices.online} online / ${checks.devices.total} total`
                  : checks.devices?.error || 'Checking...'}
              </p>
            </div>
            <StatusBadge status={
              checks.devices?.status === 'ok'
                ? checks.devices.online > 0 ? 'ok' : (checks.devices.total > 0 ? 'offline' : 'ok')
                : checks.devices?.status || 'unknown'
            } />
          </div>

          {/* Last Heartbeat */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Last Heartbeat</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {checks.lastHeartbeat
                  ? new Date(checks.lastHeartbeat).toLocaleString()
                  : 'No heartbeat recorded'}
              </p>
            </div>
          </div>

          {/* Timestamp */}
          {data?.timestamp && (
            <p className="text-xs text-gray-400 text-center">
              Checked at {new Date(data.timestamp).toLocaleString()} • Auto-refreshes every 30s
            </p>
          )}
        </div>
      )}
    </div>
  );
}
