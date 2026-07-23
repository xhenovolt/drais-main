"use client";
/**
 * Device clock-health badges — the Time Intelligence Engine surfaced INLINE.
 *
 * The attendance operator lives on /attendance/logs and the dashboard — they
 * won't tour /attendance/time-health looking for problems. These chips show
 * each device's time confidence right where they already work, and click
 * through to the full Time Health page for correction.
 *
 * Renders nothing while loading and (in `quiet` mode) nothing when every
 * device is trusted — health information, zero noise.
 */
import React from 'react';
import useSWR from 'swr';
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface DeviceChip {
  device_sn: string;
  status: 'trusted' | 'review' | 'anomaly';
  confidence: number;
  offset_min: number | null;
  cause: string;
  batch: number;
}

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

export default function ClockHealthBadges({ quiet = false }: {
  /** quiet: render nothing when all devices are trusted (dashboard mode). */
  quiet?: boolean;
}) {
  const { data } = useSWR<any>('/api/attendance/time-health?banner=1', fetcher, {
    refreshInterval: 5 * 60_000, revalidateOnFocus: false,
  });
  const devices: DeviceChip[] = data?.devices || [];
  if (!devices.length) return null;
  if (quiet && devices.every((d) => d.status === 'trusted')) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
        <Clock className="w-3.5 h-3.5" /> Device time
      </span>
      {devices.map((d) => {
        const bad = d.status === 'anomaly';
        const review = d.status === 'review';
        const offsetLabel = d.offset_min
          ? ` ${d.offset_min > 0 ? '+' : '−'}${Math.round(Math.abs(d.offset_min) / 60 * 10) / 10}h`
          : '';
        return (
          <a
            key={d.device_sn}
            href="/attendance/time-health"
            title={`${d.device_sn}: ${d.cause} — ${d.confidence}% time confidence (${d.batch} punches). Click to review.`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              bad
                ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800'
                : review
                  ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
            }`}
          >
            {bad ? <AlertTriangle className="w-3 h-3" /> : review ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
            <span className="font-mono">…{d.device_sn.slice(-6)}</span>
            <span>{d.confidence}%</span>
            {bad && offsetLabel && <span className="font-semibold">{offsetLabel}</span>}
            {bad && <span className="font-semibold uppercase">fix</span>}
          </a>
        );
      })}
    </div>
  );
}
