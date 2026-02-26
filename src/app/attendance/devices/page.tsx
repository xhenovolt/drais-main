"use client";

import React from 'react';
import DeviceLogsView from '@/components/attendance/DeviceLogsView';
import { FileSearch, RefreshCw } from 'lucide-react';

export default function DeviceLogsPage() {
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <FileSearch className="w-7 h-7" />
            Device Logs
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View and manage biometric device attendance logs
          </p>
        </div>
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Device Logs View */}
      <DeviceLogsView refreshKey={refreshKey} />
    </div>
  );
}
