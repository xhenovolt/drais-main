'use client';

import { useEffect, useState } from 'react';
import { X, Wifi, WifiOff, Fingerprint, Loader, Check, Radio } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { showToast } from '@/lib/toast';

const STORAGE_KEY = 'preferred_enrollment_device';

export interface OnlineDevice {
  id: number;
  serial_number: string;
  device_name: string;
  model: string;
  location: string;
  connection_status: 'online' | 'delayed' | 'offline';
  last_heartbeat: string;
}

interface DeviceSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceSelected: (deviceSn: string, deviceName: string) => void;
}

/** Returns the saved preferred device SN from localStorage, or null */
export function getPreferredDevice(): { sn: string; name: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Clears the saved preferred device */
export function clearPreferredDevice() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export default function DeviceSelector({ isOpen, onClose, onDeviceSelected }: DeviceSelectorProps) {
  const [devices, setDevices] = useState<OnlineDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSn, setSelectedSn] = useState<string>('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [autoMessage, setAutoMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    fetchOnlineDevices();
  }, [isOpen]);

  const fetchOnlineDevices = async () => {
    setLoading(true);
    setAutoMessage('');
    try {
      const data = await apiFetch('/api/attendance/zk/devices', { silent: true });
      const allDevices: OnlineDevice[] = (data?.data || []);
      // Only show devices with a heartbeat within the last 60 seconds
      const online = allDevices.filter(
        (d: OnlineDevice) => d.connection_status === 'online' || d.connection_status === 'delayed'
      );
      setDevices(online);

      if (online.length === 1) {
        setSelectedSn(online[0].serial_number);
        setAutoMessage(`Auto-selecting only online device: ${online[0].device_name}`);
      } else if (online.length === 0) {
        setAutoMessage('No devices online. Ensure your device is powered on and connected.');
      }
    } catch {
      setDevices([]);
      setAutoMessage('Failed to fetch devices.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedSn) {
      showToast('error', 'Please select a device');
      return;
    }
    const device = devices.find(d => d.serial_number === selectedSn);
    const deviceName = device?.device_name || selectedSn;

    if (rememberDevice) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sn: selectedSn, name: deviceName }));
    }

    onDeviceSelected(selectedSn, deviceName);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Select Enrollment Device</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-slate-500">
              <Loader className="w-4 h-4 animate-spin" />
              Discovering devices…
            </div>
          ) : (
            <>
              {autoMessage && (
                <div className={`text-xs px-3 py-2 rounded-lg ${devices.length === 0 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'}`}>
                  {autoMessage}
                </div>
              )}

              {devices.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {devices.map(device => (
                    <button
                      key={device.serial_number}
                      onClick={() => setSelectedSn(device.serial_number)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                        selectedSn === device.serial_number
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        selectedSn === device.serial_number ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {selectedSn === device.serial_number ? <Check className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {device.device_name || device.serial_number}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <span className="font-mono">{device.serial_number}</span>
                          {device.location && <span>· {device.location}</span>}
                        </div>
                      </div>
                      <Wifi className={`w-4 h-4 flex-shrink-0 ${device.connection_status === 'online' ? 'text-emerald-500' : 'text-amber-500'}`} />
                    </button>
                  ))}
                </div>
              )}

              {devices.length === 0 && !loading && (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <WifiOff className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500">No online devices found</p>
                  <button
                    onClick={fetchOnlineDevices}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {devices.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
            {/* Remember toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={e => setRememberDevice(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Always use this device for this session
              </span>
            </label>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 h-9 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedSn}
                className="flex-1 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                Use Device
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
