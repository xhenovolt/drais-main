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

  const tiles: Tile[] = [
    {
      href: '/attendance/health', label: 'Health', icon: <Activity className="w-4 h-4" />,
      value: d.health ? `${d.health.score}%` : '—',
      sub: d.health ? (d.health.status === 'healthy' ? 'Operational' : d.health.status) : 'checking…',
      tone: !d.health ? 'muted' : d.health.score >= 90 ? 'ok' : d.health.score >= 70 ? 'warn' : 'bad',
    },
    {
      href: '/attendance/profiles', label: 'Behaviour watch-list', icon: <Users className="w-4 h-4" />,
      value: d.people ? String(d.people.watch) : '—',
      sub: d.people ? `${d.people.roster} for roster review` : 'analysing…',
      tone: !d.people ? 'muted' : d.people.watch > 0 ? 'warn' : 'ok',
    },
    {
      href: '/attendance/recovery', label: 'Attendance gaps', icon: <LifeBuoy className="w-4 h-4" />,
      value: d.gaps ? String(d.gaps.gaps) : '—',
      sub: d.gaps ? (d.gaps.gaps ? 'need recovery' : 'flowing normally') : 'scanning…',
      tone: !d.gaps ? 'muted' : d.gaps.gaps > 0 ? 'bad' : 'ok',
    },
    {
      href: '/attendance/time-health', label: 'Clock integrity', icon: <Clock className="w-4 h-4" />,
      value: d.clock ? String(d.clock.anomalies) : '—',
      sub: d.clock ? (d.clock.anomalies ? 'device(s) drifting' : 'time trusted') : 'checking…',
      tone: !d.clock ? 'muted' : d.clock.anomalies > 0 ? 'bad' : 'ok',
    },
    {
      href: '/attendance/identity-intelligence', label: 'Identity health', icon: <Fingerprint className="w-4 h-4" />,
      value: d.identity ? String(d.identity.duplicates + d.identity.unknowns) : '—',
      sub: d.identity ? `${d.identity.duplicates} dup · ${d.identity.unknowns} unknown` : 'checking…',
      tone: !d.identity ? 'muted' : (d.identity.duplicates + d.identity.unknowns) > 0 ? 'warn' : 'ok',
    },
    {
      href: '/attendance/device-intelligence', label: 'Device fleet', icon: <Cpu className="w-4 h-4" />,
      value: d.devices?.fleet != null ? `${d.devices.fleet}%` : '—',
      sub: d.devices ? (d.devices.needMaint ? `${d.devices.needMaint} need maintenance` : `${d.devices.count} device(s) healthy`) : 'checking…',
      tone: !d.devices ? 'muted' : d.devices.needMaint > 0 ? 'warn' : 'ok',
    },
  ];

  const links = [
    { href: '/attendance/trends', label: 'Trends', icon: <ChartBar className="w-3.5 h-3.5" /> },
    { href: '/attendance/trace', label: 'Event Explorer', icon: <GitBranch className="w-3.5 h-3.5" /> },
    { href: '/attendance/founder-independence', label: 'Founder Independence', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-indigo-500" /> Attendance Intelligence
        </p>
        <Link href="/attendance/health" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5">
          Full center <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
        {tiles.map(t => (
          <Link key={t.href} href={t.href}
            className="block rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 p-2.5 transition-colors">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
              <span className="text-indigo-500">{t.icon}</span><span className="truncate">{t.label}</span>
            </div>
            <div className={`text-xl font-bold tabular-nums ${TONE[t.tone]}`}>{t.value}</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{t.sub}</div>
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
