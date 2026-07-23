'use client';

/** School operations view — "is this school operating normally?" + feature flags. */
import React, { use, useCallback } from 'react';
import useSWR from 'swr';
import { HardDrive, Clock, MessageSquare, Loader2, ToggleLeft, ToggleRight, Activity } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function ControlSchoolDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, mutate, isLoading } = useSWR<any>(`/api/control-center/schools/${id}`, fetcher);

  const toggleModule = useCallback(async (code: string, enabled: boolean) => {
    const r = await fetch(`/api/control-center/schools/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set_module', module_code: code, enabled }),
    });
    if (r.ok) mutate();
  }, [id, mutate]);

  if (isLoading || !data) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>;
  if (!data.success) return <p className="text-rose-400 text-sm">{data.error}</p>;

  const s = data.school;
  const enabledSet = new Set((data.modules.enabled || []).filter((m: any) => Number(m.is_enabled) === 1).map((m: any) => m.module_code));
  const att = data.attendance_today || [];
  const sum = (role: string, status: string) => att.filter((a: any) => a.role_type === role && a.status === status).reduce((x: number, a: any) => x + Number(a.n), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{s.name}</h1>
          <p className="text-xs text-slate-500">{s.district || ''} {s.country || ''} · Sub: {s.subscription_plan || '—'} ({s.subscription_status || '—'}) · Joined {new Date(s.created_at).toLocaleDateString()}</p>
        </div>
        <span className={`text-[11px] px-2 py-1 rounded font-semibold uppercase ${s.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>{s.status}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Punches (24h)" value={data.punches_24h} />
        <Tile label="Staff today" value={`${sum('staff', 'present') + sum('staff', 'late')} in`} sub={`${sum('staff', 'late')} late · ${sum('staff', 'absent')} absent`} />
        <Tile label="Learners today" value={`${sum('student', 'present') + sum('student', 'late')} in`} sub={`${sum('student', 'late')} late`} />
        <Tile label="SMS (48h)" value={(data.sms_48h || []).reduce((x: number, r: any) => x + Number(r.n), 0)} sub={(data.sms_48h || []).map((r: any) => `${r.n} ${r.status}`).join(' · ') || 'none'} />
      </div>

      {/* Devices */}
      <Panel title="Devices" icon={<HardDrive className="w-4 h-4" />}>
        {data.devices.length === 0 ? <p className="text-xs text-slate-500">No devices registered.</p> : (
          <div className="space-y-1.5">
            {data.devices.map((d: any) => (
              <div key={d.sn} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-mono">{d.device_name || d.sn} <span className="text-slate-600">({d.device_type || 'device'})</span></span>
                <span className={Number(d.is_online) ? 'text-emerald-400' : 'text-rose-400'}>
                  {Number(d.is_online) ? 'online' : `offline · last seen ${d.last_seen ? new Date(d.last_seen).toLocaleString() : 'never'}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Clock health */}
      {data.clock_health_today?.length > 0 && (
        <Panel title="Device time confidence (today)" icon={<Clock className="w-4 h-4" />}>
          {data.clock_health_today.map((c: any) => (
            <div key={c.device_sn} className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-mono">{c.device_sn}</span>
              <span className={c.status === 'trusted' ? 'text-emerald-400' : c.status === 'review' ? 'text-amber-300' : 'text-rose-400'}>
                {c.confidence}% · {c.likely_cause}
              </span>
            </div>
          ))}
        </Panel>
      )}

      {/* Sync events */}
      <Panel title="Sync activity (7 days)" icon={<Activity className="w-4 h-4" />}>
        {(data.sync_events_7d || []).length === 0 ? <p className="text-xs text-slate-500">No attendance data in 7 days — investigate.</p> : (
          (data.sync_events_7d || []).map((e: any) => (
            <div key={e.source} className="flex items-center justify-between text-xs">
              <span className="text-slate-300">{e.source}</span>
              <span className="text-slate-400">{Number(e.n).toLocaleString()} events · latest {new Date(e.latest).toLocaleString()}</span>
            </div>
          ))
        )}
      </Panel>

      {/* Feature management */}
      <Panel title="Features (foundation for feature flags)" icon={<MessageSquare className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {data.modules.catalog.map((m: any) => {
            const on = enabledSet.has(m.code);
            return (
              <button key={m.code} onClick={() => toggleModule(m.code, !on)}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-left">
                <span className="text-xs text-slate-200">{m.label}</span>
                {on ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-slate-600" />}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-500 mt-2">Toggles write the existing school_modules registry (super-admin only) and are audited.</p>
      </Panel>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-xl font-bold text-slate-100 tabular-nums">{value ?? '—'}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-1.5">{icon} {title}</p>
      {children}
    </div>
  );
}
