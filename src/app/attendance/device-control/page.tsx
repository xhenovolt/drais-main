"use client";

import React, { useState, useCallback } from 'react';
import {
  Wifi, WifiOff, Power, Lock, Unlock, Fingerprint, Monitor, RefreshCw,
  Send, Loader, Users, Clock, Terminal, Type, AlertTriangle,
  CheckCircle, XCircle, ChevronDown, ChevronRight, Trash2, Download, Globe,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function DeviceControlPage() {
  const [deviceSn, setDeviceSn] = useState('');
  const [directIp, setDirectIp] = useState('');
  const [directPort, setDirectPort] = useState('4370');
  const [useDirectIp, setUseDirectIp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [enrollUid, setEnrollUid] = useState('');
  const [enrollFinger, setEnrollFinger] = useState(0);
  const [lcdText, setLcdText] = useState('');
  const [rawCmd, setRawCmd] = useState('');
  const [rawData, setRawData] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher);
  const devices = devicesData?.data || [];

  // Auto-select first online device
  React.useEffect(() => {
    if (!deviceSn && devices.length > 0) {
      const online = devices.find((d: any) => d.seconds_ago != null && d.seconds_ago <= 120);
      if (online) setDeviceSn(online.sn);
      else if (devices[0]) setDeviceSn(devices[0].sn);
    }
  }, [devices, deviceSn]);

  const addResult = useCallback((action: string, data: any, success: boolean) => {
    setResults(prev => [{
      id: Date.now(),
      action,
      data,
      success,
      time: new Date().toLocaleTimeString(),
    }, ...prev].slice(0, 30));
  }, []);

  // GET actions
  const doGet = async (action: string, label: string) => {
    if (!useDirectIp && !deviceSn) return showToast('error', 'Select a device or enter an IP');
    if (useDirectIp && !directIp) return showToast('error', 'Enter a device IP address');
    setBusy(action);
    try {
      const params = new URLSearchParams({ action });
      if (useDirectIp) {
        params.set('device_ip', directIp);
        params.set('device_port', directPort);
      } else {
        params.set('device_sn', deviceSn);
      }
      const res = await fetch(`/api/attendance/zk-tcp?${params}`);
      const json = await res.json();
      addResult(label, json, json.success);
      if (!json.success) showToast('error', json.error || 'Failed');
    } catch (err: any) {
      addResult(label, { error: err.message }, false);
      showToast('error', err.message);
    } finally {
      setBusy(null);
    }
  };

  // POST actions
  const doPost = async (action: string, label: string, extra: Record<string, any> = {}) => {
    if (!useDirectIp && !deviceSn) return showToast('error', 'Select a device or enter an IP');
    if (useDirectIp && !directIp) return showToast('error', 'Enter a device IP address');
    setBusy(action);
    try {
      const payload: any = { action, ...extra };
      if (useDirectIp) {
        payload.device_ip = directIp;
        payload.device_port = directPort;
      } else {
        payload.device_sn = deviceSn;
      }
      const res = await fetch('/api/attendance/zk-tcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      addResult(label, json, json.success);
      if (json.success) {
        showToast('success', json.message || 'Done');
      } else {
        showToast('error', json.error || 'Failed');
      }
    } catch (err: any) {
      addResult(label, { error: err.message }, false);
      showToast('error', err.message);
    } finally {
      setBusy(null);
    }
  };

  const selectedDevice = devices.find((d: any) => d.sn === deviceSn);
  const isOnline = selectedDevice?.seconds_ago != null && selectedDevice.seconds_ago <= 120;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Terminal className="w-7 h-7 text-indigo-500" />
          Device Control (TCP SDK)
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Direct TCP connection to ZKTeco device — full control including remote enrollment
        </p>
      </div>

      {/* Device Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        {/* Mode Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUseDirectIp(false)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${!useDirectIp ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
          >
            Registered Devices
          </button>
          <button
            onClick={() => setUseDirectIp(true)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition flex items-center gap-1.5 ${useDirectIp ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
          >
            <Globe className="w-3.5 h-3.5" />
            Direct IP (LAN Test)
          </button>
        </div>

        {useDirectIp ? (
          /* Direct IP Input */
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Device IP Address</label>
              <input
                type="text"
                value={directIp}
                onChange={(e) => setDirectIp(e.target.value)}
                placeholder="e.g. 192.168.1.197"
                className="w-full sm:w-64 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Port</label>
              <input
                type="number"
                value={directPort}
                onChange={(e) => setDirectPort(e.target.value)}
                placeholder="4370"
                className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
              />
            </div>
            {directIp && (
              <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                <Globe className="w-3 h-3" />
                Direct → {directIp}:{directPort}
              </span>
            )}
          </div>
        ) : (
          /* Registered Device Selector */
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Target Device</label>
              <select
                value={deviceSn}
                onChange={(e) => setDeviceSn(e.target.value)}
                className="w-full sm:w-80 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">Select device...</option>
                {devices.map((d: any) => (
                  <option key={d.sn} value={d.sn}>
                    {d.sn} {d.device_name ? `— ${d.device_name}` : ''} ({d.ip_address || 'no IP'})
                  </option>
                ))}
              </select>
            </div>
            {selectedDevice && (
              <div className="flex items-center gap-3 text-xs">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${isOnline ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                <span className="text-gray-400">IP: {selectedDevice.ip_address || '—'}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <ActionButton
          icon={<Monitor className="w-5 h-5" />}
          label="Get Info"
          color="blue"
          busy={busy === 'info'}
          disabled={busy !== null}
          onClick={() => doGet('info', 'Get Info')}
        />
        <ActionButton
          icon={<Users className="w-5 h-5" />}
          label="Get Users"
          color="blue"
          busy={busy === 'users'}
          disabled={busy !== null}
          onClick={() => doGet('users', 'Get Users')}
        />
        <ActionButton
          icon={<Clock className="w-5 h-5" />}
          label="Attendance"
          color="blue"
          busy={busy === 'attendance'}
          disabled={busy !== null}
          onClick={() => doGet('attendance', 'Get Attendance')}
        />
        <ActionButton
          icon={<Wifi className="w-5 h-5" />}
          label="Test TCP"
          color="green"
          busy={busy === 'status'}
          disabled={busy !== null}
          onClick={() => doGet('status', 'TCP Test')}
        />
        <ActionButton
          icon={<Power className="w-5 h-5" />}
          label="Restart"
          color="red"
          busy={busy === 'restart'}
          disabled={busy !== null}
          onClick={() => doPost('restart', 'Restart')}
        />
        <ActionButton
          icon={<Lock className="w-5 h-5" />}
          label="Disable"
          color="yellow"
          busy={busy === 'disable'}
          disabled={busy !== null}
          onClick={() => doPost('disable', 'Disable Device')}
        />
        <ActionButton
          icon={<Unlock className="w-5 h-5" />}
          label="Enable"
          color="green"
          busy={busy === 'enable'}
          disabled={busy !== null}
          onClick={() => doPost('enable', 'Enable Device')}
        />
        <ActionButton
          icon={<Unlock className="w-5 h-5" />}
          label="Unlock Door"
          color="purple"
          busy={busy === 'unlock'}
          disabled={busy !== null}
          onClick={() => doPost('unlock', 'Unlock Door')}
        />
      </div>

      {/* Enrollment Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-indigo-500" />
          Remote Fingerprint Enrollment (TCP SDK)
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Enter the device UID (internal user number on device) and finger index. The device will prompt the user to place their finger. After 3 touches the template is stored on device, then click &quot;Save Template&quot; to pull it into DRAIS.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Device UID</label>
            <input
              type="number"
              value={enrollUid}
              onChange={(e) => setEnrollUid(e.target.value)}
              placeholder="e.g. 2"
              min={1}
              className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Finger (0-9)</label>
            <select
              value={enrollFinger}
              onChange={(e) => setEnrollFinger(parseInt(e.target.value, 10))}
              className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            >
              {['Right Thumb', 'Right Index', 'Right Middle', 'Right Ring', 'Right Pinky',
                'Left Thumb', 'Left Index', 'Left Middle', 'Left Ring', 'Left Pinky'].map((name, i) => (
                <option key={i} value={i}>{i} — {name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              if (!enrollUid) return showToast('error', 'Enter device UID');
              doPost('enroll', `Enroll UID=${enrollUid} F=${enrollFinger}`, {
                uid: parseInt(enrollUid, 10),
                finger: enrollFinger,
              });
            }}
            disabled={busy !== null}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
          >
            {busy === 'enroll' ? <Loader className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
            Start Enrollment
          </button>
          <button
            onClick={() => doPost('save_template', `Save Template UID=${enrollUid} F=${enrollFinger}`, {
              uid: parseInt(enrollUid || '0', 10),
              finger: enrollFinger,
              pin: enrollUid,
            })}
            disabled={busy !== null || !enrollUid}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
          >
            {busy === 'save_template' ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Save Template
          </button>
          <button
            onClick={() => doPost('cancel_enroll', 'Cancel Enrollment')}
            disabled={busy !== null}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-sm rounded-lg transition flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </div>

      {/* LCD Display */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Type className="w-5 h-5 text-gray-400" />
          LCD Display
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={lcdText}
            onChange={(e) => setLcdText(e.target.value)}
            placeholder="Message to display on device screen..."
            maxLength={100}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
          />
          <button
            onClick={() => doPost('write_lcd', `LCD: ${lcdText}`, { text: lcdText })}
            disabled={busy !== null || !lcdText}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white text-sm rounded-lg transition"
          >
            Write
          </button>
          <button
            onClick={() => doPost('clear_lcd', 'Clear LCD')}
            disabled={busy !== null}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-sm rounded-lg transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Advanced: Raw Command */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
        >
          <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Raw Command (Advanced)
          </span>
          {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {showAdvanced && (
          <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <p className="text-xs text-red-500">Send any ZK SDK command by numeric ID. Use with caution.</p>
            <div className="flex gap-2 items-end">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Command ID</label>
                <input
                  type="number"
                  value={rawCmd}
                  onChange={(e) => setRawCmd(e.target.value)}
                  placeholder="e.g. 61"
                  className="w-28 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 block mb-1">Data (hex, optional)</label>
                <input
                  type="text"
                  value={rawData}
                  onChange={(e) => setRawData(e.target.value)}
                  placeholder="e.g. 020000"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
                />
              </div>
              <button
                onClick={() => doPost('exec', `CMD ${rawCmd}`, { command: parseInt(rawCmd, 10), data: rawData })}
                disabled={busy !== null || !rawCmd}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-sm rounded-lg transition"
              >
                Execute
              </button>
            </div>
            <div className="text-xs text-gray-400 space-y-0.5">
              <p>Common: 1000=CONNECT, 1004=RESTART, 50=GET_FREE_SIZES, 61=STARTENROLL, 62=CANCELCAPTURE</p>
              <p>1002=ENABLE, 1003=DISABLE, 9=READ_TEMPLATE, 10=WRITE_TEMPLATE, 500=REG_EVENT</p>
            </div>
          </div>
        )}
      </div>

      {/* Results Log */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">Results ({results.length})</h2>
            <button
              onClick={() => setResults([])}
              className="text-xs text-gray-400 hover:text-gray-600 transition"
            >
              Clear
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
            {results.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  {r.success ? (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}
                  <span className="font-medium text-sm text-gray-900 dark:text-white">{r.action}</span>
                  <span className="text-xs text-gray-400 ml-auto">{r.time}</span>
                </div>
                <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                  {JSON.stringify(r.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-500 text-center">
        TCP SDK connects directly to device port 4370 — requires LAN access or relay agent
      </div>
    </div>
  );
}

function ActionButton({
  icon, label, color, busy, disabled, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 border-green-200 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border-red-200 dark:border-red-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 border-yellow-200 dark:border-yellow-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 border-purple-200 dark:border-purple-800',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition disabled:opacity-50 ${colorMap[color] || colorMap.blue}`}
    >
      {busy ? <Loader className="w-5 h-5 animate-spin" /> : icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}
