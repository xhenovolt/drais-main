"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { 
  X, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  Server,
  Shield
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';

interface DeviceConnectionModalProps {
  open: boolean;
  onClose: () => void;
  device?: any; // Existing device to edit
  onSuccess: () => void;
}

interface DeviceFormData {
  device_name: string;
  device_type: 'dahua' | 'zkteco' | 'other';
  ip_address: string;
  port: number;
  username: string;
  password: string;
  protocol: 'http' | 'https';
  api_url: string;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  poll_interval_seconds: number;
  late_threshold_minutes: number;
}

const DeviceConnectionModal: React.FC<DeviceConnectionModalProps> = ({
  open,
  onClose,
  device,
  onSuccess
}) => {
  const [formData, setFormData] = useState<DeviceFormData>({
    device_name: '',
    device_type: 'dahua',
    ip_address: '',
    port: 80,
    username: '',
    password: '',
    protocol: 'http',
    api_url: '/cgi-bin/attendanceRecord.cgi?action=getRecords',
    auto_sync_enabled: true,
    sync_interval_minutes: 15,
    poll_interval_seconds: 60,
    late_threshold_minutes: 30
  });

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    response_time?: number;
  } | null>(null);

  // Populate form if editing existing device
  useEffect(() => {
    if (device) {
      setFormData({
        device_name: device.device_name || '',
        device_type: device.device_type || 'dahua',
        ip_address: device.ip_address || '',
        port: device.port || 80,
        username: device.username || '',
        password: device.password || '',
        protocol: device.protocol || 'http',
        api_url: device.api_url || '/cgi-bin/attendanceRecord.cgi?action=getRecords',
        auto_sync_enabled: device.auto_sync_enabled ?? true,
        sync_interval_minutes: device.sync_interval_minutes || 15,
        poll_interval_seconds: device.poll_interval_seconds || 60,
        late_threshold_minutes: device.late_threshold_minutes || 30
      });
    } else {
      // Reset form for new device
      setFormData({
        device_name: '',
        device_type: 'dahua',
        ip_address: '',
        port: 80,
        username: '',
        password: '',
        protocol: 'http',
        api_url: '/cgi-bin/attendanceRecord.cgi?action=getRecords',
        auto_sync_enabled: true,
        sync_interval_minutes: 15,
        poll_interval_seconds: 60,
        late_threshold_minutes: 30
      });
    }
    setTestResult(null);
  }, [device, open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked :
              type === 'number' ? parseInt(value) || 0 : value
    }));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/attendance/devices/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_type: formData.device_type,
          ip_address: formData.ip_address,
          port: formData.port,
          username: formData.username,
          password: formData.password,
          protocol: formData.protocol,
          api_url: formData.api_url
        })
      });

      const result = await response.json();
      
      setTestResult({
        success: result.success,
        message: result.message,
        response_time: result.data?.response_time_ms
      });

      if (!result.success) {
        toast.error(result.message);
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.message || 'Connection test failed'
      });
      toast.error('Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.device_name || !formData.ip_address) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSaving(true);

    try {
      const url = device 
        ? `/api/attendance/devices/${device.id}?source=${device.source || 'dahua'}`
        : '/api/attendance/devices';
      
      const method = device ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        toast.success(device ? 'Device updated successfully' : 'Device added successfully');
        onSuccess();
        onClose();
      } else {
        toast.error(result.error || 'Failed to save device');
      }
    } catch (error: any) {
      toast.error('Failed to save device');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <Server className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white">
                      {device ? 'Edit Device' : 'Connect Device'}
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                {/* Form */}
                <div className="space-y-4">
                  {/* Device Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Device Name *
                    </label>
                    <input
                      type="text"
                      name="device_name"
                      value={formData.device_name}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                      placeholder="Main Gate Scanner"
                    />
                  </div>

                  {/* Device Type */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Device Type *
                      </label>
                      <select
                        name="device_type"
                        value={formData.device_type}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                      >
                        <option value="dahua">Dahua</option>
                        <option value="zkteco">ZKTeco</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Protocol
                      </label>
                      <select
                        name="protocol"
                        value={formData.protocol}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                      >
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                      </select>
                    </div>
                  </div>

                  {/* IP and Port */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        IP Address *
                      </label>
                      <input
                        type="text"
                        name="ip_address"
                        value={formData.ip_address}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                        placeholder="192.168.1.100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Port *
                      </label>
                      <input
                        type="number"
                        name="port"
                        value={formData.port}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                        placeholder="80"
                      />
                    </div>
                  </div>

                  {/* Credentials */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                        placeholder="admin"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  {/* API URL (for Dahua) */}
                  {formData.device_type === 'dahua' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        API URL
                      </label>
                      <input
                        type="text"
                        name="api_url"
                        value={formData.api_url}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                        placeholder="/cgi-bin/attendanceRecord.cgi?action=getRecords"
                      />
                    </div>
                  )}

                  {/* Sync Settings */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Poll Interval (sec)
                      </label>
                      <input
                        type="number"
                        name="poll_interval_seconds"
                        value={formData.poll_interval_seconds}
                        onChange={handleInputChange}
                        min={10}
                        max={3600}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Sync Interval (min)
                      </label>
                      <input
                        type="number"
                        name="sync_interval_minutes"
                        value={formData.sync_interval_minutes}
                        onChange={handleInputChange}
                        min={1}
                        max={1440}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Late Threshold (min)
                      </label>
                      <input
                        type="number"
                        name="late_threshold_minutes"
                        value={formData.late_threshold_minutes}
                        onChange={handleInputChange}
                        min={1}
                        max={120}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
                      />
                    </div>
                  </div>

                  {/* Auto Sync Toggle */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="auto_sync_enabled"
                      id="auto_sync_enabled"
                      checked={formData.auto_sync_enabled}
                      onChange={handleInputChange}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <label htmlFor="auto_sync_enabled" className="text-sm text-gray-700 dark:text-gray-300">
                      Enable automatic background sync
                    </label>
                  </div>
                </div>

                {/* Test Connection Result */}
                {testResult && (
                  <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
                    testResult.success 
                      ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                  }`}>
                    {testResult.success ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    <span className="flex-1">{testResult.message}</span>
                    {testResult.response_time && (
                      <span className="text-sm opacity-75">({testResult.response_time}ms)</span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 flex gap-3 justify-end">
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !formData.ip_address}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTesting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Test Connection
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4" />
                    )}
                    {device ? 'Update Device' : 'Save & Connect'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default DeviceConnectionModal;
