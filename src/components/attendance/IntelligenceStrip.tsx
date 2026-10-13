"use client";
/**
 * Attendance Intelligence strip — a compact, linked summary of every
 * intelligence layer, shown on the attendance dashboard AND the main
 * dashboard so DRAIS reads as infrastructure, not a logbook. Each tile
 * carries a live number and links straight to its full feature.
 */
import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Activity, Clock, LifeBuoy, Users, Fingerprint, Cpu, GitBranch, ChartBar, ShieldCheck, ArrowRight,
} from 'lucide-react';

import { useI18n } from '@/components/i18n/I18nProvider';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

interface Tile {
  href: string; label: string; icon: React.ReactNode;
  value: string; sub: string; tone: 'ok' | 'warn' | 'bad' | 'muted';
}
const TONE: Record<string, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-rose-600 dark:text-rose-400',
  muted: 'text-slate-500 dark:text-slate-400',
};

export default function IntelligenceStrip({ compact = false }: { compact?: boolean }) {
  const { data } = useSWR<any>('/api/attendance/intelligence-summary', fetcher, { refreshInterval: 5 * 60_000, revalidateOnFocus: false });
  const d = data || {};
  const { t, lang, digits } = useI18n();
  // Percentages and counts in the digits of the interface language.
  const pct = (n: number) => (lang === 'ar' ? `${digits(n)}٪` : `${n}%`);

  const tiles: Tile[] = [
    {
      href: '/attendance/health', label: t('attendancePages.strip.health'), icon: <Activity className="w-4 h-4" />,
      value: d.health ? pct(d.health.score) : '—',
      sub: d.health ? (d.health.status === 'healthy' ? t('attendancePages.strip.operational') : t(`attendancePages.strip.status.${d.health.status}`, String(d.health.status))) : t('attendancePages.strip.checking'),
      tone: !d.health ? 'muted' : d.health.score >= 90 ? 'ok' : d.health.score >= 70 ? 'warn' : 'bad',
    },
    {
      href: '/attendance/profiles', label: t('attendancePages.strip.watchList'), icon: <Users className="w-4 h-4" />,
      value: d.people ? digits(d.people.watch) : '—',
      sub: d.people ? t('attendancePages.strip.rosterReview', { count: d.people.roster }) : t('attendancePages.strip.analysing'),
      tone: !d.people ? 'muted' : d.people.watch > 0 ? 'warn' : 'ok',
    },
    {
      href: '/attendance/recovery', label: t('attendancePages.strip.gaps'), icon: <LifeBuoy className="w-4 h-4" />,
      value: d.gaps ? digits(d.gaps.gaps) : '—',
      sub: d.gaps ? (d.gaps.gaps ? t('attendancePages.strip.needRecovery') : t('attendancePages.strip.flowing')) : t('attendancePages.strip.scanning'),
      tone: !d.gaps ? 'muted' : d.gaps.gaps > 0 ? 'bad' : 'ok',
    },
    {
      href: '/attendance/time-health', label: t('attendancePages.strip.clock'), icon: <Clock className="w-4 h-4" />,
      value: d.clock ? digits(d.clock.anomalies) : '—',
      sub: d.clock ? (d.clock.anomalies ? t('attendancePages.strip.drifting') : t('attendancePages.strip.timeTrusted')) : t('attendancePages.strip.checking'),
      tone: !d.clock ? 'muted' : d.clock.anomalies > 0 ? 'bad' : 'ok',
    },
    {
      href: '/attendance/identity-intelligence', label: t('attendancePages.strip.identity'), icon: <Fingerprint className="w-4 h-4" />,
      value: d.identity ? digits(d.identity.duplicates + d.identity.unknowns) : '—',
      sub: d.identity ? t('attendancePages.strip.identitySub', { duplicates: d.identity.duplicates, unknowns: d.identity.unknowns }) : t('attendancePages.strip.checking'),
      tone: !d.identity ? 'muted' : (d.identity.duplicates + d.identity.unknowns) > 0 ? 'warn' : 'ok',
    },
    {
      href: '/attendance/device-intelligence', label: t('attendancePages.strip.fleet'), icon: <Cpu className="w-4 h-4" />,
      value: d.devices?.fleet != null ? pct(d.devices.fleet) : '—',
      sub: d.devices ? (d.devices.needMaint ? t('attendancePages.strip.needMaintenance', { count: d.devices.needMaint }) : t('attendancePages.strip.devicesHealthy', { count: d.devices.count })) : t('attendancePages.strip.checking'),
      tone: !d.devices ? 'muted' : d.devices.needMaint > 0 ? 'warn' : 'ok',
    },
  ];

  const links = [
    { href: '/attendance/trends', label: t('attendancePages.strip.trends'), icon: <ChartBar className="w-3.5 h-3.5" /> },
    { href: '/attendance/trace', label: t('attendancePages.strip.eventExplorer'), icon: <GitBranch className="w-3.5 h-3.5" /> },
    { href: '/attendance/founder-independence', label: t('attendancePages.strip.founderIndependence'), icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-indigo-500" /> {t('attendancePages.strip.title')}
        </p>
        <Link href="/attendance/health" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5">
          {t('attendancePages.strip.fullCenter')} <ArrowRight className="w-3 h-3 rtl-flip" />
        </Link>
      </div>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
        {tiles.map(tile => (
          <Link key={tile.href} href={tile.href}
            className="block rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 p-2.5 transition-colors">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
              <span className="text-indigo-500">{tile.icon}</span><span className="truncate">{tile.label}</span>
            </div>
            <div className={`text-xl font-bold tabular-nums ${TONE[tile.tone]}`}>{tile.value}</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{tile.sub}</div>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {links.map(l => (
          <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
            {l.icon} {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
