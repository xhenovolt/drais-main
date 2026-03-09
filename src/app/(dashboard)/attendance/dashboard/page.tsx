'use client';

/**
 * Example Attendance Management Page
 * 
 * Demonstrates how to integrate the attendance module into your application
 * 
 * Features:
 * - Device management
 * - Log processing
 * - Real-time analytics
 * - Attendance tracking
 */

import React, { useState } from 'react';
import AttendanceDashboard from '@/components/attendance/AttendanceDashboard';
import DeviceManagementModal from '@/components/attendance/DeviceManagementModal';
import { toast } from 'react-hot-toast';

export default function AttendancePage() {
  const SCHOOL_ID = 1; // Get from session/context in real app
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-6 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">Attendance Management System</h1>
          <p className="text-blue-100">
            Real-time biometric device integration and attendance tracking
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div>
        <AttendanceDashboard schoolId={SCHOOL_ID} />
      </div>

      {/* Device Management Modal */}
      <DeviceManagementModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        schoolId={SCHOOL_ID}
        onDeviceAdded={() => {
          toast.success('Device added successfully');
          setIsDeviceModalOpen(false);
        }}
      />

      {/* Quick Links / Info Panel */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {/* Quick Start Guide */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              🚀 Quick Start
            </h3>
            <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>1. Click "Devices" to add your first device</li>
              <li>2. Enter device IP and test connection</li>
              <li>3. Click "Fetch Logs" to retrieve data</li>
              <li>4. Click "Process Logs" to match with students</li>
              <li>5. View analytics on the dashboard</li>
            </ol>
          </div>

          {/* Supported Devices */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              📱 Supported Devices
            </h3>
            <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
              <li>✓ Dahua (facial recognition)</li>
              <li>✓ ZKTeco (fingerprint)</li>
              <li>✓ U-Attendance (card reader)</li>
              <li>✓ Other HTTPS/HTTP APIs</li>
              <li>✓ Custom integrations</li>
            </ul>
          </div>

          {/* Key Features */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              ⭐ Key Features
            </h3>
            <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
              <li>✓ Real-time log syncing</li>
              <li>✓ Automatic matching</li>
              <li>✓ Rich analytics</li>
              <li>✓ Multi-device support</li>
              <li>✓ Duplicate prevention</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
