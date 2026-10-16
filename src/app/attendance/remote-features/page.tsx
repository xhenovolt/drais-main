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
import { useI18n } from '@/components/i18n/I18nProvider';

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
  const { t, lang, digits, formatDate } = useI18n();
  // The catalogue is static (api/attendance/remote-features); its prose is keyed by command name.
  const slug = (name: string) => String(name).replace(/[^A-Za-z0-9]/g, '');
  // Protocol names (REBOOT, ENROLL_FP…) are what the device speaks and have no translation.
  const HUMAN_NAMES = new Set(['SyncTime', 'SyncUserIdentity', 'QueryUsers', 'ClearLogs', 'ClearAllData', 'FPviaOPERLOG']);
  const cmdText = (cmd: any, field: 'name' | 'desc' | 'notes', fallback: string) =>
    field === 'name' && !HUMAN_NAMES.has(slug(cmd.name)) ? fallback : t(`devicesPages.remote.cmd.${slug(cmd.name)}.${field}`, fallback);
  const syntax = (c: string) => { const m = /^\(automatic — device POSTs table=(\w+)\)$/.exec(c); return m ? t('devicesPages.remote.autoCmd', { table: m[1] }) : c; };
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
      showToast('error', t('devicesPages.remote.selectFirst'));
      return;
    }
    setTestingCmd(command);
    try {
      await apiFetch('/api/attendance/remote-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: deviceSn, command, priority: 50 }),
        successMessage: t('devicesPages.remote.queued', { cmd: command.substring(0, 40) }),
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
            {t('devicesPages.remote.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('devicesPages.remote.subtitle')}
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {t('devicesPages.remote.refresh')}
        </button>
      </div>

      {/* Device Selector + Info Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.remote.target')}</label>
            <select
              value={deviceSn}
              onChange={(e) => setDeviceSn(e.target.value)}
              className="w-full sm:w-80 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            >
              <option value="">{t('devicesPages.remote.selectDevice')}</option>
              {devices.map((d: any) => (
                <option key={d.sn} value={d.sn}>
                  {d.sn} {d.device_name ? `— ${d.device_name}` : ''} {d.seconds_ago != null && d.seconds_ago <= 120 ? t('devicesPages.remote.onlineOpt') : t('devicesPages.remote.offlineOpt')}
                </option>
              ))}
            </select>
          </div>

          {deviceInfo && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${isOnline ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? t('devicesPages.remote.online') : t('devicesPages.remote.offline')}
              </span>
              {deviceInfo.firmware_version && (
                <span className="text-gray-500 dark:text-gray-400">{t('devicesPages.remote.fw', { v: deviceInfo.firmware_version })}</span>
              )}
              {deviceInfo.push_version && (
                <span className="text-gray-500 dark:text-gray-400">{t('devicesPages.remote.push', { v: deviceInfo.push_version })}</span>
              )}
              {deviceInfo.ip_address && (
                <span className="text-gray-500 dark:text-gray-400">{t('devicesPages.remote.ip', { ip: deviceInfo.ip_address })}</span>
              )}
            </div>
          )}
        </div>

        {/* Command Stats */}
        {commandStats.total > 0 && (
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('devicesPages.remote.commands', { n: commandStats.total })}
            </span>
            <span className="text-xs text-green-600 dark:text-green-400">
              {t('devicesPages.remote.acked', { n: commandStats.acknowledged || 0 })}
            </span>
            <span className="text-xs text-red-600 dark:text-red-400">
              {t('devicesPages.remote.failedN', { n: commandStats.failed || 0 })}
            </span>
            {(commandStats.pending || 0) > 0 && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                {t('devicesPages.remote.pendingN', { n: commandStats.pending })}
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
                  <span className="font-semibold text-gray-900 dark:text-white">{t(`devicesPages.remote.cat.${slug(cat.category)}`, cat.category)}</span>
                  <span className="text-xs text-gray-400">
                    {t('devicesPages.remote.supportedOf', { n: supportedCount, total: totalCount })}
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
                        <th className="px-4 py-2 text-start">{t('devicesPages.remote.col.command')}</th>
                        <th className="px-4 py-2 text-start hidden md:table-cell">{t('devicesPages.remote.col.syntax')}</th>
                        <th className="px-4 py-2 text-center">{t('devicesPages.remote.col.status')}</th>
                        <th className="px-4 py-2 text-center hidden sm:table-cell">{t('devicesPages.remote.col.return')}</th>
                        <th className="px-4 py-2 text-end">{t('devicesPages.remote.col.action')}</th>
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
                              <div className="font-medium text-gray-900 dark:text-white">{cmdText(cmd, 'name', cmd.name)}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cmdText(cmd, 'desc', cmd.description)}</div>
                              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic hidden md:hidden">{cmdText(cmd, 'notes', cmd.notes)}</div>
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell">
                              <code dir="ltr" className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all">
                                {syntax(cmd.command)}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
                                {badge.icon}
                                <span className="hidden sm:inline">{t(`devicesPages.remote.st.${STATUS_BADGE[cmd.status] ? cmd.status : 'untested'}`)}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center hidden sm:table-cell">
                              {cmd.returnCode !== null && cmd.returnCode !== undefined ? (
                                <span className={`text-xs font-mono ${cmd.returnCode === 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  <span dir="ltr">{digits(cmd.returnCode)}</span>
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end">
                              {isTestable ? (
                                <button
                                  onClick={() => testCommand(cmd.command.replace(/\{[^}]+\}/g, '2'))}
                                  disabled={testingCmd !== null}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition"
                                >
                                  {testingCmd === cmd.command ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                  {t('devicesPages.remote.test')}
                                </button>
                              ) : (
                                <span className="text-xs text-gray-400">{t('devicesPages.remote.auto')}</span>
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
                          <span className="font-medium text-gray-600 dark:text-gray-300">{cmdText(cmd, 'name', cmd.name)}:</span>{' '}
                          {cmdText(cmd, 'notes', cmd.notes)}
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
          {t('devicesPages.remote.codeRef')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
          {Object.entries(ERROR_CODES).map(([code, label]) => (
            <div
              key={code}
              className={`flex items-center gap-2 px-2 py-1.5 rounded ${Number(code) === 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}`}
            >
              <span className={`font-mono font-bold ${Number(code) === 0 ? 'text-green-600' : 'text-red-500'}`}>
                <span dir="ltr">{digits(code)}</span>
              </span>
              <span className="text-gray-600 dark:text-gray-300">{t(`devicesPages.remote.code.${code}`, label)}</span>
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
              {t('devicesPages.remote.recent', { n: recentTests.length })}
            </span>
            {showRecent ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>

          {showRecent && (
            <div className="border-t border-gray-100 dark:border-gray-700 max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('devicesPages.remote.rc.id')}</th>
                    <th className="px-3 py-2 text-start">{t('devicesPages.remote.col.command')}</th>
                    <th className="px-3 py-2 text-center">{t('devicesPages.remote.col.status')}</th>
                    <th className="px-3 py-2 text-start hidden sm:table-cell">{t('devicesPages.remote.rc.error')}</th>
                    <th className="px-3 py-2 text-end">{t('devicesPages.remote.rc.time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTests.map((cmd: any) => (
                    <tr key={cmd.id} className="border-t border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-3 py-2 font-mono text-gray-400">{digits(cmd.id)}</td>
                      <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-300 max-w-xs truncate">{cmd.command}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                          cmd.status === 'acknowledged' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          cmd.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          cmd.status === 'sent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}>
                          {t(`devicesPages.remote.cmdst.${cmd.status}`, cmd.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 hidden sm:table-cell max-w-xs truncate">{cmd.error_message || '—'}</td>
                      <td className="px-3 py-2 text-end text-gray-400 whitespace-nowrap">
                        {cmd.created_at ? (lang === 'ar' ? formatDate(cmd.created_at, 'datetime') : new Date(cmd.created_at).toLocaleString()) : '—'}
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
        <p>{t('devicesPages.remote.foot1')}</p>
        <p>{t('devicesPages.remote.foot2')}</p>
        <p>{t('devicesPages.remote.foot3')}</p>
      </div>
    </div>
  );
}
