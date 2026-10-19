'use client';

/**
 * Control Center — uptime of every in-service device across schools (GET /api/control-center/devices/uptime),
 * worst 30-day uptime first; every column sortable; expand a row for its offline gaps (last 7 days).
 */
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, AlertTriangle, ChevronDown, ArrowUpDown } from 'lucide-react';

const fetcher = async (u: string) => {
  const r = await fetch(u, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
  return j;
};
const dur = (m: number | null | undefined) => {
  if (m == null) return '—';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);
const tone = (v: number | null) => (v == null ? 'text-slate-500' : v >= 95 ? 'text-emerald-300' : v >= 70 ? 'text-amber-300' : 'text-rose-300');

type SortKey = 'd30' | 'd7' | 'today' | 'status' | 'school' | 'last_seen';

export default function DeviceUptimeTable() {
  const { data, error, isLoading } = useSWR<any>('/api/control-center/devices/uptime', fetcher, { refreshInterval: 60_000 });
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'd30', asc: true });
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => {
    const list: any[] = Array.isArray(data?.devices) ? [...data.devices] : [];
    const val = (d: any) => {
      switch (sort.key) {
        case 'school': return (d.school_name || '').toLowerCase();
        case 'status': return d.status === 'online' ? 1 : 0;
        case 'last_seen': return d.last_seen ? new Date(d.last_seen).getTime() : 0;
        default: return d.uptime?.[sort.key] ?? (sort.asc ? 101 : -1); // no data sorts last
      }
    };
    list.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * (sort.asc ? 1 : -1); });
    return list;
  }, [data, sort]);
  const H = ({ k, children, end }: { k: SortKey; children: React.ReactNode; end?: boolean }) => (
    <th className={`px-2 py-2 ${end ? 'text-right' : 'text-left'}`}>
      <button onClick={() => setSort((s) => ({ key: k, asc: s.key === k ? !s.asc : true }))}
        className={`inline-flex items-center gap-1 hover:text-slate-200 ${sort.key === k ? 'text-indigo-300' : ''}`}>
        {children} <ArrowUpDown className="w-3 h-3" />
      </button>
    </th>
  );

  if (isLoading && !data) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>;
  if (error) return (
    <div className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 mt-0.5" /> Uptime could not be loaded: {String(error.message || error)}
    </div>
  );
  if (!rows.length) return <p className="text-sm text-slate-500 text-center py-10">No in-service devices to report on.</p>;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-800">
          <tr>
            <th className="px-2 py-2 text-left">Device</th>
            <H k="school">School</H>
            <H k="status">Status</H>
            <H k="last_seen">Last seen</H>
            <H k="today" end>Today</H>
            <H k="d7" end>7 days</H>
            <H k="d30" end>30 days</H>
            <th className="px-2 py-2 text-right">Gaps (7d)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((d) => (
            <React.Fragment key={d.sn}>
              <tr className="align-top">
                <td className="px-2 py-2 font-mono text-xs text-slate-100">{d.sn}{d.device_name && <div className="font-sans text-[11px] text-slate-500">{d.device_name}</div>}</td>
                <td className="px-2 py-2 text-xs text-slate-300">{d.school_name || <span className="text-amber-300">UNASSIGNED</span>}</td>
                <td className="px-2 py-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${d.status === 'online' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {d.status} for {dur(d.for_minutes)}
                  </span>
                </td>
                <td className="px-2 py-2 text-xs text-slate-400">{d.last_seen ? new Date(d.last_seen).toLocaleString() : 'never'}</td>
                <td className={`px-2 py-2 text-right tabular-nums font-semibold ${tone(d.uptime?.today)}`}>{pct(d.uptime?.today)}</td>
                <td className={`px-2 py-2 text-right tabular-nums font-semibold ${tone(d.uptime?.d7)}`}>{pct(d.uptime?.d7)}</td>
                <td className={`px-2 py-2 text-right tabular-nums font-semibold ${tone(d.uptime?.d30)}`}>{pct(d.uptime?.d30)}</td>
                <td className="px-2 py-2 text-right">
                  {d.gaps?.length ? (
                    <button onClick={() => setOpen(open === d.sn ? null : d.sn)} className="inline-flex items-center gap-1 text-xs text-indigo-300">
                      {d.gaps.length} <ChevronDown className={`w-3.5 h-3.5 ${open === d.sn ? 'rotate-180' : ''}`} />
                    </button>
                  ) : <span className="text-xs text-slate-600">0</span>}
                </td>
              </tr>
              {open === d.sn && (
                <tr><td colSpan={8} className="px-2 pb-3">
                  <ul className="space-y-1">
                    {d.gaps.map((g: any, i: number) => (
                      <li key={i} className="text-xs bg-rose-500/10 rounded px-2 py-1 text-slate-300">
                        <span className="font-semibold text-rose-300">{dur(g.minutes)}</span>{' · '}
                        {new Date(g.from).toLocaleString()} → {g.to ? new Date(g.to).toLocaleString() : 'still offline'}
                      </li>
                    ))}
                  </ul>
                </td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500 px-3 py-2 border-t border-slate-800">
        Offline = no heartbeat or data push for {data?.threshold_minutes ?? 5} min (platform setting <code>device_offline_threshold_minutes</code>).
        Retired devices are excluded. Percentages count only the time since tracking began for each device.
      </p>
    </div>
  );
}
