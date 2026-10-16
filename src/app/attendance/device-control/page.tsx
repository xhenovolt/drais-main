'use client';

/**
 * Device Control — biometric device operations & attendance acquisition center.
 *
 * Phase 3 of docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md (approved).
 * Four sections: Device Status · Attendance Acquisition (staged wizard) ·
 * Device Operations · Diagnostics. Every pre-redesign action is preserved,
 * regrouped. The free-text "clock offset (minutes)" input is retired (RC-5 —
 * it silently replaced the timezone offset in punch math).
 *
 * Acquisition wizard (mission Phases 1–5):
 *   pull for ONE date → raw inspection (verbatim device wall times, no
 *   formatting, no timezone conversion) → first-3/last-3 anchors → operator
 *   ✓/✗ → Preview / Save / Export / Discard. Staging only — nothing touches
 *   attendance_raw_events until the Phase 4 committer is enabled.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Wifi, WifiOff, Lock, Unlock, Fingerprint, Monitor, RefreshCw,
  Send, Loader, Users, Clock, Terminal, Type, AlertTriangle,
  CheckCircle, XCircle, ChevronDown, ChevronRight, Trash2, Download, Globe,
  CalendarDays, Search, ShieldCheck, History, Activity, FileDown, Eye,
} from 'lucide-react';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { toLocalDateStr } from '@/lib/datetime/local-date';
import { useI18n } from '@/components/i18n/I18nProvider';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ─── Legacy attendance-result rendering (preserved) ─────────────────────────

function isAttendanceResponse(data: any) {
  return Array.isArray(data?.data) && data.data.length > 0 && (
    data.data[0].deviceUserId !== undefined ||
    data.data[0].device_user_id !== undefined ||
    data.data[0].recordTime !== undefined ||
    data.data[0].record_date !== undefined
  );
}

function getAttendanceValue(row: any, key: string) {
  switch (key) {
    case 'date':
      return row.record_date || (row.recordTime ? row.recordTime.slice(0, 10) : row.check_time?.slice(0, 10)) || '';
    case 'time':
      return row.record_time || (row.recordTime ? row.recordTime.slice(11, 19) : row.check_time?.slice(11, 19)) || '';
    case 'staff':
      return 'staff'; // label translated at render
    case 'device_user_id':
      return row.deviceUserId ?? row.device_user_id ?? '';
    case 'device_name':
      return row.deviceName ?? row.device_name ?? '';
    case 'drais_name':
      return row.draisName ?? row.drais_name ?? row.displayName ?? '';
    case 'role_type':
      return row.roleType ?? row.role_type ?? '';
    case 'matched':
      return row.matched ? 'yes' : 'no';
    case 'verification':
      return row.verification ?? row.verify_type ?? '';
    case 'status':
      return row.status ?? row.io_mode ?? '';
    default:
      return '';
  }
}

function AttendanceResultTable({ rows }: { rows: any[] }) {
  const { t } = useI18n();
  const columns = ['date', 'time', 'staff', 'device_user_id', 'device_name', 'drais_name', 'role_type', 'matched', 'verification', 'status']
    .map((key) => ({ key, label: t(`devicesPages.control.col.${key}`) }));
  const cell = (r: any, key: string) => {
    const v = String(getAttendanceValue(r, key));
    return key === 'staff' || key === 'matched' ? t(`devicesPages.control.val.${v}`, v) : v;
  };
  return (
    <div className="overflow-x-auto max-h-64 border border-gray-100 dark:border-gray-700 rounded">
      <table className="text-xs w-full">
        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
          <tr>
            {columns.map(c => (
              <th key={c.key} className="px-2 py-1.5 text-start font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {rows.slice(0, 200).map((r, i) => (
            <tr key={i}>
              {columns.map(c => (
                <td key={c.key} className="px-2 py-1 text-gray-700 dark:text-gray-300 whitespace-nowrap font-mono">{cell(r, c.key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section shell ──────────────────────────────────────────────────────────

function Section({
  icon, title, subtitle, defaultOpen = true, children,
}: {
  icon: React.ReactNode; title: string; subtitle?: string;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-start"
      >
        <span className="text-indigo-500">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-gray-900 dark:text-white">{title}</span>
          {subtitle && <span className="block text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Wizard types ───────────────────────────────────────────────────────────

interface WizardValidation {
  records: number;
  matched: number;
  unmatched: number;
  duplicates: number;
  futureFlagged: number;
  first3: Array<{ pin: string; wall: string; name: string | null }>;
  last3: Array<{ pin: string; wall: string; name: string | null }>;
  deviceWallNow: string | null;
  serverWallNow: string;
  clockDeltaSeconds: number | null;
  warnings: string[];
}

interface WizardState {
  step: 'idle' | 'pulling' | 'inspect' | 'decide' | 'saving' | 'saved' | 'discarded' | 'error';
  saveResult?: { committed: number; duplicates: number; invalid: number; evaluated: number; tzOffsetMinutes: number };
  date: string;
  acquisitionId?: number;
  staged?: number;
  totalOnDevice?: number;
  validation?: WizardValidation;
  records: any[];
  search: string;
  page: number;
  rejected?: boolean;
  error?: string;
}

const PAGE_SIZE = 50;
const todayStr = () => toLocalDateStr();

export default function DeviceControlPage() {
  const { t, lang, digits } = useI18n();
  const ar = lang === 'ar';
  const okMsg = (m?: string) => (ar || !m ? t('devicesPages.control.done') : m);
  const errMsg = (m?: string) => (ar || !m ? t('devicesPages.control.failed') : m);
  // Pull-validation warnings are English sentences (acquisition/validate.ts).
  const warning = (w: string) => {
    let m = /^Device clock differs from server by (-?\d+)s \(device wall (.+), expected ~(.+)\)\.$/.exec(w);
    if (m) return t('devicesPages.control.warn.clock', { delta: m[1], device: m[2], server: m[3] });
    m = /^(\d+) punch\(es\) are timestamped in the device's future — inspect before saving\.$/.exec(w);
    if (m) return t('devicesPages.control.warn.future', { n: m[1] });
    return w;
  };
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
  const [wiz, setWiz] = useState<WizardState>({ step: 'idle', date: todayStr(), records: [], search: '', page: 0 });

  const { data: devicesData } = useSWR<any>('/api/devices/list', fetcher);
  const devices = devicesData?.data || [];
  const { data: acqData, mutate: refreshAcquisitions } = useSWR<any>('/api/attendance/acquisitions?limit=25', fetcher);
  const acquisitions = acqData?.data || [];

  React.useEffect(() => {
    if (!deviceSn && devices.length > 0) {
      const online = devices.find((d: any) => d.seconds_ago != null && d.seconds_ago <= 120);
      if (online) setDeviceSn(online.sn);
      else if (devices[0]) setDeviceSn(devices[0].sn);
    }
  }, [devices, deviceSn]);

  const addResult = useCallback((action: string, data: any, success: boolean) => {
    setResults(prev => [{
      id: Date.now(), action, data, success, time: new Date().toLocaleTimeString(),
    }, ...prev].slice(0, 30));
  }, []);

  const deviceParams = useCallback((params: URLSearchParams | Record<string, any>) => {
    if (params instanceof URLSearchParams) {
      if (useDirectIp) { params.set('device_ip', directIp); params.set('device_port', directPort); }
      else params.set('device_sn', deviceSn);
      return params;
    }
    if (useDirectIp) { params.device_ip = directIp; params.device_port = directPort; }
    else params.device_sn = deviceSn;
    return params;
  }, [useDirectIp, directIp, directPort, deviceSn]);

  const requireTarget = () => {
    if (!useDirectIp && !deviceSn) { showToast('error', t('devicesPages.control.selectTarget')); return false; }
    if (useDirectIp && !directIp) { showToast('error', t('devicesPages.control.enterIp')); return false; }
    return true;
  };

  // ── Legacy GET/POST plumbing (preserved) ──────────────────────────────
  const doGet = async (action: string, label: string) => {
    if (!requireTarget()) return;
    setBusy(action);
    try {
      const params = deviceParams(new URLSearchParams({ action })) as URLSearchParams;
      const url = `/api/attendance/zk-tcp?${params}`;
      if (action === 'attendance_csv') {
        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.text();
          addResult(label, { error: err }, false);
          showToast('error', errMsg(err));
        } else {
          const blob = await res.blob();
          const fname = res.headers.get('content-disposition')?.match(/filename="?(.*)"?/)?.[1] || 'attendance.csv';
          const urlObj = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = urlObj; a.download = fname;
          document.body.appendChild(a); a.click(); a.remove();
          window.URL.revokeObjectURL(urlObj);
          addResult(label, { message: 'CSV downloaded', filename: fname }, true);
          showToast('success', t('devicesPages.control.csvDownloaded'));
        }
      } else {
        const res = await fetch(url);
        const json = await res.json();
        addResult(label, json, json.success);
        if (!json.success) showToast('error', errMsg(json.error));
      }
    } catch (err: any) {
      addResult(label, { error: err.message }, false);
      showToast('error', errMsg(err.message));
    } finally {
      setBusy(null);
    }
  };

  const doPost = async (action: string, label: string, extra: Record<string, any> = {}) => {
    if (!requireTarget()) return;
    setBusy(action);
    try {
      const payload: any = deviceParams({ action, ...extra });
      const res = await fetch('/api/attendance/zk-tcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      addResult(label, json, json.success);
      if (json.success) showToast('success', okMsg(json.message));
      else showToast('error', errMsg(json.error));
    } catch (err: any) {
      addResult(label, { error: err.message }, false);
      showToast('error', errMsg(err.message));
    } finally {
      setBusy(null);
    }
  };

  // ── Acquisition wizard actions ─────────────────────────────────────────
  const fetchRecords = async (acqId: number): Promise<any[]> => {
    const det = await fetch(`/api/attendance/acquisitions?id=${acqId}`).then(r => r.json());
    return det?.records || [];
  };

  const startPull = async (dateOverride?: string) => {
    if (!requireTarget()) return;
    const date = dateOverride ?? wiz.date;
    setWiz(w => ({ ...w, step: 'pulling', date, error: undefined, rejected: false, saveResult: undefined }));
    setTimeCheck({ device: '', real: '', answered: false, appliedDrift: null });
    try {
      const payload: any = deviceParams({ action: 'stage_pull', date });
      const res = await fetch('/api/attendance/zk-tcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Pull failed');
      let records: any[] = [];
      if (json.acquisitionId != null) records = await fetchRecords(json.acquisitionId);
      // Prefill the time check from the device's probed clock; real time
      // from the operator's browser (their watch is the authority).
      setTimeCheck({
        device: json.validation?.deviceWallNow ? String(json.validation.deviceWallNow).slice(11, 19) : '',
        real: new Date().toTimeString().slice(0, 8),
        answered: false,
        appliedDrift: null,
      });
      setWiz(w => ({
        ...w,
        step: 'inspect',
        acquisitionId: json.acquisitionId,
        staged: json.staged,
        totalOnDevice: json.totalOnDevice,
        validation: json.validation,
        records,
        page: 0,
        search: '',
      }));
      refreshAcquisitions();
    } catch (err: any) {
      setWiz(w => ({ ...w, step: 'error', error: ar ? t('devicesPages.control.pullFailed') : err.message }));
      showToast('error', errMsg(err.message));
    }
  };

  // ── Operator time check (drift correction) ─────────────────────────────
  const [timeCheck, setTimeCheck] = useState<{ device: string; real: string; answered: boolean; appliedDrift: number | null }>({
    device: '', real: '', answered: false, appliedDrift: null,
  });
  const liveDriftSeconds = useMemo(() => {
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(timeCheck.device) || !/^\d{2}:\d{2}(:\d{2})?$/.test(timeCheck.real)) return null;
    const t = (s: string) => { const [h, m, sec] = s.split(':').map(Number); return h * 3600 + m * 60 + (sec || 0); };
    return t(timeCheck.device) - t(timeCheck.real);
  }, [timeCheck.device, timeCheck.real]);

  const applyCorrection = async () => {
    if (!wiz.acquisitionId || liveDriftSeconds == null) return;
    const today = todayStr();
    const norm = (s: string) => (s.length === 5 ? `${s}:00` : s);
    try {
      const res = await fetch('/api/attendance/acquisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: wiz.acquisitionId,
          action: 'apply_correction',
          deviceWall: `${today} ${norm(timeCheck.device)}`,
          realWall: `${today} ${norm(timeCheck.real)}`,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Correction failed');
      const records = await fetchRecords(wiz.acquisitionId);
      setWiz(w => ({ ...w, records }));
      setTimeCheck(tc => ({ ...tc, answered: true, appliedDrift: json.driftSeconds }));
      showToast('success', json.corrected
        ? t('devicesPages.control.correctionApplied', { n: -json.driftSeconds })
        : t('devicesPages.control.clockVerified'));
    } catch (err: any) {
      showToast('error', errMsg(err.message));
    }
  };

  const acceptClock = async () => {
    if (!wiz.acquisitionId) return;
    if (timeCheck.appliedDrift) {
      // Operator changed their mind after applying — clear it.
      try {
        await fetch('/api/attendance/acquisitions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: wiz.acquisitionId, action: 'clear_correction' }),
        });
        const records = await fetchRecords(wiz.acquisitionId);
        setWiz(w => ({ ...w, records }));
      } catch { /* keep going */ }
    }
    setTimeCheck(tc => ({ ...tc, answered: true, appliedDrift: null }));
  };

  const saveBatch = async () => {
    if (!wiz.acquisitionId) return;
    if (!confirm(t('devicesPages.control.confirmSave', { n: wiz.staged }))) return;
    setWiz(w => ({ ...w, step: 'saving' }));
    try {
      const res = await fetch('/api/attendance/acquisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wiz.acquisitionId, action: 'commit' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      setWiz(w => ({ ...w, step: 'saved', saveResult: json }));
      refreshAcquisitions();
      showToast('success', t('devicesPages.control.saved', { n: json.committed }));
    } catch (err: any) {
      setWiz(w => ({ ...w, step: 'decide' }));
      showToast('error', errMsg(err.message));
    }
  };

  const discardBatch = async () => {
    if (!wiz.acquisitionId) return;
    try {
      const res = await fetch('/api/attendance/acquisitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: wiz.acquisitionId, action: 'discard' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Discard failed');
      setWiz(w => ({ ...w, step: 'discarded' }));
      refreshAcquisitions();
      showToast('success', t('devicesPages.control.discarded'));
    } catch (err: any) {
      showToast('error', errMsg(err.message));
    }
  };

  const downloadRaw = (fmt: 'json' | 'csv') => {
    if (!wiz.records.length) return;
    let blob: Blob; let name: string;
    if (fmt === 'json') {
      blob = new Blob([JSON.stringify(wiz.records, null, 2)], { type: 'application/json' });
      name = `acquisition_${wiz.acquisitionId}_raw.json`;
    } else {
      const head = 'device_pin,device_wall_time,name,verify_type,flags';
      const lines = wiz.records.map((r: any) =>
        [r.device_user_id, r.device_wall_time, r.display_name ?? '', r.verify_type ?? '', r.validation_flags ?? '']
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' });
      name = `acquisition_${wiz.acquisitionId}_raw.csv`;
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  };

  const filteredRecords = useMemo(() => {
    const q = wiz.search.trim().toLowerCase();
    if (!q) return wiz.records;
    return wiz.records.filter((r: any) =>
      String(r.device_user_id).toLowerCase().includes(q) ||
      String(r.display_name ?? '').toLowerCase().includes(q) ||
      String(r.device_wall_time).includes(q) ||
      String(r.validation_flags ?? '').includes(q));
  }, [wiz.records, wiz.search]);
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pageRecords = filteredRecords.slice(wiz.page * PAGE_SIZE, (wiz.page + 1) * PAGE_SIZE);
  const anchorIds = useMemo(() => {
    const v = wiz.validation;
    if (!v) return new Set<string>();
    return new Set([...v.first3, ...v.last3].map(a => `${a.pin}|${a.wall}`));
  }, [wiz.validation]);

  const selectedDevice = devices.find((d: any) => d.sn === deviceSn);
  const isOnline = selectedDevice?.seconds_ago != null && selectedDevice.seconds_ago <= 120;

  const v = wiz.validation;
  const hasCorrection = useMemo(() => wiz.records.some((r: any) => r.corrected_wall_time), [wiz.records]);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <Terminal className="w-7 h-7 text-indigo-500" />
          {t('devicesPages.control.title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('devicesPages.control.subtitle')}
        </p>
      </div>

      {/* Device Selector */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUseDirectIp(false)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${!useDirectIp ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
          >
            {t('devicesPages.control.registered')}
          </button>
          <button
            onClick={() => setUseDirectIp(true)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition flex items-center gap-1.5 ${useDirectIp ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
          >
            <Globe className="w-3.5 h-3.5" />
            {t('devicesPages.control.directIp')}
          </button>
        </div>

        {useDirectIp ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.ipLabel')}</label>
              <input
                type="text" value={directIp} onChange={(e) => setDirectIp(e.target.value)}
                placeholder={t('devicesPages.control.ipPh')}
                className="w-full sm:w-64 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.port')}</label>
              <input
                type="number" value={directPort} onChange={(e) => setDirectPort(e.target.value)}
                placeholder="4370"
                className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
              />
            </div>
            {directIp && (
              <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                <Globe className="w-3 h-3" />
                <span dir="ltr">{t('devicesPages.control.direct', { target: `${directIp}:${directPort}` })}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.target')}</label>
              <select
                value={deviceSn} onChange={(e) => setDeviceSn(e.target.value)}
                className="w-full sm:w-80 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="">{t('devicesPages.control.selectDevice')}</option>
                {devices.map((d: any) => (
                  <option key={d.sn} value={d.sn}>
                    {d.sn} {d.device_name ? `— ${d.device_name}` : ''} ({d.ip_address || t('devicesPages.control.noIp')})
                  </option>
                ))}
              </select>
            </div>
            {selectedDevice && (
              <div className="flex items-center gap-3 text-xs">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium ${isOnline ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isOnline ? t('devicesPages.control.online') : t('devicesPages.control.offline')}
                </span>
                <span className="text-gray-400">{t('devicesPages.control.ip', { ip: selectedDevice.ip_address || '—' })}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 1. Device Status ─────────────────────────────────────────────── */}
      <Section icon={<Activity className="w-5 h-5" />} title={t('devicesPages.control.sec.status')}
        subtitle={t('devicesPages.control.sec.statusSub')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ActionButton icon={<Wifi className="w-5 h-5" />} label={t('devicesPages.control.act.testTcp')} color="green"
            busy={busy === 'status'} disabled={busy !== null} onClick={() => doGet('status', t('devicesPages.control.act.testTcpLog'))} />
          <ActionButton icon={<Monitor className="w-5 h-5" />} label={t('devicesPages.control.act.getInfo')} color="blue"
            busy={busy === 'info'} disabled={busy !== null} onClick={() => doGet('info', t('devicesPages.control.act.getInfo'))} />
          <ActionButton icon={<Users className="w-5 h-5" />} label={t('devicesPages.control.act.getUsers')} color="blue"
            busy={busy === 'users'} disabled={busy !== null} onClick={() => doGet('users', t('devicesPages.control.act.getUsers'))} />
          <ActionButton icon={<Users className="w-5 h-5" />} label={t('devicesPages.control.act.mapNames')} color="blue"
            busy={busy === 'map_attendance'} disabled={busy !== null} onClick={() => doGet('map_attendance', t('devicesPages.control.act.mapNames'))} />
        </div>
      </Section>

      {/* ── 2. Attendance Acquisition (wizard) ───────────────────────────── */}
      <Section icon={<ShieldCheck className="w-5 h-5" />} title={t('devicesPages.control.sec.acq')}
        subtitle={t('devicesPages.control.sec.acqSub')}>

        {(wiz.step === 'idle' || wiz.step === 'error' || wiz.step === 'discarded') && (
          <div className="space-y-3">
            {wiz.step === 'error' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{t('devicesPages.control.pullFailedMsg', { error: wiz.error })}</span>
              </div>
            )}
            {wiz.step === 'discarded' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300 text-sm">
                <Trash2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{t('devicesPages.control.discardedMsg', { id: wiz.acquisitionId })}</span>
              </div>
            )}
            {/* ONE-CLICK: today's attendance */}
            <button
              onClick={() => startPull(todayStr())}
              disabled={busy !== null}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold disabled:opacity-50 shadow-sm"
            >
              <Clock className="w-5 h-5" />
              {t('devicesPages.control.pullToday')}
            </button>

            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 pt-1">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.orDate')}</label>
                <input
                  type="date" value={wiz.date} max={todayStr()}
                  onChange={(e) => setWiz(w => ({ ...w, date: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <button
                onClick={() => startPull()}
                disabled={busy !== null || !wiz.date}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-sm font-medium disabled:opacity-50"
              >
                <CalendarDays className="w-4 h-4" />
                {t('devicesPages.control.pullDate')}
              </button>
              <p className="text-xs text-gray-400 dark:text-gray-500 sm:ms-2">
                {t('devicesPages.control.stagingOnly')}
              </p>
            </div>
          </div>
        )}

        {wiz.step === 'pulling' && (
          <div className="flex items-center gap-3 p-6 justify-center text-sm text-gray-600 dark:text-gray-300">
            <Loader className="w-5 h-5 animate-spin text-indigo-500" />
            {t('devicesPages.control.pulling', { date: wiz.date })}
          </div>
        )}

        {wiz.step === 'saving' && (
          <div className="flex items-center gap-3 p-6 justify-center text-sm text-gray-600 dark:text-gray-300">
            <Loader className="w-5 h-5 animate-spin text-green-500" />
            {t('devicesPages.control.saving', { id: wiz.acquisitionId })}
          </div>
        )}

        {wiz.step === 'saved' && wiz.saveResult && (
          <div className="space-y-3">
            <div className="p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-900/10">
              <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-medium text-sm mb-2">
                <CheckCircle className="w-4 h-4" /> {t('devicesPages.control.savedBatch', { id: wiz.acquisitionId })}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">{t('devicesPages.control.res.saved', { n: wiz.saveResult.committed })}</span>
                <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{t('devicesPages.control.res.dup', { n: wiz.saveResult.duplicates })}</span>
                {wiz.saveResult.invalid > 0 && <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{t('devicesPages.control.res.invalid', { n: wiz.saveResult.invalid })}</span>}
                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t('devicesPages.control.res.evaluated', { n: wiz.saveResult.evaluated })}</span>
                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t('devicesPages.control.res.zone', { sign: wiz.saveResult.tzOffsetMinutes >= 0 ? '+' : '', h: wiz.saveResult.tzOffsetMinutes / 60 })}</span>
              </div>
            </div>
            <button
              onClick={() => setWiz({ step: 'idle', date: todayStr(), records: [], search: '', page: 0 })}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            >
              <CalendarDays className="w-4 h-4" /> {t('devicesPages.control.pullAnother')}
            </button>
          </div>
        )}

        {(wiz.step === 'inspect' || wiz.step === 'decide') && v && (
          <div className="space-y-4">
            {/* Summary chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-medium">{t('devicesPages.control.chip.batch', { id: wiz.acquisitionId })}</span>
              <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{t('devicesPages.control.chip.staged', { staged: wiz.staged, total: wiz.totalOnDevice })}</span>
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t('devicesPages.control.chip.matched', { n: v.matched })}</span>
              <span className={`px-2 py-1 rounded-full ${v.unmatched ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{t('devicesPages.control.chip.unmatched', { n: v.unmatched })}</span>
              <span className={`px-2 py-1 rounded-full ${v.duplicates ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{t('devicesPages.control.chip.dup', { n: v.duplicates })}</span>
              {v.clockDeltaSeconds != null && (
                <span className={`px-2 py-1 rounded-full ${Math.abs(v.clockDeltaSeconds) > 120 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                  {t('devicesPages.control.chip.clock', { delta: `${v.clockDeltaSeconds > 0 ? '+' : ''}${v.clockDeltaSeconds}` })}
                </span>
              )}
            </div>

            {v.warnings.length > 0 && (
              <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 text-xs space-y-1">
                {v.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{warning(w)}</div>
                ))}
              </div>
            )}

            {/* First/Last anchors */}
            <div className="grid sm:grid-cols-2 gap-3">
              {[[t('devicesPages.control.firstPunches'), v.first3], [t('devicesPages.control.lastPunches'), v.last3]].map(([title, list]: any) => (
                <div key={title} className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 p-3">
                  <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">{title}</div>
                  {list.length === 0 && <div className="text-xs text-gray-400">{t('devicesPages.control.noRecords')}</div>}
                  {list.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm py-0.5">
                      <span className="font-mono text-gray-900 dark:text-white">{digits(a.wall.slice(11))}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.name || t('devicesPages.control.pin', { pin: a.pin })}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Time check — DRAIS asks the operator to verify the device clock */}
            {wiz.step === 'inspect' && (
              <div className={`p-3 rounded-lg border space-y-3 ${timeCheck.answered
                ? 'border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10'
                : 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10'}`}>
                <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  {t('devicesPages.control.timeCheck')}
                  {timeCheck.answered && (
                    <span className="ms-auto text-xs font-normal text-green-700 dark:text-green-400">
                      {timeCheck.appliedDrift
                        ? t('devicesPages.control.correctionShift', { n: -timeCheck.appliedDrift })
                        : t('devicesPages.control.clockAccepted')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.deviceTime')}</label>
                    <input
                      type="time" step={1} value={timeCheck.device}
                      onChange={(e) => setTimeCheck(tc => ({ ...tc, device: e.target.value, answered: false }))}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
                    />
                    {v.deviceWallNow && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{t('devicesPages.control.deviceReported', { time: String(v.deviceWallNow).slice(11) })}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.realTime')}</label>
                    <input
                      type="time" step={1} value={timeCheck.real}
                      onChange={(e) => setTimeCheck(tc => ({ ...tc, real: e.target.value, answered: false }))}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">{t('devicesPages.control.prefilled')}</p>
                  </div>
                  {liveDriftSeconds != null && (
                    <div className={`px-3 py-2 rounded-lg text-sm font-mono ${Math.abs(liveDriftSeconds) > 60
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {t('devicesPages.control.drift', { n: `${liveDriftSeconds > 0 ? '+' : ''}${liveDriftSeconds}` })}
                      {Math.abs(liveDriftSeconds) > 60 ? t('devicesPages.control.deviceWrong') : t('devicesPages.control.ok')}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={acceptClock}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> {t('devicesPages.control.keepTimes')}
                  </button>
                  <button onClick={applyCorrection} disabled={liveDriftSeconds == null || liveDriftSeconds === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium disabled:opacity-50">
                    <RefreshCw className="w-3.5 h-3.5" /> {t('devicesPages.control.correctTimes')}
                  </button>
                </div>
              </div>
            )}

            {/* Operator confirmation */}
            {wiz.step === 'inspect' && !wiz.rejected && (
              <div className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 ${!timeCheck.answered ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">
                  {timeCheck.answered
                    ? t('devicesPages.control.matchQ')
                    : t('devicesPages.control.answerFirst')}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setWiz(w => ({ ...w, step: 'decide' }))}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium">
                    <CheckCircle className="w-4 h-4" /> {t('devicesPages.control.yes')}
                  </button>
                  <button onClick={() => setWiz(w => ({ ...w, rejected: true }))}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
                    <XCircle className="w-4 h-4" /> {t('devicesPages.control.no')}
                  </button>
                </div>
              </div>
            )}

            {wiz.step === 'inspect' && wiz.rejected && (
              <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 space-y-2">
                <div className="text-sm text-red-700 dark:text-red-300 font-medium">{t('devicesPages.control.rejected')}</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={discardBatch} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium">
                    <Trash2 className="w-3.5 h-3.5" /> {t('devicesPages.control.discard')}
                  </button>
                  <button onClick={() => downloadRaw('json')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium">
                    <FileDown className="w-3.5 h-3.5" /> {t('devicesPages.control.downloadRaw')}
                  </button>
                  <button onClick={() => setWiz(w => ({ ...w, rejected: false }))} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium">
                    <Eye className="w-3.5 h-3.5" /> {t('devicesPages.control.keepInspecting')}
                  </button>
                  <button onClick={() => startPull()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium">
                    <RefreshCw className="w-3.5 h-3.5" /> {t('devicesPages.control.retry')}
                  </button>
                </div>
              </div>
            )}

            {/* Decision */}
            {wiz.step === 'decide' && (
              <div className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 space-y-2">
                <div className="text-sm text-green-800 dark:text-green-300 font-medium">{t('devicesPages.control.confirmed')}</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => { showToast('success', t('devicesPages.control.previewMode')); setWiz(w => ({ ...w, step: 'inspect', rejected: false })); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium">
                    <Eye className="w-3.5 h-3.5" /> {t('devicesPages.control.previewOnly')}
                  </button>
                  <button onClick={saveBatch}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" /> {t('devicesPages.control.saveToDrais')}
                  </button>
                  <button onClick={() => downloadRaw('csv')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium">
                    <Download className="w-3.5 h-3.5" /> {t('devicesPages.control.exportCsv')}
                  </button>
                  <button onClick={() => setWiz(w => ({ ...w, step: 'idle', records: [], validation: undefined, rejected: false }))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium">
                    {t('devicesPages.control.cancel')}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {t('devicesPages.control.saveNote')}
                </p>
              </div>
            )}

            {/* Raw Inspection table */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-gray-400" />
                  <input
                    value={wiz.search}
                    onChange={(e) => setWiz(w => ({ ...w, search: e.target.value, page: 0 }))}
                    placeholder={t('devicesPages.control.searchPh')}
                    className="w-full ps-8 pe-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"
                  />
                </div>
                <span className="text-xs text-gray-400">{t('devicesPages.control.recordsCount', { n: filteredRecords.length })}</span>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="text-xs w-full">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                    <tr>
                      {['#', t('devicesPages.control.col.device_user_id'), t('devicesPages.control.raw.name'), t('devicesPages.control.raw.ts'),
                        ...(hasCorrection ? [t('devicesPages.control.raw.corrected')] : []),
                        t('devicesPages.control.raw.verify'), t('devicesPages.control.raw.matched'), t('devicesPages.control.raw.flags')].map(h => (
                        <th key={h} className="px-3 py-2 text-start font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {pageRecords.map((r: any, i: number) => {
                      const isAnchor = anchorIds.has(`${r.device_user_id}|${r.device_wall_time}`);
                      return (
                        <tr key={r.id} className={isAnchor ? 'bg-indigo-50 dark:bg-indigo-900/20' : undefined}>
                          <td className="px-3 py-1.5 text-gray-400">{digits(wiz.page * PAGE_SIZE + i + 1)}</td>
                          <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-white">{digits(r.device_user_id)}</td>
                          <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{r.display_name || <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-white whitespace-nowrap">{digits(r.device_wall_time)}</td>
                          {hasCorrection && (
                            <td className="px-3 py-1.5 font-mono text-amber-700 dark:text-amber-400 whitespace-nowrap">{r.corrected_wall_time ? digits(r.corrected_wall_time) : '—'}</td>
                          )}
                          <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{r.verify_type != null ? t(`devicesPages.control.verify.${String(r.verify_type).toUpperCase()}`, String(r.verify_type)) : '—'}</td>
                          <td className="px-3 py-1.5">{r.matched
                            ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            : <XCircle className="w-3.5 h-3.5 text-yellow-500" />}</td>
                          <td className="px-3 py-1.5">
                            {(r.validation_flags || '').split(',').filter(Boolean).map((f: string) => (
                              <span key={f} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium me-1 ${
                                f === 'duplicate' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                : f === 'future' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                {t(`devicesPages.control.flag.${f}`, f)}
                              </span>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                    {pageRecords.length === 0 && (
                      <tr><td colSpan={hasCorrection ? 8 : 7} className="px-3 py-6 text-center text-gray-400">{t('devicesPages.control.noRecords')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <button disabled={wiz.page === 0} onClick={() => setWiz(w => ({ ...w, page: w.page - 1 }))}
                    className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40">{t('devicesPages.control.previous')}</button>
                  <span>{t('devicesPages.control.page', { n: wiz.page + 1, total: pageCount })}</span>
                  <button disabled={wiz.page >= pageCount - 1} onClick={() => setWiz(w => ({ ...w, page: w.page + 1 }))}
                    className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40">{t('devicesPages.control.next')}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* ── 3. Device Operations ─────────────────────────────────────────── */}
      <Section icon={<Fingerprint className="w-5 h-5" />} title={t('devicesPages.control.sec.ops')}
        subtitle={t('devicesPages.control.sec.opsSub')} defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <ActionButton icon={<RefreshCw className="w-5 h-5" />} label={t('devicesPages.control.op.restart')} color="yellow"
            busy={busy === 'restart'} disabled={busy !== null} onClick={() => { if (confirm(t('devicesPages.control.op.confirmRestart'))) doPost('restart', t('devicesPages.control.op.restart')); }} />
          <ActionButton icon={<Lock className="w-5 h-5" />} label={t('devicesPages.control.op.disable')} color="red"
            busy={busy === 'disable'} disabled={busy !== null} onClick={() => { if (confirm(t('devicesPages.control.op.confirmDisable'))) doPost('disable', t('devicesPages.control.op.disableLog')); }} />
          <ActionButton icon={<Unlock className="w-5 h-5" />} label={t('devicesPages.control.op.enable')} color="green"
            busy={busy === 'enable'} disabled={busy !== null} onClick={() => doPost('enable', t('devicesPages.control.op.enableLog'))} />
          <ActionButton icon={<Unlock className="w-5 h-5" />} label={t('devicesPages.control.op.unlock')} color="purple"
            busy={busy === 'unlock'} disabled={busy !== null} onClick={() => doPost('unlock', t('devicesPages.control.op.unlock'))} />
          <ActionButton icon={<Clock className="w-5 h-5" />} label={t('devicesPages.control.op.attendance')} color="blue"
            busy={busy === 'attendance'} disabled={busy !== null} onClick={() => doGet('attendance', t('devicesPages.control.op.attendanceLog'))} />
          <ActionButton icon={<Download className="w-5 h-5" />} label={t('devicesPages.control.op.csv')} color="blue"
            busy={busy === 'attendance_csv'} disabled={busy !== null} onClick={() => doGet('attendance_csv', t('devicesPages.control.op.csvLog'))} />
        </div>

        {/* Remote Enrollment (preserved) */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-indigo-500" /> {t('devicesPages.control.remoteEnroll')}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('devicesPages.control.remoteHelp')}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.uid')}</label>
              <input type="text" value={enrollUid} onChange={(e) => setEnrollUid(e.target.value)}
                className="w-28 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.finger')}</label>
              <input type="number" min={0} max={9} value={enrollFinger}
                onChange={(e) => setEnrollFinger(parseInt(e.target.value || '0', 10))}
                className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono" />
            </div>
            <button
              onClick={() => {
                if (!enrollUid) return showToast('error', t('devicesPages.control.enterUid'));
                doPost('enroll', t('devicesPages.control.enrollLog', { uid: enrollUid, f: enrollFinger }), { uid: parseInt(enrollUid, 10), finger: enrollFinger });
              }}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy === 'enroll' ? <Loader className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              {t('devicesPages.control.startEnroll')}
            </button>
            <button
              onClick={() => doPost('save_template', t('devicesPages.control.saveTemplateLog', { uid: enrollUid, f: enrollFinger }), {
                uid: parseInt(enrollUid || '0', 10), finger: enrollFinger, pin: enrollUid,
              })}
              disabled={busy !== null || !enrollUid}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy === 'save_template' ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {t('devicesPages.control.saveTemplate')}
            </button>
            <button
              onClick={() => doPost('cancel_enroll', t('devicesPages.control.cancelEnrollLog'))}
              disabled={busy !== null}
              className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium disabled:opacity-50"
            >
              {t('devicesPages.control.cancel')}
            </button>
          </div>
        </div>

        {/* LCD Display (preserved) */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Type className="w-4 h-4 text-indigo-500" /> {t('devicesPages.control.lcd')}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <input
              type="text" value={lcdText} onChange={(e) => setLcdText(e.target.value)}
              placeholder={t('devicesPages.control.lcdPh')}
              className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
            />
            <button
              onClick={() => doPost('write_lcd', t('devicesPages.control.lcdLog', { text: lcdText }), { text: lcdText })}
              disabled={busy !== null || !lcdText}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {t('devicesPages.control.write')}
            </button>
            <button
              onClick={() => doPost('clear_lcd', t('devicesPages.control.clearLcdLog'))}
              disabled={busy !== null}
              className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium disabled:opacity-50"
            >
              {t('devicesPages.control.clear')}
            </button>
          </div>
        </div>

        {/* Advanced raw command (preserved) */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300"
          >
            <Terminal className="w-4 h-4" />
            {t('devicesPages.control.rawCmd')}
            {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.cmd')}</label>
                  <input type="text" value={rawCmd} onChange={(e) => setRawCmd(e.target.value)} placeholder={t('devicesPages.control.cmdPh')}
                    className="w-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono" />
                </div>
                <div className="flex-1 min-w-48">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('devicesPages.control.data')}</label>
                  <input type="text" value={rawData} onChange={(e) => setRawData(e.target.value)} placeholder="deadbeef"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-mono" />
                </div>
                <button
                  onClick={() => doPost('exec', t('devicesPages.control.execLog', { cmd: rawCmd }), { command: rawCmd, data: rawData || undefined })}
                  disabled={busy !== null || !rawCmd}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {busy === 'exec' ? <Loader className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                  {t('devicesPages.control.execute')}
                </button>
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 space-y-0.5">
                <p>{t('devicesPages.control.commonCmds')} <span dir="ltr">1000=CONNECT, 1004=RESTART, 50=GET_FREE_SIZES, 61=STARTENROLL, 62=CANCELCAPTURE</span></p>
                <p dir="ltr">1002=ENABLE, 1003=DISABLE, 9=READ_TEMPLATE, 10=WRITE_TEMPLATE, 500=REG_EVENT, 201=GET_TIME</p>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── 4. Diagnostics ───────────────────────────────────────────────── */}
      <Section icon={<History className="w-5 h-5" />} title={t('devicesPages.control.sec.diag')}
        subtitle={t('devicesPages.control.sec.diagSub')} defaultOpen={false}>
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="text-xs w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
              <tr>
                {['#', t('devicesPages.control.diag.method'), t('devicesPages.control.diag.status'), t('devicesPages.control.diag.device'), t('devicesPages.control.diag.window'), t('devicesPages.control.diag.staged'), t('devicesPages.control.diag.saved'), t('devicesPages.control.diag.dup'), t('devicesPages.control.diag.unmatched'), t('devicesPages.control.diag.clock'), t('devicesPages.control.diag.duration'), t('devicesPages.control.diag.started')].map(h => (
                  <th key={h} className="px-3 py-2 text-start font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {acquisitions.map((a: any) => (
                <tr key={a.id}>
                  <td className="px-3 py-1.5 text-gray-400">{digits(a.id)}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{t(`devicesPages.control.method.${a.method}`, a.method)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      a.status === 'committed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : a.status === 'validated' || a.status === 'staged' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                      : a.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {t(`devicesPages.control.acq.${a.status}`, a.status)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{a.device_sn || a.device_ip || '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {a.window_from ? digits(String(a.window_from).slice(0, 10)) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{digits(a.records_staged)}</td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{digits(a.records_committed)}</td>
                  <td className="px-3 py-1.5 text-gray-500">{digits(a.records_duplicate)}</td>
                  <td className="px-3 py-1.5 text-gray-500">{digits(a.records_unmatched)}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{a.clock_delta_seconds != null ? t('devicesPages.control.seconds', { n: a.clock_delta_seconds }) : '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{a.duration_ms != null ? t('devicesPages.control.seconds', { n: Math.round(a.duration_ms / 100) / 10 }) : '—'}</td>
                  <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">{a.started_at ? digits(String(a.started_at).replace('T', ' ').slice(0, 19)) : '—'}</td>
                </tr>
              ))}
              {acquisitions.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-gray-400">{t('devicesPages.control.noAcq')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Results Log (preserved) */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('devicesPages.control.results', { n: results.length })}</h2>
            <button onClick={() => setResults([])} className="text-xs text-gray-400 hover:text-gray-600 transition">
              {t('devicesPages.control.clear')}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
            {results.map((r) => (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  {r.success
                    ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                  <span className="font-medium text-sm text-gray-900 dark:text-white">{r.action}</span>
                  <span className="text-xs text-gray-400 ms-auto">{digits(r.time)}</span>
                </div>
                {isAttendanceResponse(r.data) ? (
                  <AttendanceResultTable rows={r.data.data} />
                ) : (
                  <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                    {JSON.stringify(r.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 dark:text-gray-500 text-center">
        {t('devicesPages.control.footer')}
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
