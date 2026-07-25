'use client';

/**
 * Control Center — platform device inventory (Roadmap P2).
 * Every device across every school. Assign an unclaimed device to a school,
 * release / reassign, suspend / activate / retire, and read its ownership
 * timeline. Ownership lives here now, not at the school level.
 */
import React, { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { HardDrive, Loader2, Search, History, X } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const ago = (d: string | null) => {
  if (!d) return 'never';
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
};
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-300',
  released: 'bg-amber-500/20 text-amber-300',
  suspended: 'bg-orange-500/20 text-orange-300',
  retired: 'bg-rose-500/20 text-rose-300',
  inactive: 'bg-slate-600/30 text-slate-300',
};

export default function ControlDevices() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [timelineSn, setTimelineSn] = useState<string | null>(null);
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  const { data, isLoading, mutate } = useSWR<any>(`/api/control-center/devices?${params}`, fetcher);
  const devices = data?.devices || [];
  const schools = data?.schools || [];
  const unassigned = useMemo(() => devices.filter((d: any) => d.school_id == null).length, [devices]);

  const act = useCallback(async (sn: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(`${sn}:${action}`);
    try {
      const r = await fetch('/api/control-center/devices', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sn, action, ...extra }),
      });
      const j = await r.json();
      if (!j.success) alert(j.error || 'Action failed');
      await mutate();
    } finally { setBusy(null); }
  }, [mutate]);

  const assign = useCallback((sn: string) => {
    const options = schools.map((s: any) => `${s.id} — ${s.name}`).join('\n');
    const input = prompt(`Assign ${sn} to which school? Enter the school ID.\n\n${options}`);
    if (!input) return;
    const id = Number(input.trim());
    if (!Number.isFinite(id) || id <= 0) { alert('Enter a valid numeric school ID.'); return; }
    act(sn, 'assign', { to_school_id: id });
  }, [schools, act]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-400">
          {devices.length} device{devices.length === 1 ? '' : 's'} on the platform
          {unassigned > 0 && <span className="ml-2 text-amber-300">· {unassigned} unassigned</span>}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search SN / name / location"
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100 w-64" />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-300">
            <option value="">All statuses</option>
            {['active', 'released', 'suspended', 'retired', 'inactive'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {isLoading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>}
      {data && devices.length === 0 && <p className="text-sm text-slate-500 text-center py-10">No devices match.</p>}

      <div className="space-y-2">
        {devices.map((d: any) => {
          const b = (a: string) => busy === `${d.sn}:${a}`;
          return (
            <div key={d.sn} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <HardDrive className={`w-4 h-4 ${d.is_online ? 'text-emerald-400' : 'text-slate-600'}`} />
                    <span className="font-mono text-sm font-semibold text-slate-100">{d.sn}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${STATUS_STYLE[d.status] || 'bg-slate-700 text-slate-300'}`}>{d.status}</span>
                    {!d.is_online && <span className="text-[10px] text-slate-500">seen {ago(d.last_seen)} ago</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {d.device_name || '—'} · {d.model_name || 'unknown model'} · {d.location || 'no location'}
                    {' · '}
                    {d.school_name
                      ? <span className="text-slate-300">{d.school_name}</span>
                      : <span className="text-amber-300 font-medium">UNASSIGNED</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => assign(d.sn)} disabled={!!busy}
                    className="text-[11px] px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50">
                    {b('assign') ? '…' : d.school_id == null ? 'Assign' : 'Reassign'}
                  </button>
                  {d.school_id != null && d.status !== 'released' && (
                    <button onClick={() => confirm(`Release ${d.sn} from ${d.school_name}?`) && act(d.sn, 'release')} disabled={!!busy}
                      className="text-[11px] px-2.5 py-1 rounded bg-amber-600/80 hover:bg-amber-500 text-white font-medium disabled:opacity-50">
                      {b('release') ? '…' : 'Release'}
                    </button>
                  )}
                  {d.status === 'suspended'
                    ? <button onClick={() => act(d.sn, 'activate')} disabled={!!busy}
                        className="text-[11px] px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium disabled:opacity-50">{b('activate') ? '…' : 'Activate'}</button>
                    : d.status !== 'retired' && <button onClick={() => act(d.sn, 'suspend')} disabled={!!busy}
                        className="text-[11px] px-2.5 py-1 rounded bg-orange-600/80 hover:bg-orange-500 text-white font-medium disabled:opacity-50">{b('suspend') ? '…' : 'Suspend'}</button>}
                  {d.status !== 'retired' && (
                    <button onClick={() => confirm(`Retire ${d.sn} permanently?`) && act(d.sn, 'retire')} disabled={!!busy}
                      className="text-[11px] px-2.5 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-medium disabled:opacity-50">{b('retire') ? '…' : 'Retire'}</button>
                  )}
                  <button onClick={() => setTimelineSn(d.sn)} title="Ownership timeline"
                    className="text-[11px] p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"><History className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {timelineSn && <TimelineDrawer sn={timelineSn} onClose={() => setTimelineSn(null)} />}
    </div>
  );
}

function TimelineDrawer({ sn, onClose }: { sn: string; onClose: () => void }) {
  const { data, isLoading } = useSWR<any>(`/api/control-center/devices/${encodeURIComponent(sn)}`, fetcher);
  const rows = data?.timeline || [];
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full p-5 overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2"><History className="w-4 h-4 text-indigo-400" /> Ownership timeline · <span className="font-mono">{sn}</span></h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
        </div>
        {isLoading && <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400 inline" /></div>}
        {data && rows.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No ownership events yet.</p>}
        <div className="space-y-2">
          {rows.map((t: any) => (
            <div key={t.id} className="border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-indigo-300">{t.status}</span>
                <span className="text-[11px] text-slate-500">{new Date(t.initiated_at).toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {t.from_school || (t.from_school_id ? `#${t.from_school_id}` : 'unassigned')} → {t.to_school || (t.to_school_id ? `#${t.to_school_id}` : '—')}
              </p>
              {t.reason && <p className="text-[11px] text-slate-500 mt-0.5">{t.reason}</p>}
              {(t.enrollments_archived > 0 || t.orphans_archived > 0) && (
                <p className="text-[11px] text-slate-500 mt-0.5">{t.enrollments_archived} enrollments archived · {t.orphans_archived} orphans · {t.raw_events_preserved} events preserved</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
