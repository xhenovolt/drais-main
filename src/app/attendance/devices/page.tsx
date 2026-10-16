"use client";

import React, { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import {
  Activity, Wifi, WifiOff, Server, Clock, MapPin, Hash,
  Trash2, Users, Loader, CheckCircle, AlertTriangle, Settings,
  Fingerprint, RefreshCw, Edit2, X, Save, UserPlus, Send,
  RotateCcw, ShieldAlert, Database, Power, ClipboardList,
  Timer, Info, Download,
  // Phase 2 — ownership ceremony actions.
  LogOut, LogIn, Archive,
} from 'lucide-react';
import { showToast, confirmAction } from '@/lib/toast';
import { toLocalDateStr } from '@/lib/datetime/local-date';
import { apiFetch } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import DeviceReconciliationModal from '@/components/attendance/DeviceReconciliationModal';
import { useI18n } from '@/components/i18n/I18nProvider';
import PushTemplatesModal from '@/components/attendance/PushTemplatesModal';

function formatTimeAgo(t: (k: string, v?: any) => string, seconds: number): string {
  if (seconds <= 0) return t('devicesPages.devices.ago.now');
  if (seconds < 60) return t('devicesPages.devices.ago.s', { n: seconds });
  if (seconds < 3600) return t('devicesPages.devices.ago.m', { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('devicesPages.devices.ago.h', { n: Math.floor(seconds / 3600) });
  return t('devicesPages.devices.ago.d', { n: Math.floor(seconds / 86400) });
}

function SyncStatusBadge({ status }: { status: string | null }) {
  const { t } = useI18n();
  if (!status || status === 'unknown') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        {t('devicesPages.devices.sync.unknown')}
      </span>
    );
  }
  if (status === 'synced') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" />
        {t('devicesPages.devices.sync.synced')}
      </span>
    );
  }
  if (status === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
        <Loader className="w-3 h-3 animate-spin" />
        {t('devicesPages.devices.sync.syncing')}
      </span>
    );
  }
  // out_of_sync
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
      <ShieldAlert className="w-3 h-3" />
      {t('devicesPages.devices.sync.outOfSync')}
    </span>
  );
}

function InventoryBadge({ status, stale, method }: { status: string | null; stale: boolean | null; method?: string | null }) {
  const { t } = useI18n();
  const m = method ? ` (${t(`devicesPages.devices.inv.method.${method.toLowerCase()}`, method.toUpperCase())})` : '';
  const map: Record<string, { label: string; cls: string }> = {
    never_synced: { label: t('devicesPages.devices.inv.never_synced'), cls: 'bg-gray-100 text-gray-500' },
    pending:      { label: t('devicesPages.devices.inv.pending'),  cls: 'bg-amber-100 text-amber-800' },
    running:      { label: t('devicesPages.devices.inv.running'),     cls: 'bg-blue-100 text-blue-700' },
    completed:    { label: stale ? t('devicesPages.devices.inv.stale') : t('devicesPages.devices.inv.completed'), cls: stale ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700' },
    failed:       { label: t('devicesPages.devices.inv.failed'),  cls: 'bg-red-100 text-red-700' },
    timeout:      { label: t('devicesPages.devices.inv.timeout'), cls: 'bg-red-100 text-red-700' },
  };
  const e = map[status ?? 'never_synced'] ?? map.never_synced;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${e.cls}`}>
      {e.label}{status === 'completed' ? m : ''}
    </span>
  );
}

export default function DevicesPage() {
  const { t, lang, digits, formatDate } = useI18n();
  const when = (v: string) => (lang === 'ar' ? formatDate(v, 'datetime') : new Date(v).toLocaleString());
  const { data, isLoading, error, mutate } = useSWR<any>('/api/attendance/zk/devices', {
    refreshInterval: 30000,
  });

  const devices = data?.data || [];
  const discovered = data?.discovered || [];
  const debugHeartbeats = data?.debug?.lastHeartbeats || [];
  const online = devices.filter((d: any) => d.connection_status === 'online').length;
  const offline = devices.length - online;
  const outOfSync = devices.filter((d: any) => d.sync_status === 'out_of_sync').length;

  // Alert: toast for every out-of-sync device on load
  useEffect(() => {
    if (!data?.data) return;
    const bad = (data.data as any[]).filter((d) => d.sync_status === 'out_of_sync');
    if (bad.length > 0) {
      showToast('error', t('devicesPages.devices.mismatchToast', { count: bad.length }));
    }
  }, [data]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100
      dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600
              bg-clip-text text-transparent flex items-center gap-3">
              <Fingerprint className="w-8 h-8 text-blue-600" />
              {t('devicesPages.devices.title')}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              {t('devicesPages.devices.subtitle')}
            </p>
          </div>
          <button
            onClick={() => mutate()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600
              rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('devicesPages.devices.refresh')}
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">{t('devicesPages.devices.total')}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{digits(devices.length)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Server className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">{t('devicesPages.devices.online')}</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{digits(online)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Wifi className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">{t('devicesPages.devices.offline')}</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{digits(offline)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <WifiOff className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className={`rounded-xl border p-5 ${outOfSync > 0
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">{t('devicesPages.devices.outOfSync')}</p>
                <p className={`text-3xl font-bold mt-1 ${outOfSync > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                  {digits(outOfSync)}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                outOfSync > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-700'
              }`}>
                <ShieldAlert className={`w-6 h-6 ${outOfSync > 0 ? 'text-red-600' : 'text-gray-400'}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Out-of-sync banner */}
        {outOfSync > 0 && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                {t('devicesPages.devices.mismatchBanner', { count: outOfSync })}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                {t('devicesPages.devices.mismatchHelp')}
              </p>
            </div>
          </div>
        )}

        {/* Devices Grid */}
        {isLoading ? (
          <div className="text-center py-16">
            <Loader className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-gray-500 mt-3 text-sm">{t('devicesPages.devices.loading')}</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-red-200">
            <WifiOff className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-red-600 mt-3 font-medium">{t('devicesPages.devices.loadFailed')}</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="space-y-6">
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-blue-300 dark:border-blue-700">
              <div className="relative inline-block mb-4">
                <Activity className="w-12 h-12 text-blue-400 mx-auto animate-pulse" />
              </div>
              <p className="text-gray-700 dark:text-gray-200 font-medium text-lg">{t('devicesPages.devices.listening')}</p>
              <p className="text-gray-400 text-sm mt-1 max-w-md mx-auto">
                {t('devicesPages.devices.listeningHelp')}
              </p>
            </div>

            {/* Show discovered devices from attendance logs */}
            {discovered.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  {t('devicesPages.devices.recent')}
                </h3>
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-4 py-2 text-start text-xs font-medium text-gray-500 uppercase">{t('devicesPages.devices.col.sn')}</th>
                        <th className="px-4 py-2 text-start text-xs font-medium text-gray-500 uppercase">{t('devicesPages.devices.col.status')}</th>
                        <th className="px-4 py-2 text-start text-xs font-medium text-gray-500 uppercase">{t('devicesPages.devices.col.lastSeen')}</th>
                        <th className="px-4 py-2 text-start text-xs font-medium text-gray-500 uppercase">{t('devicesPages.devices.col.punches')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {discovered.map((d: any) => (
                        <tr key={d.serial_number}>
                          <td className="px-4 py-3 font-mono text-xs">{d.serial_number}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              d.connection_status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${d.connection_status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {t(`devicesPages.devices.conn.${d.connection_status}`, d.connection_status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{d.last_heartbeat ? when(d.last_heartbeat) : '—'}</td>
                          <td className="px-4 py-3 text-xs font-medium">{digits(d.today_punches)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map((device: any) => (
              <DeviceCard key={device.id} device={device} onMutate={() => mutate()} />
            ))}
          </div>
        )}

        {/* Debug Panel — Last Heartbeats */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700
          rounded-xl p-4">
          <h3 className="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Database className="w-4 h-4" />
            {t('devicesPages.devices.debugTitle')}
          </h3>
          {debugHeartbeats.length === 0 ? (
            <p className="text-xs text-yellow-700 dark:text-yellow-400">{t('devicesPages.devices.debugNone')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {debugHeartbeats.map((hb: any, i: number) => (
                <div key={i} className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-yellow-200
                  dark:border-yellow-800 text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('devicesPages.devices.debug.sn')}</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{hb.sn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('devicesPages.devices.debug.ip')}</span>
                    <span className="text-gray-700 dark:text-gray-300">{hb.ip}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('devicesPages.devices.debug.time')}</span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {hb.created_at ? when(hb.created_at) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('devicesPages.devices.debug.push')}</span>
                    <span className="text-gray-700 dark:text-gray-300">{hb.push_version || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-yellow-600 dark:text-yellow-500 mt-2">
            {t('devicesPages.devices.debugTotals', { total: devices.length, found: discovered.length })}
          </p>
        </div>
      </div>
    </div>
  );
}

function DeviceCard({ device, onMutate }: { device: any; onMutate: () => void }) {
  const { t, rich, lang, digits, formatDate } = useI18n();
  const devName = device.device_name || device.serial_number;
  const isSuperAdmin = useAuth()?.isSuperAdmin ?? false;
  const isOnline = device.connection_status === 'online';
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  // Phase 3 — Reconciliation Center modal.
  const [showReconcile, setShowReconcile] = useState(false);
  // Phase 5 — Push Templates (central biometric identity deployment).
  const [showPushTemplates, setShowPushTemplates] = useState(false);
  // ── Automatic count polling ──────────────────────────────────────
  // Each machine's user count refreshes on its own while this page is
  // open: a fast count read (getInfo, ~2s) on mount and every 60s,
  // using the device's LAN IP (persisted server-side from the first
  // sync, or remembered in this browser). No clicking required. Devices
  // with no known LAN IP yet are skipped until set once via "Sync users".
  useEffect(() => {
    const lsKey = `drais.lanip.${device.serial_number}`;
    const lanIp = device.lan_ip
      || (typeof window !== 'undefined' ? window.localStorage.getItem(lsKey) : '')
      || '';
    if (!lanIp) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await apiFetch(`/api/attendance/devices/${encodeURIComponent(device.serial_number)}/probe`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_ip: lanIp }), silent: true,
        });
        if (!cancelled) onMutate();
      } catch { /* device may be busy/unreachable; next tick retries */ }
      finally { inFlight = false; }
    };
    poll();
    const t = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [device.serial_number, device.lan_ip, onMutate]);

  // Inventory poll — ask the device for its CURRENT user list (the
  // device's own truth). Prefers a LAN TCP pull (full list, immediate);
  // remembers the device LAN IP per serial. If the operator has no LAN
  // IP, offers the over-the-air ADMS sync (queued, firmware-dependent).
  // The stored device IP is the public/WAN address and isn't probeable.
  const [probing, setProbing] = useState(false);
  const handleSyncUsers = useCallback(async () => {
    const key = `drais.lanip.${device.serial_number}`;
    let lanIp = typeof window !== 'undefined' ? window.localStorage.getItem(key) || '' : '';
    const stored = device.ip_address && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(device.ip_address) ? device.ip_address : '';
    if (!lanIp) {
      lanIp = window.prompt(
        t('devicesPages.devices.card.promptLanUsers', { name: devName }),
        stored || '192.168.1.',
      ) ?? '';
      // null = cancel; empty string = use ADMS
      if (lanIp === null) return;
      if (lanIp) window.localStorage.setItem(key, lanIp);
    }
    setProbing(true);
    try {
      const body = lanIp ? { device_ip: lanIp } : { method: 'adms' };
      const r = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(device.serial_number)}/inventory`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      showToast(r?.method === 'adms' ? 'info' : 'success', lang === 'ar' ? t(r?.method === 'adms' ? 'devicesPages.devices.card.inventoryQueued' : 'devicesPages.devices.card.inventoryDone') : (r?.message ?? 'Inventory sync done'));
      onMutate();
    } catch {
      // Wrong/changed LAN IP → forget it so the next click re-prompts.
      if (lanIp && typeof window !== 'undefined') window.localStorage.removeItem(key);
    } finally {
      setProbing(false);
    }
  }, [device.serial_number, device.ip_address, device.device_name, onMutate]);
  const [editForm, setEditForm] = useState({
    device_name: device.device_name || '',
    location: device.location || '',
    role_label: device.role_label || '',
  });
  const [saving, setSaving] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'sent' | 'acknowledged' | 'failed'>('idle');
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);

  // ── Sync Identities state ──
  const [idSyncing, setIdSyncing] = useState(false);
  const [idProgress, setIdProgress] = useState<{ total: number; pending: number; sent: number; acknowledged: number; failed: number; status: string } | null>(null);
  const [idPolling, setIdPolling] = useState(false);

  // ── Pull Attendance Logs ──
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [pullMode, setPullMode] = useState<'today' | 'full' | 'range'>('today');
  const [pullDateFrom, setPullDateFrom] = useState('');
  const [pullDateTo, setPullDateTo] = useState(toLocalDateStr());
  const [pullStage, setPullStage] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [pullResult, setPullResult] = useState<any>(null);

  const handlePullAttendance = useCallback(async () => {
    const lsKey = `drais.lanip.${device.serial_number}`;
    let lanIp = device.lan_ip
      || (typeof window !== 'undefined' ? window.localStorage.getItem(lsKey) : '')
      || '';
    if (!lanIp) {
      lanIp = window.prompt(
        t('devicesPages.devices.card.promptLanLogs', { name: devName }),
        '192.168.1.',
      ) ?? '';
      if (!lanIp) return;
      if (typeof window !== 'undefined') window.localStorage.setItem(lsKey, lanIp);
    }
    setPullStage('running');
    setPullResult(null);
    try {
      const body: Record<string, unknown> = {
        action: 'pull_attendance',
        device_sn: device.serial_number,
        device_ip: lanIp,
        mode: pullMode,
      };
      if (pullMode === 'range') {
        body.date_from = pullDateFrom;
        body.date_to   = pullDateTo;
      }
      const r = await apiFetch<any>('/api/attendance/zk-tcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        silent: true,
      });
      setPullResult(r);
      setPullStage('done');
      onMutate();
    } catch (err: any) {
      setPullResult({ error: lang === 'ar' ? t('devicesPages.devices.card.pullFailed') : (err?.message || 'Pull failed') });
      setPullStage('error');
    }
  }, [device, pullMode, pullDateFrom, pullDateTo, onMutate]);

  // ── Device action (restart, clear logs, sync time, get info) ──
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const runDeviceAction = useCallback(async (action: string, label: string, confirmMsg?: string) => {
    if (!isOnline) { showToast('error', t('devicesPages.devices.card.offlineNoCmd')); return; }
    if (confirmMsg) {
      const ok = await confirmAction(label, confirmMsg, label);
      if (!ok) return;
    }
    setActionLoading(action);
    try {
      await apiFetch<any>('/api/attendance/zk/devices/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number, action }),
        successMessage: t('devicesPages.devices.card.actionQueued', { label }),
      });
      onMutate();
    } catch { /* apiFetch shows toast */ } finally { setActionLoading(null); }
  }, [device.serial_number, isOnline, onMutate]);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attendance/zk/devices/sync-members?device_sn=${device.serial_number}`);
        const json = await res.json();
        if (!json.success) return;
        const status = json.sync_status;
        setSyncState(status);
        setMemberCount(json.member_count ?? null);
        if (status === 'acknowledged' || status === 'failed' || status === 'expired' || status === 'idle') {
          setPolling(false);
          if (status === 'acknowledged') showToast('success', t('devicesPages.devices.card.membersSynced', { n: json.member_count }));
          else if (status === 'failed' || status === 'expired') showToast('error', t('devicesPages.devices.card.syncFailed'));
        }
      } catch { /* silent */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [polling, device.serial_number]);

  // ── Sync Identities polling ──
  useEffect(() => {
    if (!idPolling) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attendance/zk/devices/sync-identities?device_sn=${device.serial_number}`);
        const json = await res.json();
        if (!json.success) return;
        setIdProgress({
          total: json.total,
          pending: json.pending,
          sent: json.sent,
          acknowledged: json.acknowledged,
          failed: json.failed,
          status: json.sync_status,
        });
        if (json.sync_status === 'complete' || json.sync_status === 'idle' || json.sync_status === 'failed') {
          setIdPolling(false);
          setIdSyncing(false);
          if (json.sync_status === 'complete') showToast('success', t('devicesPages.devices.card.identitiesSynced', { n: json.acknowledged }));
          else if (json.sync_status === 'failed') showToast('error', t('devicesPages.devices.card.identitiesFailures', { n: json.failed }));
          onMutate();
        }
      } catch { /* silent */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [idPolling, device.serial_number, onMutate]);

  const startIdentitySync = useCallback(async () => {
    setIdSyncing(true);
    try {
      const res = await apiFetch<any>('/api/attendance/zk/devices/sync-identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number }),
        successMessage: t('devicesPages.devices.card.identityStarted'),
      });
      if (res.queued === 0) {
        showToast('info', lang === 'ar' ? t('devicesPages.devices.card.allSynced') : (res.message || 'All users already synced'));
        setIdSyncing(false);
        return;
      }
      setIdProgress({ total: res.queued, pending: res.queued, sent: 0, acknowledged: 0, failed: 0, status: 'syncing' });
      setIdPolling(true);
    } catch {
      setIdSyncing(false);
    }
  }, [device.serial_number]);

  const startSync = useCallback(async () => {
    setSyncState('pending');
    setPolling(true);
    try {
      await apiFetch('/api/attendance/zk/devices/sync-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number }),
        successMessage: t('devicesPages.devices.card.syncQueued'),
      });
    } catch {
      setSyncState('idle');
      setPolling(false);
    }
  }, [device.serial_number]);

  // ── Re-sync Device (push all mapped users) ──
  const handleResync = useCallback(async () => {
    if (!isOnline) { showToast('error', t('devicesPages.devices.card.offline')); return; }
    const confirmed = await confirmAction(
      t('devicesPages.devices.card.resyncTitle'),
      t('devicesPages.devices.card.resyncBody', { count: device.expected_user_count ?? t('devicesPages.devices.card.mapped'), name: devName }),
      t('devicesPages.devices.card.resyncTitle'),
    );
    if (!confirmed) return;
    setActionLoading('resync');
    try {
      const res = await apiFetch<any>('/api/devices/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number }),
        successMessage: t('devicesPages.devices.card.resyncQueuedMsg'),
      });
      showToast('success', t('devicesPages.devices.card.resyncCount', { n: res.queued ?? 0 }));
      onMutate();
    } catch { /* apiFetch shows error toast */ } finally { setActionLoading(null); }
  }, [device, isOnline, onMutate]);

  // ── Reset & Rebuild (wipe + re-push all) ──
  const handleResetAndSync = useCallback(async () => {
    if (!isOnline) { showToast('error', t('devicesPages.devices.card.offline')); return; }
    const confirmed = await confirmAction(
      t('devicesPages.devices.card.resetTitle'),
      t('devicesPages.devices.card.resetBody', { name: devName }),
      t('devicesPages.devices.card.resetConfirm'),
    );
    if (!confirmed) return;
    setActionLoading('reset');
    try {
      const res = await apiFetch<any>('/api/devices/reset-and-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_sn: device.serial_number }),
        successMessage: t('devicesPages.devices.card.resetQueuedMsg'),
      });
      showToast('success', t('devicesPages.devices.card.resetCount', { n: res.users_queued ?? 0 }));
      onMutate();
    } catch { /* apiFetch shows error toast */ } finally { setActionLoading(null); }
  }, [device, isOnline, onMutate]);

  // ── Phase 2 — ownership ceremony actions ──
  // Routes were shipped in commit d7ee2e3; this is just the UI handle.
  const [transferLoading, setTransferLoading] = useState<null | 'release' | 'acquire' | 'decommission'>(null);

  const runTransferAction = useCallback(
    async (action: 'release' | 'acquire' | 'decommission', label: string, body: { reason?: string } = {}) => {
      // Ownership-ceremony secret gate. Regular admins must enter the shared
      // DEVICE_CLAIM_SECRET; super-admins are founder-independent and skip it
      // (the backend also bypasses the secret + owner check for super-admins,
      // with device_transfers + audit_logs providing accountability).
      let secret: string | undefined;
      if (!isSuperAdmin) {
        const entered = window.prompt(
          t('devicesPages.devices.card.promptSecret', { action: t(`devicesPages.devices.card.act.${action}`), name: devName }),
        );
        if (entered === null) return; // cancelled
        if (!entered.trim()) {
          showToast('error', t('devicesPages.devices.card.secretRequired'));
          return;
        }
        secret = entered.trim();
      }
      setTransferLoading(action);
      try {
        const r = await fetch(`/api/admin/devices/${encodeURIComponent(device.serial_number)}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, ...(secret ? { secret } : {}) }),
        });
        const j = await r.json();
        const shown = t(`devicesPages.devices.card.label.${label}`, label);
        if (!r.ok) {
          showToast('error', lang === 'ar' || !j.error ? t('devicesPages.devices.card.transferFailed', { label: shown }) : j.error);
          return;
        }
        const impact = j.impact;
        let msg = t('devicesPages.devices.card.transferOk', { label: shown });
        if (impact) {
          const parts: string[] = [];
          if (impact.enrollmentsArchived) parts.push(t('devicesPages.devices.card.impact.enrollments', { n: impact.enrollmentsArchived }));
          if (impact.orphansArchived)     parts.push(t('devicesPages.devices.card.impact.orphans', { n: impact.orphansArchived }));
          if (impact.directoryReassigned) parts.push(t('devicesPages.devices.card.impact.directory', { n: impact.directoryReassigned }));
          if (impact.rawEventsPreserved)  parts.push(t('devicesPages.devices.card.impact.raw', { n: impact.rawEventsPreserved }));
          if (parts.length) msg = `${shown}: ${parts.join(t('common.listSeparator'))}`;
        }
        showToast('success', msg);
        onMutate();
      } catch (err) {
        showToast('error', lang !== 'ar' && err instanceof Error ? err.message : t('devicesPages.devices.card.transferFailed', { label: t(`devicesPages.devices.card.label.${label}`, label) }));
      } finally {
        setTransferLoading(null);
      }
    },
    [device.serial_number, device.device_name, onMutate, isSuperAdmin, t, lang],
  );

  const handleRelease = useCallback(async () => {
    const confirmed = await confirmAction(
      t('devicesPages.devices.card.releaseTitle'),
      t('devicesPages.devices.card.releaseBody', { name: devName }),
      t('devicesPages.devices.card.releaseBtn'),
    );
    if (!confirmed) return;
    await runTransferAction('release', 'Released');
  }, [device, runTransferAction]);

  const handleAcquire = useCallback(async () => {
    const confirmed = await confirmAction(
      t('devicesPages.devices.card.acquireTitle'),
      t('devicesPages.devices.card.acquireBody', { sn: device.serial_number }),
      t('devicesPages.devices.card.acquireBtn'),
    );
    if (!confirmed) return;
    await runTransferAction('acquire', 'Acquired');
  }, [device, runTransferAction]);

  const handleDecommission = useCallback(async () => {
    const confirmed = await confirmAction(
      t('devicesPages.devices.card.decomTitle'),
      t('devicesPages.devices.card.decomBody', { name: devName }),
      t('devicesPages.devices.card.decomBtn'),
    );
    if (!confirmed) return;
    await runTransferAction('decommission', 'Decommissioned');
  }, [device, runTransferAction]);

  const handleDelete = async () => {
    const confirmed = await confirmAction(
      t('devicesPages.devices.card.removeTitle'),
      t('devicesPages.devices.card.removeBody', { name: devName }),
      t('devicesPages.devices.card.removeTitle'),
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiFetch(`/api/attendance/zk/devices?id=${device.id}`, {
        method: 'DELETE',
        successMessage: t('devicesPages.devices.card.removed'),
      });
      onMutate();
    } catch {
      // apiFetch shows toast
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/attendance/zk/devices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: device.id,
          device_name: editForm.device_name || null,
          location: editForm.location || null,
          role_label: editForm.role_label || null,
        }),
        successMessage: t('devicesPages.devices.card.updated'),
      });
      setEditing(false);
      onMutate();
    } catch {
      // apiFetch shows toast
    } finally {
      setSaving(false);
    }
  };

  const syncLabel: Record<string, string> = {
    idle: t('devicesPages.devices.card.sync.idle'),
    pending: t('devicesPages.devices.card.sync.pending'),
    sent: t('devicesPages.devices.card.sync.sent'),
    acknowledged: t('devicesPages.devices.card.sync.acknowledged', { n: memberCount ?? '?' }),
    failed: t('devicesPages.devices.card.sync.failed'),
  };

  const lastSeenSeconds = device.last_heartbeat
    ? Math.floor((Date.now() - new Date(device.last_heartbeat).getTime()) / 1000)
    : 99999;

  const syncStatus: string = device.sync_status || 'unknown';
  const isOutOfSync = syncStatus === 'out_of_sync';

  return (
    <div className={`relative bg-white dark:bg-slate-800 rounded-xl border overflow-hidden transition-all ${
      isOutOfSync
        ? 'border-red-300 dark:border-red-700 shadow-red-100 dark:shadow-red-900/20 shadow-md'
        : isOnline ? 'border-green-200 dark:border-green-800 shadow-sm' : 'border-red-200 dark:border-red-800/50 opacity-90'
    }`}>
      <div className={`h-1 ${isOutOfSync ? 'bg-gradient-to-r from-red-500 to-orange-500' : isOnline ? 'bg-green-500' : 'bg-red-500'}`} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isOnline ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              {isOnline ? <Wifi className="w-5 h-5 text-green-600" /> : <WifiOff className="w-5 h-5 text-red-500" />}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                {device.device_name || device.serial_number}
              </h3>
              <p className="text-xs text-gray-500 font-mono">{device.serial_number}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
              isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
              {isOnline ? t('devicesPages.devices.card.online') : t('devicesPages.devices.card.offlineLabel')}
            </span>
            <SyncStatusBadge status={syncStatus} />
          </div>
        </div>

        {/* Phase 3 — Reconciliation Center entry */}
        <button
          onClick={() => setShowReconcile(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <ClipboardList className="w-4 h-4" /> {t('devicesPages.devices.card.reconcile')}
        </button>
        {showReconcile && (
          <DeviceReconciliationModal
            sn={device.serial_number}
            deviceName={device.device_name}
            onClose={() => { setShowReconcile(false); onMutate(); }}
          />
        )}

        {/* Phase 5 — Push Templates: deploy stored fingerprint templates
            to this device without re-enrollment (central biometric identity). */}
        <button
          onClick={() => setShowPushTemplates(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
        >
          <Send className="w-4 h-4" /> {t('devicesPages.devices.card.pushTemplates')}
        </button>
        {showPushTemplates && (
          <PushTemplatesModal
            sn={device.serial_number}
            deviceName={device.device_name}
            onClose={() => { setShowPushTemplates(false); onMutate(); }}
          />
        )}

        {/* ── Pull Attendance Logs dialog ── */}
        {showPullDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5 text-blue-600" />
                  <h2 className="font-semibold text-gray-900 dark:text-white text-sm">
                    {t('devicesPages.devices.card.pullTitle')}
                  </h2>
                </div>
                <button onClick={() => { setShowPullDialog(false); setPullStage('idle'); setPullResult(null); }}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Device info */}
                <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('devicesPages.devices.card.info.device')}</span>
                    <span className="font-mono font-medium text-gray-800 dark:text-gray-200">{device.device_name || device.serial_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('devicesPages.devices.card.info.serial')}</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300">{device.serial_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('devicesPages.devices.card.info.lanIp')}</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300">{device.lan_ip || t('devicesPages.devices.card.info.notSet')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('devicesPages.devices.card.info.status')}</span>
                    <span className={`font-semibold ${isOnline ? 'text-green-600' : 'text-red-500'}`}>
                      {isOnline ? t('devicesPages.devices.card.online') : t('devicesPages.devices.card.offlineLabel')}
                    </span>
                  </div>
                </div>

                {/* Mode selector */}
                {pullStage === 'idle' && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('devicesPages.devices.card.selectRange')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(['today', 'full', 'range'] as const).map(m => (
                        <button key={m} onClick={() => setPullMode(m)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                            pullMode === m
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                          }`}>
                          {t(`devicesPages.devices.card.mode.${m}`)}
                        </button>
                      ))}
                    </div>
                    {pullMode === 'range' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">{t('devicesPages.devices.card.from')}</label>
                          <input type="date" value={pullDateFrom} onChange={e => setPullDateFrom(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">{t('devicesPages.devices.card.to')}</label>
                          <input type="date" value={pullDateTo} onChange={e => setPullDateTo(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white" />
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400">
                      {t(`devicesPages.devices.card.modeHelp.${pullMode}`)}
                    </p>
                  </div>
                )}

                {/* Running */}
                {pullStage === 'running' && (
                  <div className="flex flex-col items-center py-6 gap-3">
                    <Loader className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('devicesPages.devices.card.connecting')}</p>
                    <p className="text-xs text-gray-400">{t('devicesPages.devices.card.downloading')}</p>
                  </div>
                )}

                {/* Done */}
                {pullStage === 'done' && pullResult && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-sm font-semibold">{t('devicesPages.devices.card.pullComplete')}</span>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">{t('devicesPages.devices.card.res.onDevice')}</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{pullResult.totalOnDevice != null ? digits(pullResult.totalOnDevice) : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">{t('devicesPages.devices.card.res.matching')}</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{pullResult.filteredCount != null ? digits(pullResult.filteredCount) : '—'}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 mt-1">
                        <span className="text-green-600 font-medium">{t('devicesPages.devices.card.res.inserted')}</span>
                        <span className="font-bold text-green-700 dark:text-green-400">{digits(pullResult.inserted ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-500 font-medium">{t('devicesPages.devices.card.res.duplicates')}</span>
                        <span className="font-semibold text-blue-600">{digits(pullResult.duplicates ?? 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-500 font-medium">{t('devicesPages.devices.card.res.unmatched')}</span>
                        <span className="font-semibold text-amber-600">{digits(pullResult.unmatched ?? 0)}</span>
                      </div>
                      {(pullResult.failed ?? 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-red-500 font-medium">{t('devicesPages.devices.card.res.failed')}</span>
                          <span className="font-semibold text-red-600">{digits(pullResult.failed)}</span>
                        </div>
                      )}
                    </div>
                    {(pullResult.unmatched ?? 0) > 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {t('devicesPages.devices.card.unmatchedNote', { count: pullResult.unmatched })}
                      </p>
                    )}
                  </div>
                )}

                {/* Error */}
                {pullStage === 'error' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="text-sm font-semibold">{t('devicesPages.devices.card.pullFailedTitle')}</span>
                    </div>
                    <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                      {pullResult?.error || t('devicesPages.devices.card.unknownError')}
                    </p>
                    <p className="text-[11px] text-gray-400">{t('devicesPages.devices.card.portHelp')}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                {pullStage === 'idle' && (
                  <button onClick={handlePullAttendance}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                    <Download className="w-4 h-4" />
                    {t('devicesPages.devices.card.pullLogs')}
                  </button>
                )}
                {pullStage === 'running' && (
                  <button disabled className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-400 text-white rounded-lg text-sm font-medium cursor-wait">
                    <Loader className="w-4 h-4 animate-spin" /> {t('devicesPages.devices.card.pulling')}
                  </button>
                )}
                {(pullStage === 'done' || pullStage === 'error') && (
                  <button onClick={() => { setPullStage('idle'); setPullResult(null); }}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    {t('devicesPages.devices.card.pullAgain')}
                  </button>
                )}
                <button onClick={() => { setShowPullDialog(false); setPullStage('idle'); setPullResult(null); }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                  {t('devicesPages.devices.card.close')}
                </button>
              </div>
            </div>
          </div>
        )}

        {editing ? (
          <div className="space-y-2">
            <input type="text" placeholder={t('devicesPages.devices.card.edit.name')} value={editForm.device_name}
              onChange={(e) => setEditForm({ ...editForm, device_name: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900" />
            <input type="text" placeholder={t('devicesPages.devices.card.edit.location')} value={editForm.location}
              onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900" />
            <input type="text" placeholder={t('devicesPages.devices.card.edit.role')} value={editForm.role_label}
              onChange={(e) => setEditForm({ ...editForm, role_label: e.target.value })}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-900" />
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} disabled={saving}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs">
                {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {t('devicesPages.devices.card.save')}
              </button>
              <button onClick={() => setEditing(false)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-gray-300 rounded-lg text-xs">
                <X className="w-3.5 h-3.5" /> {t('devicesPages.devices.card.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4 shrink-0" />
                <span>{rich('devicesPages.devices.card.lastSeen', { ago: <span className="font-medium text-gray-800 dark:text-gray-200">{formatTimeAgo(t, lastSeenSeconds)}</span> })}</span>
              </div>
              {device.ip_address && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span className="font-mono text-xs">{device.ip_address}</span>
                </div>
              )}
              {device.location && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Settings className="w-4 h-4 shrink-0" />
                  <span className="text-xs">{device.location}</span>
                </div>
              )}
              {device.role_label && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">{device.role_label}</span>
                </div>
              )}
              {device.model && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Hash className="w-4 h-4 shrink-0" />
                  <span className="text-xs">{device.model}</span>
                </div>
              )}

              {/* Inventory truth — device-confirmed users vs DRAIS-expected.
                  The count comes ONLY from the device's latest inventory
                  response; never a DB guess. */}
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Users className="w-3.5 h-3.5 text-green-500" />
                  {(() => {
                    // Live count: device_user_count is updated by polls AND
                    // by realtime keypad-enrollment pushes (OPERLOG). Fall
                    // back to the last completed run; "unknown" if neither.
                    const onDevice = device.device_user_count ?? device.device_confirmed_users ?? null;
                    return (
                      <span>{rich('devicesPages.devices.card.onDevice', { n: onDevice != null ? (
                        <strong className="text-gray-800 dark:text-gray-200">{digits(onDevice)}</strong>
                      ) : (
                        <strong className="text-amber-600" title={t('devicesPages.devices.card.unknownTitle')}>{t('devicesPages.devices.card.unknown')}</strong>
                      ) })}</span>
                    );
                  })()}
                  <button
                    onClick={handleSyncUsers}
                    disabled={probing}
                    title={t('devicesPages.devices.card.syncUsersTitle')}
                    className="ms-1 inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                  >
                    {probing ? <Loader className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    <span className="text-[11px] font-medium">{t('devicesPages.devices.card.syncUsers')}</span>
                  </button>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  <span>{rich('devicesPages.devices.card.expected', { n: <strong className="text-gray-800 dark:text-gray-200">{digits(device.mapped_users ?? 0)}</strong> })}</span>
                </div>
              </div>

              {/* Inventory status line */}
              <div className="flex items-center gap-2 text-[11px] pt-0.5">
                <InventoryBadge
                  status={device.inventory_status}
                  stale={device.inventory_is_stale}
                  method={device.inventory_method}
                />
                {device.inventory_synced_at && (
                  <span className="text-gray-400">
                    {t('devicesPages.devices.card.syncedAgo', { ago: formatTimeAgo(t, Math.floor((Date.now() - new Date(device.inventory_synced_at).getTime()) / 1000)) })}
                  </span>
                )}
                {(() => {
                  const onDevice = device.device_user_count ?? device.device_confirmed_users ?? null;
                  return onDevice != null && device.mapped_users != null && onDevice !== device.mapped_users ? (
                    <span className="text-amber-600 font-medium">{t('devicesPages.devices.card.mismatch', { device: onDevice, drais: device.mapped_users })}</span>
                  ) : null;
                })()}
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                <span>{rich('devicesPages.devices.card.today', { n: <strong>{digits(device.today_punches || 0)}</strong> })}</span>
                <span>{rich('devicesPages.devices.card.pending', { n: <strong>{digits(device.pending_commands || 0)}</strong> })}</span>
              </div>

              {/* Template deployment readiness (Phase 4/5 — central
                  biometric identity). Reads template_distributions via
                  Push Templates' own machinery, never a separate counter. */}
              {Number(device.templates_total || 0) > 0 && (
                <div className="flex items-center gap-2 text-xs pt-0.5">
                  <Fingerprint className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-gray-500">{rich('devicesPages.devices.card.templates', { loaded: <strong className="text-gray-800 dark:text-gray-200">{digits(device.templates_loaded)}</strong>, total: <strong className="text-gray-800 dark:text-gray-200">{digits(device.templates_total)}</strong> })}</span>
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    device.template_sync_status === 'healthy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : device.template_sync_status === 'attention' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}>
                    {device.template_sync_status === 'healthy' ? t('devicesPages.devices.card.tpl.healthy') : device.template_sync_status === 'attention' ? t('devicesPages.devices.card.tpl.failed', { n: device.templates_failed }) : t('devicesPages.devices.card.tpl.syncing')}
                  </span>
                </div>
              )}
            </div>

            {/* Out-of-sync alert strip */}
            {isOutOfSync && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <p className="text-[11px] text-red-700 dark:text-red-300 font-medium">
                  {t('devicesPages.devices.card.mismatchStrip')}
                </p>
              </div>
            )}

            {/* Sync Identities — progress bar */}
            {(idSyncing || (idProgress && idProgress.status === 'syncing')) && idProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-600 font-medium flex items-center gap-1">
                    <Send className="w-3 h-3" /> {t('devicesPages.devices.card.syncingIdentities')}
                  </span>
                  <span className="text-gray-500 font-mono">
                    {digits(`${idProgress.sent + idProgress.acknowledged}/${idProgress.total}`)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${idProgress.total > 0 ? Math.round(((idProgress.sent + idProgress.acknowledged) / idProgress.total) * 100) : 0}%` }} />
                </div>
                <div className="flex gap-3 text-[10px] text-gray-400">
                  <span>{t('devicesPages.devices.card.prog.pending', { n: idProgress.pending })}</span>
                  <span>{t('devicesPages.devices.card.prog.sent', { n: idProgress.sent })}</span>
                  <span className="text-green-600">{t('devicesPages.devices.card.prog.done', { n: idProgress.acknowledged })}</span>
                  {idProgress.failed > 0 && <span className="text-red-500">{t('devicesPages.devices.card.prog.failed', { n: idProgress.failed })}</span>}
                </div>
              </div>
            )}

            {/* View Members sync status */}
            {(syncState !== 'idle') && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {(syncState === 'pending' || syncState === 'sent')
                  ? <Loader className="w-3 h-3 animate-spin text-blue-500" />
                  : syncState === 'acknowledged' ? <CheckCircle className="w-3 h-3 text-green-600" />
                  : null}
                <span>{syncLabel[syncState]}</span>
              </div>
            )}

            {/* ═══ ICON-ONLY ACTION BAR ═══ */}
            <div className="flex items-center justify-between gap-1 pt-1 border-t border-gray-100 dark:border-gray-700">
              {/* Sync Users */}
              <ActionIcon
                icon={<UserPlus className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.syncUsers')}
                color="purple"
                loading={idSyncing}
                done={idProgress?.status === 'complete'}
                disabled={!isOnline}
                onClick={startIdentitySync}
              />
              {/* Pull Users from Device */}
              <ActionIcon
                icon={<Download className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.pullUsers')}
                color="blue"
                loading={syncState === 'pending' || syncState === 'sent'}
                done={syncState === 'acknowledged'}
                disabled={!isOnline}
                onClick={startSync}
              />
              {/* Pull Attendance Logs */}
              <ActionIcon
                icon={<ClipboardList className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.pullLogs')}
                color="green"
                loading={pullStage === 'running'}
                done={pullStage === 'done'}
                onClick={() => { setPullStage('idle'); setPullResult(null); setShowPullDialog(true); }}
              />
              {/* Re-sync (push DB → device) */}
              <ActionIcon
                icon={<RotateCcw className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.resync')}
                color={isOutOfSync ? 'red' : 'blue'}
                loading={actionLoading === 'resync'}
                disabled={!isOnline}
                onClick={handleResync}
              />
              {/* Sync Time */}
              <ActionIcon
                icon={<Timer className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.syncTime')}
                color="teal"
                loading={actionLoading === 'sync_time'}
                disabled={!isOnline}
                onClick={() => runDeviceAction('sync_time', t('devicesPages.devices.card.action.syncTime'))}
              />
              {/* Clear Logs */}
              <ActionIcon
                icon={<ClipboardList className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.clearLogs')}
                color="orange"
                loading={actionLoading === 'clear_logs'}
                disabled={!isOnline}
                onClick={() => runDeviceAction('clear_logs', t('devicesPages.devices.card.action.clearLogs'), t('devicesPages.devices.card.action.clearLogsBody', { name: devName }))}
              />
              {/* Restart */}
              <ActionIcon
                icon={<Power className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.restart')}
                color="red"
                loading={actionLoading === 'restart'}
                disabled={!isOnline}
                onClick={() => runDeviceAction('restart', t('devicesPages.devices.card.action.restartShort'), t('devicesPages.devices.card.action.restartBody', { name: devName }))}
              />
              {/* Reset & Rebuild */}
              <ActionIcon
                icon={<ShieldAlert className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.reset')}
                color="orange"
                loading={actionLoading === 'reset'}
                disabled={!isOnline}
                onClick={handleResetAndSync}
              />
              {/* Device ownership (release / acquire / decommission) is a
                  PLATFORM operation managed by Xhenvolt Control — never at the
                  school level, so one tenant can't affect another's hardware.
                  These controls are visible only to Xhenvolt super-admins; the
                  server enforces the same rule regardless of the UI. */}
              {isSuperAdmin && (
                <>
                  <ActionIcon
                    icon={<LogOut className="w-4 h-4" />}
                    label={t('devicesPages.devices.card.action.release')}
                    color="orange"
                    loading={transferLoading === 'release'}
                    disabled={device.status === 'released' || device.status === 'retired'}
                    onClick={handleRelease}
                  />
                  <ActionIcon
                    icon={<LogIn className="w-4 h-4" />}
                    label={t('devicesPages.devices.card.action.acquire')}
                    color="teal"
                    loading={transferLoading === 'acquire'}
                    disabled={device.status !== 'released'}
                    onClick={handleAcquire}
                  />
                  <ActionIcon
                    icon={<Archive className="w-4 h-4" />}
                    label={t('devicesPages.devices.card.action.decommission')}
                    color="red"
                    loading={transferLoading === 'decommission'}
                    disabled={device.status === 'retired'}
                    onClick={handleDecommission}
                  />
                </>
              )}
              {/* Edit */}
              <ActionIcon
                icon={<Edit2 className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.edit')}
                color="gray"
                onClick={() => { setEditForm({ device_name: device.device_name || '', location: device.location || '', role_label: device.role_label || '' }); setEditing(true); }}
              />
              {/* Delete */}
              <ActionIcon
                icon={deleting ? <Loader className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                label={t('devicesPages.devices.card.action.remove')}
                color="red"
                loading={deleting}
                onClick={handleDelete}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Tiny icon button with tooltip for the device action bar */
function ActionIcon({ icon, label, color, loading, done, disabled, onClick }: {
  icon: React.ReactNode;
  label: string;
  color: 'purple' | 'blue' | 'red' | 'orange' | 'teal' | 'gray' | 'green';
  loading?: boolean;
  done?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    purple: 'hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-600',
    blue:   'hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600',
    red:    'hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500',
    orange: 'hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600',
    teal:   'hover:bg-teal-100 dark:hover:bg-teal-900/30 text-teal-600',
    gray:   'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500',
    green:  'hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
      className={`relative p-2 rounded-lg transition-all ${
        disabled ? 'opacity-40 cursor-not-allowed'
          : loading ? 'cursor-wait opacity-70'
          : done ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
          : colorMap[color]
      }`}
    >
      {loading ? <Loader className="w-4 h-4 animate-spin" /> : done ? <CheckCircle className="w-4 h-4 text-green-600" /> : icon}
    </button>
  );
}
