'use client';

/**
 * Device uptime for the school's devices: current status and for how long, last seen, uptime % for
 * today / 7 days / 30 days, and the recent offline gaps. Data: GET /api/attendance/devices/uptime
 * (lib/devices/uptime.ts — derived from heartbeats and data pushes; offline after the threshold).
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import { Activity, ChevronDown, Loader2, AlertTriangle, RotateCcw } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const P = 'devicesPages.uptime';
const fetcher = async (u: string) => {
  const r = await fetch(u, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};

/** "3h 12m" / "2d 4h" / "45m" in the interface language. */
export function useDuration() {
  const { t } = useI18n();
  return (minutes: number | null | undefined) => {
    if (minutes == null) return '—';
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) return t(`${P}.dur.m`, { m });
    const h = Math.floor(m / 60);
    if (h < 48) return t(`${P}.dur.hm`, { h, m: m % 60 });
    return t(`${P}.dur.dh`, { d: Math.floor(h / 24), h: h % 24 });
  };
}

function Pct({ v }: { v: number | null }) {
  const { t, formatPercent } = useI18n();
  if (v == null) return <span className="text-gray-400" title={t(`${P}.noData`, 'No contact recorded in this period')}>—</span>;
  const tone = v >= 95 ? 'text-emerald-600 dark:text-emerald-400' : v >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
  return <span className={`font-semibold tabular-nums ${tone}`}>{formatPercent(v)}</span>;
}

export default function DeviceUptimePanel() {
  const { t, formatDate } = useI18n();
  const dur = useDuration();
  const { data, error, isLoading, mutate } = useSWR<any>('/api/attendance/devices/uptime', fetcher, { refreshInterval: 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  const devices: any[] = Array.isArray(data?.devices) ? data.devices : [];

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-500" /> {t(`${P}.title`, 'Device uptime')}
        </h2>
        {data?.threshold_minutes && (
          <span className="text-[11px] text-gray-400">{t(`${P}.thresholdNote`, { n: data.threshold_minutes })}</span>
        )}
      </div>

      {isLoading && !data && <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t(`${P}.loading`, 'Loading uptime…')}</p>}
      {error && (
        <div className="text-sm text-red-600 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {t(`${P}.loadFailed`, 'Uptime could not be loaded.')}
          <button onClick={() => mutate()} className="inline-flex items-center gap-1 underline text-xs"><RotateCcw className="w-3 h-3" /> {t(`${P}.retry`, 'Try again')}</button>
        </div>
      )}
      {!error && data && devices.length === 0 && <p className="text-sm text-gray-400">{t(`${P}.none`, 'No devices to report on.')}</p>}

      {devices.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-2 text-start">{t(`${P}.col.device`, 'Device')}</th>
                <th className="px-2 py-2 text-start">{t(`${P}.col.status`, 'Status')}</th>
                <th className="px-2 py-2 text-start">{t(`${P}.col.lastSeen`, 'Last seen')}</th>
                <th className="px-2 py-2 text-end">{t(`${P}.col.today`, 'Today')}</th>
                <th className="px-2 py-2 text-end">{t(`${P}.col.d7`, '7 days')}</th>
                <th className="px-2 py-2 text-end">{t(`${P}.col.d30`, '30 days')}</th>
                <th className="px-2 py-2 text-end">{t(`${P}.col.gaps`, 'Offline gaps')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {devices.map((d) => (
                <React.Fragment key={d.sn}>
                  <tr className="align-top">
                    <td className="px-2 py-2">
                      <div className="font-medium text-gray-900 dark:text-white">{d.device_name || d.sn}</div>
                      <div dir="ltr" className="text-[11px] font-mono text-gray-400 text-start rtl:text-end">{d.sn}</div>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${d.status === 'online'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                        {d.status === 'online'
                          ? t(`${P}.onlineFor`, { d: dur(d.for_minutes) })
                          : t(`${P}.offlineFor`, { d: dur(d.for_minutes) })}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-300">{d.last_seen ? formatDate(d.last_seen, 'datetime') : t(`${P}.never`, 'Never')}</td>
                    <td className="px-2 py-2 text-end"><Pct v={d.uptime?.today ?? null} /></td>
                    <td className="px-2 py-2 text-end"><Pct v={d.uptime?.d7 ?? null} /></td>
                    <td className="px-2 py-2 text-end"><Pct v={d.uptime?.d30 ?? null} /></td>
                    <td className="px-2 py-2 text-end">
                      {d.gaps?.length > 0 ? (
                        <button onClick={() => setOpen(open === d.sn ? null : d.sn)} className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
                          {t(`${P}.gapCount`, { count: d.gaps.length })}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open === d.sn ? 'rotate-180' : ''}`} />
                        </button>
                      ) : <span className="text-xs text-gray-400">{t(`${P}.noGaps`, 'None')}</span>}
                    </td>
                  </tr>
                  {open === d.sn && (
                    <tr>
                      <td colSpan={7} className="px-2 pb-3">
                        <p className="text-[11px] text-gray-500 mb-1">{t(`${P}.gapsTitle`, 'Offline periods in the last 7 days (newest first)')}</p>
                        <ul className="space-y-1">
                          {d.gaps.map((g: any, i: number) => (
                            <li key={i} className="text-xs flex flex-wrap items-center gap-x-2 bg-red-50 dark:bg-red-900/10 rounded px-2 py-1">
                              <span className="font-semibold text-red-700 dark:text-red-300">{dur(g.minutes)}</span>
                              <span className="text-gray-600 dark:text-gray-300">
                                {g.to
                                  ? t(`${P}.gapRange`, { from: formatDate(g.from, 'datetime'), to: formatDate(g.to, 'datetime') })
                                  : t(`${P}.gapOngoing`, { from: formatDate(g.from, 'datetime') })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {devices.some((d) => d.tracked_since) && (
            <p className="text-[11px] text-gray-400 mt-2">
              {t(`${P}.trackedNote`, { date: formatDate(devices.map((d) => d.tracked_since).filter(Boolean).sort()[0], 'medium') })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
