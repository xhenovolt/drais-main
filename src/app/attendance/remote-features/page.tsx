"use client";

import React, { useState } from 'react';
import {
  Wifi, WifiOff, CheckCircle, XCircle, AlertTriangle, HelpCircle,
  Send, Loader, RefreshCw, ChevronDown, ChevronRight,
  Monitor, Database, Fingerprint, Upload, Clock, Activity,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const STATUS_BADGE: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  supported:   { icon: <CheckCircle className="w-4 h-4" />, cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',  label: 'Supported' },
  partial:     { icon: <AlertTriangle className="w-4 h-4" />, cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', label: 'Partial' },
  unsupported: { icon: <XCircle className="w-4 h-4" />, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',       label: 'Unsupported' },
  untested:    { icon: <HelpCircle className="w-4 h-4" />, cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',   label: 'Untested' },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Device Control':       <Monitor className="w-5 h-5" />,
  'Data Management':      <Database className="w-5 h-5" />,
  'Biometric Enrollment': <Fingerprint className="w-5 h-5" />,
  'Template Transfer':    <Upload className="w-5 h-5" />,
};

const ERROR_CODES: Record<number, string> = {
  0:     'Success',
  6:     'DATA_NOT_EXIST',
  [-1001]: 'Command error',
  [-1002]: 'Unsupported command',
  [-1003]: 'Parameter error',
  [-1004]: 'Internal error',
  [-1005]: 'Command timeout',
  [-1006]: 'Data already exists',
  [-1007]: 'Data not exist',
};

export default function RemoteFeaturesPage() {
  const [deviceSn, setDeviceSn] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['Device Control', 'Data Management', 'Biometric Enrollment', 'Template Transfer']));
  const [testingCmd, setTestingCmd] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  const params = new URLSearchParams();
  if (deviceSn) params.set('device_sn', deviceSn);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/attendance/remote-features?${params.toString()}`,
    fetcher,
    { refreshInterval: 15000 },
  );

  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher);

  const features = data?.protocolFeatures || [];
  const deviceInfo = data?.deviceInfo;
  const commandStats = data?.commandStats || {};
  const recentTests = data?.recentTests || [];
  const devices = devicesData?.data || [];

  // Auto-select first online device
  React.useEffect(() => {
    if (!deviceSn && devices.length > 0) {
      const online = devices.find((d: any) => d.seconds_ago != null && d.seconds_ago <= 120);
      if (online) setDeviceSn(online.sn);
      else if (devices[0]) setDeviceSn(devices[0].sn);
    }
  }, [devices, deviceSn]);

  const toggleCategory = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const testCommand = async (command: string) => {
    if (!deviceSn) {
      showToast('error', 'Select a device first');
      return;
    }
    setTestingCmd(command);
    try {
      await apiFetch('/api/attendance/remote-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: deviceSn, command, priority: 50 }),
        successMessage: `Queued: ${command.substring(0, 40)}`,
      });
      mutate();
    } catch {
      // apiFetch handles error toast
    } finally {
      setTestingCmd(null);
    }
  };

  const isOnline = deviceInfo?.seconds_ago != null && deviceInfo.seconds_ago <= 120;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-purple-500" />
            Remote Features &amp; ADMS Protocol
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            ZKTeco Push Protocol command reference — tested against live hardware
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Device Selector + Info Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
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
                  {d.sn} {d.device_name ? `— ${d.device_name}` : ''} {d.seconds_ago != null && d.seconds_ago <= 120 ? '● Online' : '○ Offline'}
                </option>
              ))}
            </select>
          </div>

          {deviceInfo && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${isOnline ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {deviceInfo.firmware_version && (
                <span className="text-gray-500 dark:text-gray-400">FW: {deviceInfo.firmware_version}</span>
              )}
              {deviceInfo.push_version && (
                <span className="text-gray-500 dark:text-gray-400">Push: v{deviceInfo.push_version}</span>
              )}
              {deviceInfo.ip_address && (
                <span className="text-gray-500 dark:text-gray-400">IP: {deviceInfo.ip_address}</span>
              )}
            </div>
          )}
        </div>

        {/* Command Stats */}
        {commandStats.total > 0 && (
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Commands: <b>{commandStats.total}</b> total
            </span>
            <span className="text-xs text-green-600 dark:text-green-400">
              ✓ {commandStats.acknowledged || 0} acknowledged
            </span>
            <span className="text-xs text-red-600 dark:text-red-400">
              ✗ {commandStats.failed || 0} failed
            </span>
            {(commandStats.pending || 0) > 0 && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                ⏳ {commandStats.pending} pending
              </span>
            )}
          </div>
        )}
      </div>

      {/* Protocol Feature Reference */}
      <div className="space-y-4">
        {features.map((cat: any) => {
          const isExpanded = expandedCats.has(cat.category);
          const supportedCount = cat.commands.filter((c: any) => c.status === 'supported').length;
          const totalCount = cat.commands.length;

          return (
            <div
              key={cat.category}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(cat.category)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-purple-500 dark:text-purple-400">
                    {CATEGORY_ICONS[cat.category] || <HelpCircle className="w-5 h-5" />}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">{cat.category}</span>
                  <span className="text-xs text-gray-400">
                    {supportedCount}/{totalCount} supported
                  </span>
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              </button>

              {/* Commands Table */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-500 dark:text-gray-400">
                        <th className="px-4 py-2 text-left">Command</th>
                        <th className="px-4 py-2 text-left hidden md:table-cell">Syntax</th>
                        <th className="px-4 py-2 text-center">Status</th>
                        <th className="px-4 py-2 text-center hidden sm:table-cell">Return</th>
                        <th className="px-4 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.commands.map((cmd: any, idx: number) => {
                        const badge = STATUS_BADGE[cmd.status] || STATUS_BADGE.untested;
                        const isTestable = !cmd.command.startsWith('(') && deviceSn;

                        return (
                          <tr
                            key={cmd.name}
                            className={`border-t border-gray-50 dark:border-gray-700/50 ${idx % 2 === 0 ? '' : 'bg-gray-25 dark:bg-gray-800/50'}`}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 dark:text-white">{cmd.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cmd.description}</div>
                              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic hidden md:hidden">{cmd.notes}</div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all">
                                {cmd.command}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
                                {badge.icon}
                                <span className="hidden sm:inline">{badge.label}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center hidden sm:table-cell">
                              {cmd.returnCode !== null && cmd.returnCode !== undefined ? (
                                <span className={`text-xs font-mono ${cmd.returnCode === 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {cmd.returnCode}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isTestable ? (
                                <button
                                  onClick={() => testCommand(cmd.command.replace(/\{[^}]+\}/g, '2'))}
                                  disabled={testingCmd !== null}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition"
                                >
                                  {testingCmd === cmd.command ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                  Test
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">auto</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Notes Section */}
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700">
                    <div className="space-y-1">
                      {cat.commands.map((cmd: any) => (
                        <div key={cmd.name} className="text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-600 dark:text-gray-300">{cmd.name}:</span>{' '}
                          {cmd.notes}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Return Code Reference */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-gray-400" />
          ADMS Return Code Reference
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
          {Object.entries(ERROR_CODES).map(([code, label]) => (
            <div
              key={code}
              className={`flex items-center gap-2 px-2 py-1.5 rounded ${Number(code) === 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}`}
            >
              <span className={`font-mono font-bold ${Number(code) === 0 ? 'text-green-600' : 'text-red-500'}`}>
                {code}
              </span>
              <span className="text-gray-600 dark:text-gray-300">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Test Commands */}
      {recentTests.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowRecent(!showRecent)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
          >
            <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Recent Commands ({recentTests.length})
            </span>
            {showRecent ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>

          {showRecent && (
            <div className="border-t border-gray-100 dark:border-gray-700 max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">ID</th>
                    <th className="px-3 py-2 text-left">Command</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-left hidden sm:table-cell">Error</th>
                    <th className="px-3 py-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTests.map((cmd: any) => (
                    <tr key={cmd.id} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2 font-mono text-gray-400">{cmd.id}</td>
                      <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300 max-w-xs truncate">{cmd.command}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                          cmd.status === 'acknowledged' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          cmd.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          cmd.status === 'sent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {cmd.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 hidden sm:table-cell max-w-xs truncate">{cmd.error_message || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-400 whitespace-nowrap">
                        {cmd.created_at ? new Date(cmd.created_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Protocol Info Footer */}
      <div className="text-xs text-gray-400 dark:text-gray-500 text-center space-y-1">
        <p>ZKTeco ADMS Push Protocol — Command delivery via HTTP GET/POST</p>
        <p>Device heartbeats via GET → Commands delivered as C:id:command → Device acknowledges via POST path=devicecmd</p>
        <p>Tested on K40 Pro · Firmware 8.0.4.3-20230515 · Push Protocol v2.4.1</p>
      </div>
    </div>
  );
}
