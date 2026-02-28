'use client';

/**
 * Device Connection Modal
 *
 * Two-tab modal for:
 * 1. Device Connection: Configure device connection, test connection, save credentials
 * 2. Device Logs: View real-time access logs from device with auto-refresh
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface DeviceConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolId: number;
}

interface DeviceConfig {
  id: number;
  deviceName: string;
  deviceIp: string;
  devicePort: number;
  deviceUsername: string;
  deviceSerialNumber?: string;
  deviceType?: string;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  lastConnectionAttempt?: string;
  lastSuccessfulConnection?: string;
  lastErrorMessage?: string;
}

interface AccessLog {
  id: number;
  timestamp: string;
  userId: string;
  cardNumber: string;
  personName: string;
  accessResult: 'granted' | 'denied' | 'unknown';
  eventType: string;
  deviceName: string;
  deviceSerial: string;
}

type TabType = 'connection' | 'logs';

export default function DeviceConnectionModal({ isOpen, onClose, schoolId }: DeviceConnectionModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('connection');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Connection Tab State
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [formData, setFormData] = useState({
    deviceName: '',
    deviceIp: '',
    devicePort: 80,
    deviceUsername: '',
    devicePassword: ''
  });

  // Logs Tab State
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds
  const [logsLoading, setLogsLoading] = useState(false);

  // Load device configuration on mount
  useEffect(() => {
    if (isOpen) {
      loadDeviceConfig();
    }
  }, [isOpen]);

  // Auto-refresh logs interval
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (autoRefresh && activeTab === 'logs') {
      interval = setInterval(() => {
        fetchAccessLogs();
      }, refreshInterval * 1000);

      // Initial fetch
      fetchAccessLogs();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refreshInterval, activeTab]);

  const loadDeviceConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/device-config?schoolId=${schoolId}`);
      const data = await response.json();

      if (data.success && data.configured && data.data) {
        setConfig(data.data);
        setFormData({
          deviceName: data.data.deviceName,
          deviceIp: data.data.deviceIp,
          devicePort: data.data.devicePort,
          deviceUsername: data.data.deviceUsername,
          devicePassword: ''
        });
      } else {
        setConfig(null);
        setFormData({
          deviceName: 'Biometric Device',
          deviceIp: '',
          devicePort: 80,
          deviceUsername: 'admin',
          devicePassword: ''
        });
      }
    } catch (err) {
      setError(`Failed to load device configuration: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    if (!formData.deviceIp || !formData.devicePort || !formData.deviceUsername || !formData.devicePassword) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setTesting(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/device-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId,
          ...formData
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Device connected successfully! Device Type: ${data.data.deviceInfo?.deviceType || 'Unknown'}`);
        await loadDeviceConfig();
      } else {
        setError(`Connection failed: ${data.error}`);
      }
    } catch (err) {
      setError(`Error testing connection: ${err}`);
    } finally {
      setTesting(false);
    }
  };

  const saveDeviceConfig = async () => {
    if (!formData.deviceIp || !formData.devicePort || !formData.deviceUsername || !formData.devicePassword) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/device-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId,
          ...formData
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Device configuration saved and monitoring started!');
        await loadDeviceConfig();
      } else {
        setError(data.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError(`Error saving configuration: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessLogs = async () => {
    try {
      setLogsLoading(true);
      const response = await fetch(`/api/device-logs?schoolId=${schoolId}&limit=100&offset=0`);
      const data = await response.json();

      if (data.success) {
        setAccessLogs(data.data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch access logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 bg-green-50';
      case 'error':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getAccessResultBadge = (result: string) => {
    const baseClass = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    switch (result) {
      case 'granted':
        return `${baseClass} bg-green-100 text-green-800`;
      case 'denied':
        return `${baseClass} bg-red-100 text-red-800`;
      default:
        return `${baseClass} bg-gray-100 text-gray-800`;
    }
  };

  return (
    <Transition appear show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={React.Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black bg-opacity-50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform rounded-lg bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                  <Dialog.Title className="text-xl font-bold text-gray-900">Device Connection Management</Dialog.Title>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200">
                  <div className="flex space-x-8 px-6">
                    <button
                      onClick={() => setActiveTab('connection')}
                      className={`border-b-2 px-1 py-4 text-sm font-medium ${
                        activeTab === 'connection'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      Device Connection
                    </button>
                    <button
                      onClick={() => setActiveTab('logs')}
                      className={`border-b-2 px-1 py-4 text-sm font-medium ${
                        activeTab === 'logs'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      Device Logs
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  {/* Error Alert */}
                  {error && (
                    <div className="mb-4 flex items-start rounded-lg bg-red-50 p-4">
                      <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-3 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-700">{error}</div>
                    </div>
                  )}

                  {/* Success Alert */}
                  {success && (
                    <div className="mb-4 flex items-start rounded-lg bg-green-50 p-4">
                      <CheckIcon className="h-5 w-5 text-green-400 mr-3 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-green-700">{success}</div>
                    </div>
                  )}

                  {/* Connection Tab */}
                  {activeTab === 'connection' && (
                    <div className="space-y-4">
                      {config && (
                        <div className={`rounded-lg p-4 ${getStatusColor(config.connectionStatus)}`}>
                          <p className="font-semibold">
                            Connection Status: <span className="capitalize">{config.connectionStatus}</span>
                          </p>
                          {config.lastConnectionAttempt && (
                            <p className="text-sm mt-1">Last attempt: {new Date(config.lastConnectionAttempt).toLocaleString()}</p>
                          )}
                          {config.lastErrorMessage && (
                            <p className="text-sm mt-1">Error: {config.lastErrorMessage}</p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Device Name</label>
                          <input
                            type="text"
                            value={formData.deviceName}
                            onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            placeholder="e.g., Main Gate Biometric"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Device IP Address</label>
                          <input
                            type="text"
                            value={formData.deviceIp}
                            onChange={(e) => setFormData({ ...formData, deviceIp: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            placeholder="e.g., 192.168.1.100"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Device Port</label>
                          <input
                            type="number"
                            value={formData.devicePort}
                            onChange={(e) => setFormData({ ...formData, devicePort: parseInt(e.target.value) })}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            placeholder="80 or 443"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Username</label>
                          <input
                            type="text"
                            value={formData.deviceUsername}
                            onChange={(e) => setFormData({ ...formData, deviceUsername: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            placeholder="Device username"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Password</label>
                          <input
                            type="password"
                            value={formData.devicePassword}
                            onChange={(e) => setFormData({ ...formData, devicePassword: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            placeholder="Device password"
                          />
                        </div>
                      </div>

                      {/* Device Info Display */}
                      {config?.deviceSerialNumber && (
                        <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
                          <div>
                            <p className="text-xs text-gray-500">Device Type</p>
                            <p className="text-sm font-medium text-gray-900">{config.deviceType || 'Unknown'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Serial Number</p>
                            <p className="text-sm font-medium text-gray-900">{config.deviceSerialNumber}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Logs Tab */}
                  {activeTab === 'logs' && (
                    <div className="space-y-4">
                      {/* Auto-Refresh Controls */}
                      <div className="flex items-center space-x-4 rounded-lg bg-gray-50 p-4">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={(e) => setAutoRefresh(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Auto-refresh logs</span>
                        </label>

                        {autoRefresh && (
                          <div className="flex items-center space-x-2">
                            <label className="text-sm text-gray-600">Every</label>
                            <select
                              value={refreshInterval}
                              onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
                              className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
                            >
                              <option value={15}>15 seconds</option>
                              <option value={30}>30 seconds</option>
                              <option value={60}>1 minute</option>
                            </select>
                          </div>
                        )}

                        <button
                          onClick={fetchAccessLogs}
                          disabled={logsLoading}
                          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {logsLoading ? 'Refreshing...' : 'Refresh Now'}
                        </button>
                      </div>

                      {/* Logs Table */}
                      <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Timestamp</th>
                              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Person Name</th>
                              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Card Number</th>
                              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">User ID</th>
                              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {accessLogs.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                                  No access logs available
                                </td>
                              </tr>
                            ) : (
                              accessLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 text-sm text-gray-900">{new Date(log.timestamp).toLocaleString()}</td>
                                  <td className="px-6 py-4 text-sm text-gray-900">{log.personName || '-'}</td>
                                  <td className="px-6 py-4 text-sm text-gray-900">{log.cardNumber || '-'}</td>
                                  <td className="px-6 py-4 text-sm text-gray-900">{log.userId || '-'}</td>
                                  <td className="px-6 py-4 text-sm">
                                    <span className={getAccessResultBadge(log.accessResult)}>{log.accessResult}</span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {accessLogs.length > 0 && (
                        <p className="text-xs text-gray-500">Showing {accessLogs.length} most recent logs</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
                  {activeTab === 'connection' && (
                    <>
                      <button
                        onClick={testConnection}
                        disabled={testing || !formData.deviceIp}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {testing ? 'Testing...' : 'Test Connection'}
                      </button>
                      <button
                        onClick={saveDeviceConfig}
                        disabled={loading || !formData.deviceIp}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading ? 'Saving...' : 'Save & Connect'}
                      </button>
                    </>
                  )}

                  <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
