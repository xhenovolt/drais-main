'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Device {
  id: number;
  device_name: string;
  ip_address: string;
  port?: number;
  device_type: string;
  status: 'online' | 'offline' | 'error';
  last_sync?: string;
  sync_status?: string;
}

interface DeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolId: number;
  onDeviceAdded?: (device: Device) => void;
}

export default function DeviceManagementModal({
  isOpen,
  onClose,
  schoolId,
  onDeviceAdded,
}: DeviceModalProps) {
  const [step, setStep] = useState<'list' | 'add' | 'test'>('list');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    device_name: '',
    ip_address: '',
    port: 80,
    device_type: 'dahua',
    location_name: '',
  });

  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    response_time?: number;
  } | null>(null);

  const [testing, setTesting] = useState(false);

  // Load devices when modal opens
  React.useEffect(() => {
    if (isOpen && step === 'list') {
      loadDevices();
    }
  }, [isOpen, step]);

  const loadDevices = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/attendance/devices?school_id=${schoolId}`
      );
      const data = await response.json();
      if (data.success) {
        setDevices(data.data);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const response = await fetch(
        '/api/attendance/devices/test-connection',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );
      const data = await response.json();
      setTestResult(data);
      
      if (!data.success) {
        toast.error(data.message || 'Connection failed');
      } else {
        toast.success('Device connected successfully!');
      }
    } catch (error) {
      console.error('Connection test error:', error);
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleAddDevice = async () => {
    if (!testResult?.success) {
      toast.error('Please test connection first');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        '/api/attendance/devices',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: schoolId,
            ...formData,
          }),
        }
      );
      const data = await response.json();

      if (data.success) {
        toast.success('Device added successfully');
        setFormData({
          device_name: '',
          ip_address: '',
          port: 80,
          device_type: 'dahua',
          location_name: '',
        });
        setTestResult(null);
        setStep('list');
        loadDevices();
        if (onDeviceAdded && data.data) {
          onDeviceAdded(data.data);
        }
      } else {
        toast.error(data.error || 'Failed to add device');
      }
    } catch (error) {
      console.error('Error adding device:', error);
      toast.error('Failed to add device');
    } finally {
      setLoading(false);
    }
  };

  const handleFetchLogs = async (deviceId: number) => {
    try {
      setLoading(true);
      const response = await fetch(
        '/api/attendance/devices/fetch-logs',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: deviceId,
            force_refresh: true,
          }),
        }
      );
      const data = await response.json();

      if (data.success) {
        toast.success(
          `Fetched ${data.stored_count} logs from device`
        );
        loadDevices();
      } else {
        toast.error(data.error || 'Failed to fetch logs');
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-96 overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 p-6 sticky top-0 bg-white dark:bg-slate-900">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  {step === 'list'
                    ? 'Attendance Devices'
                    : step === 'add'
                    ? 'Add New Device'
                    : 'Test Connection'}
                </h2>
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {step === 'list' ? (
                  <div className="space-y-4">
                    {loading? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      </div>
                    ) : devices.length > 0 ? (
                      <>
                        {devices.map((device) => (
                          <div
                            key={device.id}
                            className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {device.status === 'online' ? (
                                  <Wifi className="w-4 h-4 text-green-500" />
                                ) : (
                                  <WifiOff className="w-4 h-4 text-red-500" />
                                )}
                                <h3 className="font-medium text-slate-900 dark:text-white">
                                  {device.device_name}
                                </h3>
                                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                  {device.device_type}
                                </span>
                              </div>
                              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {device.ip_address}:{device.port || 80}
                              </p>
                            </div>
                            <button
                              onClick={() => handleFetchLogs(device.id)}
                              disabled={loading}
                              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors text-sm"
                            >
                              Fetch Logs
                            </button>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                        No devices configured yet
                      </p>
                    )}

                    <button
                      onClick={() => {
                        setStep('add');
                        setTestResult(null);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-slate-700 dark:text-slate-300"
                    >
                      <Plus className="w-5 h-5" />
                      Add New Device
                    </button>
                  </div>
                ) : step === 'add' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Device Name
                      </label>
                      <input
                        type="text"
                        value={formData.device_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            device_name: e.target.value,
                          })
                        }
                        placeholder="e.g., Main Gate"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          IP Address
                        </label>
                        <input
                          type="text"
                          value={formData.ip_address}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              ip_address: e.target.value,
                            })
                          }
                          placeholder="192.168.1.100"
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Port
                        </label>
                        <input
                          type="number"
                          value={formData.port}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              port: parseInt(e.target.value),
                            })
                          }
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Device Type
                      </label>
                      <select
                        value={formData.device_type}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            device_type: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="dahua">Dahua</option>
                        <option value="zkteco">ZKTeco</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Location Name
                      </label>
                      <input
                        type="text"
                        value={formData.location_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            location_name: e.target.value,
                          })
                        }
                        placeholder="e.g., Entrance, Classroom 1A"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {testResult && (
                      <div
                        className={`p-3 rounded-lg flex items-start gap-3 ${
                          testResult.success
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                        }`}
                      >
                        {testResult.success ? (
                          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p
                            className={`text-sm font-medium ${
                              testResult.success
                                ? 'text-green-900 dark:text-green-200'
                                : 'text-red-900 dark:text-red-200'
                            }`}
                          >
                            {testResult.message}
                          </p>
                          {testResult.response_time && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              Response time: {testResult.response_time}ms
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3 pt-4">
                      <button
                        onClick={() => setStep('list')}
                        className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleTestConnection}
                        disabled={!formData.ip_address || testing}
                        className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                        {testing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          'Test Connection'
                        )}
                      </button>
                      <button
                        onClick={handleAddDevice}
                        disabled={!testResult?.success || loading}
                        className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                      >
                        {loading ? 'Adding...' : 'Add Device'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
