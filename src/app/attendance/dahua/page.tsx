"use client";

import React, { useState, useEffect } from 'react';
import { 
  ScanFace, 
  RefreshCw, 
  Plus, 
  Settings, 
  Trash2, 
  Activity, 
  Wifi, 
  WifiOff,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Server,
  Fingerprint,
  History,
  ChevronRight,
  Power,
  PowerOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

interface DahuaDevice {
  id: number;
  device_name: string;
  device_code: string;
  ip_address: string;
  port: number;
  api_url: string;
  device_type: string;
  protocol: string;
  status: string;
  last_sync: string | null;
  last_sync_status: string | null;
  auto_sync_enabled: number;
  sync_interval_minutes: number;
  late_threshold_minutes: number;
  today_syncs: number;
  today_records: number;
}

interface SyncHistory {
  id: number;
  device_id: number;
  sync_type: string;
  records_fetched: number;
  records_processed: number;
  records_failed: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_details: string | null;
}

const DahuaDevicesPage: React.FC = () => {
  const [devices, setDevices] = useState<DahuaDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DahuaDevice | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Form state for adding new device
  const [formData, setFormData] = useState({
    device_name: '',
    device_code: '',
    ip_address: '',
    port: 80,
    api_url: '/cgi-bin/attendanceRecord.cgi?action=getRecords',
    username: '',
    password: '',
    device_type: 'attendance',
    protocol: 'http',
    auto_sync_enabled: true,
    sync_interval_minutes: 15,
    late_threshold_minutes: 30
  });

  // Fetch devices
  const { data: devicesData, mutate: refreshDevices } = useSWR(
    '/api/attendance/dahua',
    fetcher,
    { refreshInterval: 30000 }
  );

  useEffect(() => {
    if (devicesData && typeof devicesData === 'object' && 'data' in devicesData) {
      setDevices((devicesData as any).data);
      setIsLoading(false);
    }
  }, [devicesData]);

  // Fetch sync history when device selected
  useEffect(() => {
    if (selectedDevice) {
      fetch(`/api/attendance/dahua/${selectedDevice.id}/sync?limit=10`)
        .then(res => res.json())
        .then(data => {
          if (data.data) {
            setSyncHistory(data.data);
          }
        })
        .catch(console.error);
    }
  }, [selectedDevice]);

  const handleAddDevice = async () => {
    try {
      const response = await fetch('/api/attendance/dahua', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Device added successfully');
        setShowAddModal(false);
        refreshDevices();
        setFormData({
          device_name: '',
          device_code: '',
          ip_address: '',
          port: 80,
          api_url: '/cgi-bin/attendanceRecord.cgi?action=getRecords',
          username: '',
          password: '',
          device_type: 'attendance',
          protocol: 'http',
          auto_sync_enabled: true,
          sync_interval_minutes: 15,
          late_threshold_minutes: 30
        });
      } else {
        toast.error(data.error || 'Failed to add device');
      }
    } catch (error) {
      toast.error('Failed to add device');
    }
  };

  const handleSync = async (device: DahuaDevice) => {
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/attendance/dahua/${device.id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mock: true }) // Use mock data for testing
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Synced ${data.data.processed} records`);
        refreshDevices();
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteDevice = async (device: DahuaDevice) => {
    if (!confirm(`Are you sure you want to delete "${device.device_name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/attendance/dahua/${device.id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Device deleted');
        refreshDevices();
        if (selectedDevice?.id === device.id) {
          setSelectedDevice(null);
        }
      } else {
        toast.error(data.error || 'Failed to delete device');
      }
    } catch (error) {
      toast.error('Failed to delete device');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'inactive':
        return <XCircle className="w-5 h-5 text-gray-400" />;
      case 'offline':
        return <WifiOff className="w-5 h-5 text-red-500" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getSyncStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">Synced</span>;
      case 'failed':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">Failed</span>;
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">Pending</span>;
      case 'partial':
        return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">Partial</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">Never</span>;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              🔐 Dahua Device Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage and monitor Dahua biometric attendance devices
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Device
          </button>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ScanFace className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Devices</p>
              <p className="text-2xl font-bold">{devices.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">{devices.filter(d => d.status === 'active').length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Fingerprint className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Today's Records</p>
              <p className="text-2xl font-bold">{devices.reduce((sum, d) => sum + (d.today_records || 0), 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <RefreshCw className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Today's Syncs</p>
              <p className="text-2xl font-bold">{devices.reduce((sum, d) => sum + (d.today_syncs || 0), 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Devices List */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Devices</h2>
            </div>

            {devices.length === 0 ? (
              <div className="p-8 text-center">
                <ScanFace className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No devices configured</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 text-blue-600 hover:text-blue-700"
                >
                  Add your first device
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {devices.map((device) => (
                  <motion.div
                    key={device.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={clsx(
                      'p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors',
                      selectedDevice?.id === device.id && 'bg-blue-50 dark:bg-blue-900/20'
                    )}
                    onClick={() => setSelectedDevice(device)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={clsx(
                          'p-2 rounded-lg',
                          device.status === 'active' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'
                        )}>
                          {device.status === 'active' ? (
                            <Wifi className="w-5 h-5 text-green-600" />
                          ) : (
                            <WifiOff className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-medium">{device.device_name}</h3>
                          <p className="text-sm text-gray-500">{device.ip_address}:{device.port}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {getSyncStatusBadge(device.last_sync_status)}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSync(device);
                          }}
                          disabled={isSyncing}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Sync Now"
                        >
                          <RefreshCw className={clsx('w-5 h-5', isSyncing && 'animate-spin')} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDevice(device);
                          }}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Device"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Device Details / Sync History */}
        <div>
          {selectedDevice ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold">Device Details</h2>
              </div>

              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedDevice.status)}
                    <span className="font-medium capitalize">{selectedDevice.status}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Last Sync</span>
                  <span className="font-medium">{formatDateTime(selectedDevice.last_sync)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Protocol</span>
                  <span className="font-medium uppercase">{selectedDevice.protocol}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Auto Sync</span>
                  <span className={clsx(
                    'px-2 py-1 text-xs rounded-full',
                    selectedDevice.auto_sync_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  )}>
                    {selectedDevice.auto_sync_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Sync Interval</span>
                  <span className="font-medium">{selectedDevice.sync_interval_minutes} min</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Late Threshold</span>
                  <span className="font-medium">{selectedDevice.late_threshold_minutes} min</span>
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                {/* Sync History */}
                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <History className="w-4 h-4" />
                    Recent Syncs
                  </h3>
                  
                  {syncHistory.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No sync history</p>
                  ) : (
                    <div className="space-y-2">
                      {syncHistory.slice(0, 5).map((sync) => (
                        <div
                          key={sync.id}
                          className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium capitalize">{sync.sync_type}</span>
                            {sync.status === 'success' ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : sync.status === 'failed' ? (
                              <XCircle className="w-4 h-4 text-red-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-orange-500" />
                            )}
                          </div>
                          <div className="text-gray-500">
                            {sync.records_processed}/{sync.records_fetched} records
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatDateTime(sync.started_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
              <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Select a device to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Device Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-lg mx-4"
            >
              <h2 className="text-xl font-bold mb-4">Add Dahua Device</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Device Name</label>
                  <input
                    type="text"
                    value={formData.device_name}
                    onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    placeholder="Main Gate Scanner"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">IP Address</label>
                    <input
                      type="text"
                      value={formData.ip_address}
                      onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Port</label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">API URL</label>
                  <input
                    type="text"
                    value={formData.api_url}
                    onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    placeholder="/cgi-bin/attendanceRecord.cgi?action=getRecords"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Username</label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                      placeholder="admin"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Password</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Protocol</label>
                    <select
                      value={formData.protocol}
                      onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    >
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Late Threshold (min)</label>
                    <input
                      type="number"
                      value={formData.late_threshold_minutes}
                      onChange={(e) => setFormData({ ...formData, late_threshold_minutes: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDevice}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Device
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DahuaDevicesPage;
