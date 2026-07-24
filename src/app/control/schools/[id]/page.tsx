'use client';

/** School operations view — "is this school operating normally?" + feature flags. */
import React, { use, useCallback, useState } from 'react';
import useSWR from 'swr';
import { HardDrive, Clock, MessageSquare, Loader2, ToggleLeft, ToggleRight, Activity, Power, CalendarPlus, CreditCard } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function ControlSchoolDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, mutate, isLoading } = useSWR<any>(`/api/control-center/schools/${id}`, fetcher);

  const act = useCallback(async (body: any) => {
    const r = await fetch(`/api/control-center/schools/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) mutate();
    return r.ok;
  }, [id, mutate]);
  const toggleModule = useCallback((code: string, enabled: boolean) => act({ action: 'set_module', module_code: code, enabled }), [act]);

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

      {/* Subscription & lifecycle control — operate the school without its login */}
      <SubscriptionControl school={s} act={act} />

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

function SubscriptionControl({ school, act }: { school: any; act: (b: any) => Promise<boolean> }) {
  const [plan, setPlan] = useState(school.subscription_plan || '');
  const [subStatus, setSubStatus] = useState(school.subscription_status || '');
  const [endDate, setEndDate] = useState(school.subscription_end_date ? String(school.subscription_end_date).slice(0, 10) : '');
  const [busy, setBusy] = useState('');
  const run = async (label: string, body: any) => { setBusy(label); try { await act(body); } finally { setBusy(''); } };
  const suspended = school.status === 'suspended';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-200 flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-indigo-400" /> Subscription &amp; lifecycle</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-[11px] text-slate-400">Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
            {['', 'Trial', 'Bronze', 'Silver', 'Gold', 'Enterprise'].map(p => <option key={p} value={p}>{p || '—'}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-400">Status
          <select value={subStatus} onChange={(e) => setSubStatus(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
            {['', 'trial', 'active', 'past_due', 'cancelled'].map(p => <option key={p} value={p}>{p || '—'}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-slate-400">Ends
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => run('save', { action: 'set_subscription', plan, subscription_status: subStatus, subscription_end_date: endDate || null })}
          disabled={busy === 'save'} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-50">
          {busy === 'save' ? 'Saving…' : 'Save subscription'}
        </button>
        {[30, 90, 365].map(d => (
          <button key={d} onClick={() => run(`ext${d}`, { action: 'extend_days', days: d })} disabled={busy === `ext${d}`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs disabled:opacity-50">
            <CalendarPlus className="w-3 h-3" /> +{d}d
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => run('status', { action: 'set_status', status: suspended ? 'active' : 'suspended' })} disabled={busy === 'status'}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 ${suspended ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-rose-600 hover:bg-rose-500 text-white'}`}>
          <Power className="w-3.5 h-3.5" /> {suspended ? 'Reactivate school' : 'Suspend school'}
        </button>
      </div>
      <p className="text-[10px] text-slate-500">Every change here is recorded in the Control Center audit log (who / when / old → new). Suspending blocks the school from operating without touching its data.</p>
    </div>
  );
}
