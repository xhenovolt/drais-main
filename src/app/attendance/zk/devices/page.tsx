"use client";

import React, { useState } from 'react';
import {
  Server, Wifi, WifiOff, MapPin, Edit2, Trash2, Save, X,
  RefreshCw, Clock, Activity, Fingerprint, AlertTriangle,
} from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import { fetcher } from '@/utils/fetcher';

export default function ZKDevicesPage() {
  const { data, isLoading, mutate } = useSWR<any>('/api/attendance/zk/devices', fetcher, { refreshInterval: 15000 });
  const devices = data?.data || [];
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ device_name: '', location: '', model: '', status: '' });

  const startEdit = (dev: any) => {
    setEditingId(dev.id);
    setEditForm({
      device_name: dev.device_name || '',
      location: dev.location || '',
      model: dev.model || '',
      status: dev.status || 'active',
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await fetch('/api/attendance/zk/devices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Device updated');
      setEditingId(null);
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update device');
    }
  };

  const deleteDevice = async (id: number, sn: string) => {
    if (!confirm(`Remove device ${sn}? Logs will be preserved.`)) return;
    try {
      const res = await fetch(`/api/attendance/zk/devices?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.success('Device removed');
      mutate();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Server className="w-7 h-7 text-blue-500" />
            ZK Device Management
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {devices.length} device{devices.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <button onClick={() => mutate()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Server className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">No Devices Registered</h3>
          <p className="text-gray-500 mt-2">Devices auto-register when they first connect via ADMS protocol.</p>
          <p className="text-gray-400 text-sm mt-1">Configure your ZKTeco device to push to: <code className="bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded">/iclock/cdata</code></p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {devices.map((dev: any) => (
            <div key={dev.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    dev.connection_status === 'online' ? 'bg-green-500 animate-pulse' :
                    dev.connection_status === 'delayed' ? 'bg-yellow-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <h3 className="font-semibold">{dev.device_name || dev.serial_number}</h3>
                    <p className="text-xs text-gray-500 font-mono">{dev.serial_number}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  dev.connection_status === 'online' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  dev.connection_status === 'delayed' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {dev.connection_status === 'online' ? <Wifi className="w-3 h-3 inline mr-1" /> :
                   dev.connection_status === 'delayed' ? <AlertTriangle className="w-3 h-3 inline mr-1" /> :
                   <WifiOff className="w-3 h-3 inline mr-1" />}
                  {dev.connection_status}
                </span>
              </div>

              {/* Edit Mode */}
              {editingId === dev.id ? (
                <div className="p-4 space-y-3 bg-blue-50/50 dark:bg-blue-900/10">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name</label>
                      <input type="text" value={editForm.device_name} onChange={(e) => setEditForm(p => ({ ...p, device_name: e.target.value }))}
                        className="w-full px-2 py-1.5 border rounded text-sm bg-white dark:bg-slate-700 dark:border-gray-600" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Location</label>
                      <input type="text" value={editForm.location} onChange={(e) => setEditForm(p => ({ ...p, location: e.target.value }))}
                        className="w-full px-2 py-1.5 border rounded text-sm bg-white dark:bg-slate-700 dark:border-gray-600" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Model</label>
                      <input type="text" value={editForm.model} onChange={(e) => setEditForm(p => ({ ...p, model: e.target.value }))}
                        className="w-full px-2 py-1.5 border rounded text-sm bg-white dark:bg-slate-700 dark:border-gray-600" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Status</label>
                      <select value={editForm.status} onChange={(e) => setEditForm(p => ({ ...p, status: e.target.value }))}
                        className="w-full px-2 py-1.5 border rounded text-sm bg-white dark:bg-slate-700 dark:border-gray-600">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 dark:hover:bg-slate-700 dark:border-gray-600">
                      <X className="w-3 h-3 inline mr-1" /> Cancel
                    </button>
                    <button onClick={saveEdit} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                      <Save className="w-3 h-3 inline mr-1" /> Save
                    </button>
                  </div>
                </div>
              ) : (
                /* Details */
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                    <div className="flex items-center gap-2 text-gray-500">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{dev.location || 'No location set'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500">
                      <Activity className="w-3.5 h-3.5" />
                      <span>IP: {dev.ip_address || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Heartbeat: {dev.last_heartbeat ? new Date(dev.last_heartbeat).toLocaleString() : 'Never'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500">
                      <Fingerprint className="w-3.5 h-3.5" />
                      <span>Today: {dev.today_punches || 0} punches</span>
                    </div>
                  </div>

                  {/* Stats Bar */}
                  <div className="mt-4 flex items-center gap-3 text-xs">
                    <span className="px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600">
                      {dev.mapped_users || 0} mapped users
                    </span>
                    {Number(dev.pending_commands) > 0 && (
                      <span className="px-2 py-1 rounded bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600">
                        {dev.pending_commands} pending cmds
                      </span>
                    )}
                    {dev.model && (
                      <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">
                        {dev.model}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex justify-end gap-2">
                    <button onClick={() => startEdit(dev)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 hover:text-blue-600">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteDevice(dev.id, dev.serial_number)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
