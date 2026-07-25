'use client';

/**
 * Device Intelligence (Phase 7) — every biometric device self-monitored.
 * Reputation score per device (clock / upload / heartbeat / activity) with a
 * concrete maintenance recommendation. Worst devices surface first.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, RefreshCw, Loader2, Wrench, Clock, UploadCloud, Radio, Activity } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const BAND_STYLE: Record<string, string> = {
  excellent: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  good: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  fair: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  poor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};
const barColor = (s: number) => (s >= 90 ? 'bg-emerald-500' : s >= 75 ? 'bg-sky-500' : s >= 55 ? 'bg-amber-500' : 'bg-rose-500');

function SubBar({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: { score: number; label: string } }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">{icon} {label}</span>
        <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{sub.score}%</span>
      </div>
      <div className="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor(sub.score)}`} style={{ width: `${sub.score}%` }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sub.label}</p>
    </div>
  );
}

export default function DeviceIntelligence() {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await (await fetch('/api/attendance/device-intelligence', { cache: 'no-store' })).json()); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const devices = data?.devices || [];
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Cpu className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('attendanceIntel.deviceIntel.title', 'Device Intelligence')}</h1>
            <p className="text-sm text-gray-500">{t('attendanceIntel.deviceIntel.subtitle', "Every biometric device's reliability, scored — so maintenance is planned, not reactive.")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data?.fleet != null && <span className="text-sm text-gray-500">{t('attendanceIntel.deviceIntel.fleet', 'Fleet:')} <span className="font-bold text-gray-800 dark:text-gray-100">{data.fleet}%</span></span>}
          <button onClick={load} aria-label={t('attendanceIntel.deviceIntel.recheck', 'Re-check')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('attendanceIntel.deviceIntel.recheck', 'Re-check')}</button>
        </div>
      </div>

      {loading && !data && <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 inline" /></div>}
      {data && devices.length === 0 && <p className="text-sm text-gray-400 text-center py-8">{t('attendanceIntel.deviceIntel.noDevices', 'No devices registered.')}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {devices.map((d: any) => {
          const rep = d.reputation;
          return (
            <div key={d.sn} className={`rounded-xl border bg-white dark:bg-gray-800 p-4 ${rep.band === 'poor' ? 'border-rose-300 dark:border-rose-800' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{d.device_name || d.sn}</p>
                  <p className="text-[11px] text-gray-400">{d.firmware || t('attendanceIntel.deviceIntel.firmwareUnknown', 'firmware ?')} · {t('attendanceIntel.deviceIntel.activeDays', { n: d.active_days_30 }, '{{n}} active days/30')}{d.is_online ? '' : ` · ${t('attendanceIntel.deviceIntel.offline', 'offline')}`}</p>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold tabular-nums ${rep.overall >= 90 ? 'text-emerald-600 dark:text-emerald-400' : rep.overall >= 75 ? 'text-sky-600 dark:text-sky-400' : rep.overall >= 55 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>{rep.overall}%</div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${BAND_STYLE[rep.band]}`}>{rep.headline}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <SubBar icon={<Clock className="w-3 h-3" />} label={t('attendanceIntel.deviceIntel.clock', 'Clock')} sub={rep.clock} />
                <SubBar icon={<UploadCloud className="w-3 h-3" />} label={t('attendanceIntel.deviceIntel.upload', 'Upload')} sub={rep.upload} />
                <SubBar icon={<Radio className="w-3 h-3" />} label={t('attendanceIntel.deviceIntel.heartbeat', 'Heartbeat')} sub={rep.heartbeat} />
                <SubBar icon={<Activity className="w-3 h-3" />} label={t('attendanceIntel.deviceIntel.activity', 'Activity')} sub={rep.activity} />
              </div>
              {rep.recommendation && (
                <div className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2.5 py-2">
                  <Wrench className="w-3.5 h-3.5 mt-px flex-shrink-0" /> {rep.recommendation}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
