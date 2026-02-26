"use client";
import React, { useState, useEffect } from 'react';
import { Fingerprint, Plus, RefreshCw, Settings, Trash2, CheckCircle, XCircle, Clock, Search, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';
import clsx from 'clsx';

const BiometricDevicesPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);

  // Fetch devices
  const { data: devicesData, mutate: mutateDevices } = useSWR('/api/biometric-devices', fetcher);
  const devices = (devicesData as any)?.data || [];

  // Fetch fingerprints
  const { data: fingerprintsData } = useSWR('/api/fingerprints', fetcher);
  const fingerprints = (fingerprintsData as any)?.data || [];

  // Filter devices based on search
  const filteredDevices = devices.filter((device: any) => {
    const name = device.name?.toLowerCase() || '';
    const location = device.location?.toLowerCase() || '';
    return name.includes(searchQuery.toLowerCase()) || location.includes(searchQuery.toLowerCase());
  });

  const handleSync = async (deviceId: number) => {
    setSyncing(deviceId);
    try {
      const response = await fetch('/api/attendance/biometric/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId })
      });

      if (response.ok) {
        toast.success('Sync completed successfully');
        mutateDevices();
      } else {
        toast.error('Sync failed');
      }
    } catch (error) {
      toast.error(`Error: ${error}`);
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async (deviceId: number) => {
    if (!confirm('Are you sure you want to delete this device?')) return;

    try {
      const response = await fetch(`/api/biometric-devices/${deviceId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Device deleted successfully');
        mutateDevices();
      } else {
        toast.error('Failed to delete device');
      }
    } catch (error) {
      toast.error(`Error: ${error}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-700';
      case 'offline': return 'bg-gray-100 text-gray-700';
      case 'syncing': return 'bg-blue-100 text-blue-700';
      case 'error': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              🔐 Biometric Devices
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage fingerprint scanners and biometric devices
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Device
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Fingerprint className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Devices</p>
              <p className="text-2xl font-bold">{devices.length}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Online</p>
              <p className="text-2xl font-bold">{devices.filter((d: any) => d.status === 'online').length}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Offline</p>
              <p className="text-2xl font-bold">{devices.filter((d: any) => d.status === 'offline').length}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Smartphone className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Enrolled Fingers</p>
              <p className="text-2xl font-bold">{fingerprints.length}</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="card p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
        </div>

        {/* Devices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredDevices.map((device: any) => (
              <motion.div
                key={device.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="card p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <Fingerprint className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{device.name}</h3>
                      <p className="text-sm text-gray-500">{device.location}</p>
                    </div>
                  </div>
                  <span className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
                    getStatusColor(device.status)
                  )}>
                    {device.status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {device.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Device ID</span>
                    <span className="font-medium">{device.device_id}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Enrolled</span>
                    <span className="font-medium">{device.enrolled_count || 0} students</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Last Sync</span>
                    <span className="font-medium">{device.last_sync || 'Never'}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-4 border-t">
                  <button
                    onClick={() => handleSync(device.id)}
                    disabled={syncing === device.id}
                    className="flex-1 btn-secondary text-sm flex items-center justify-center gap-1"
                  >
                    {syncing === device.id ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Sync
                  </button>
                  <button className="btn-secondary text-sm flex items-center justify-center gap-1">
                    <Settings className="w-3 h-3" />
                    Settings
                  </button>
                  <button
                    onClick={() => handleDelete(device.id)}
                    className="btn-secondary text-sm flex items-center justify-center gap-1 text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredDevices.length === 0 && (
          <div className="text-center py-12">
            <Fingerprint className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No devices found</p>
          </div>
        )}

        {/* Add Device Modal */}
        {showAddModal && (
          <AddDeviceModal
            onClose={() => setShowAddModal(false)}
            onSuccess={() => {
              setShowAddModal(false);
              mutateDevices();
            }}
          />
        )}
      </div>
    </div>
  );
};

// Add Device Modal Component
const AddDeviceModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [location, setLocation] = useState('');
  const [deviceType, setDeviceType] = useState('fingerprint');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/biometric-devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          device_id: deviceId,
          location,
          device_type: deviceType,
          status: 'offline'
        })
      });

      if (response.ok) {
        toast.success('Device added successfully');
        onSuccess();
      } else {
        toast.error('Failed to add device');
      }
    } catch (error) {
      toast.error(`Error: ${error}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md"
      >
        <h2 className="text-xl font-semibold mb-4">Add Biometric Device</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Device Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Device ID</label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Device Type</label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800"
            >
              <option value="fingerprint">Fingerprint Scanner</option>
              <option value="facial">Facial Recognition</option>
              <option value="iris">Iris Scanner</option>
            </select>
          </div>
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 btn-primary"
            >
              {submitting ? 'Adding...' : 'Add Device'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default BiometricDevicesPage;
