'use client';

/** School operations view — "is this school operating normally?" + feature flags. */
import React, { use, useCallback, useState } from 'react';
import useSWR from 'swr';
import { HardDrive, Clock, MessageSquare, Loader2, ToggleLeft, ToggleRight, Activity, Power, CalendarPlus, CreditCard, LogIn, Fingerprint, Archive } from 'lucide-react';

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
        <div className="flex items-center gap-2">
          <OpenSchoolButton schoolId={s.id} />
          <span className={`text-[11px] px-2 py-1 rounded font-semibold uppercase ${
            s.deleted_at ? 'bg-rose-500/20 text-rose-300'
              : s.status === 'active' ? 'bg-emerald-500/20 text-emerald-300'
                : s.status === 'archived' ? 'bg-slate-600/40 text-slate-300'
                  : 'bg-amber-500/20 text-amber-300'}`}>{s.deleted_at ? 'deleted' : s.status}</span>
        </div>
      </div>

      {/* Subscription & lifecycle control — operate the school without its login */}
      <SubscriptionControl school={s} act={act} />

      {/* Plan & usage (P5) — catalog plan + limits vs current usage */}
      <PlanUsagePanel plan={data.plan} usage={data.plan_usage} act={act} />

      {/* Billing ledger (P11) — invoices + payments; payment extends access */}
      <BillingPanel schoolId={s.id} currency={data.plan?.currency || 'UGX'} />


      {/* Lifecycle — archive / soft-delete / restore (data is never hard-deleted) */}
      <LifecycleControl school={s} act={act} />


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

      {/* Recent activity — see the school operating live, WITHOUT impersonation (P3). */}
      <Panel title="Recent activity (live)" icon={<Fingerprint className="w-4 h-4" />}>
        {(data.recent_punches || []).length === 0 ? <p className="text-xs text-slate-500">No punches recorded yet.</p> : (
          <div className="space-y-1">
            {(data.recent_punches || []).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300 truncate">
                  {p.who || <span className="text-amber-300">#{p.device_user_id || '—'} (unmatched)</span>}
                  <span className="text-slate-600 ml-1.5">{p.role_type || ''}</span>
                </span>
                <span className="text-slate-500 flex items-center gap-1.5">
                  <span className="font-mono text-[10px]">{p.device_sn}</span>
                  {new Date(p.punch_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-500 mt-2">Read-only platform view of the last punches — confirm attendance is flowing without logging into the school.</p>
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

function BillingPanel({ schoolId, currency }: { schoolId: number; currency: string }) {
  const { data, mutate } = useSWR<any>(`/api/control-center/schools/${schoolId}/billing`, fetcher);
  const [busy, setBusy] = useState(false);
  const invoices = data?.invoices || [];
  const outstanding = Number(data?.totalOutstanding || 0);
  const money = (n: any) => `${currency} ${Number(n || 0).toLocaleString()}`;

  const post = (body: any) => fetch(`/api/control-center/schools/${schoolId}/billing`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json());

  const act = async (body: any) => { setBusy(true); try { const j = await post(body); if (!j.success) alert(j.error || 'Failed'); await mutate(); return j; } finally { setBusy(false); } };
  const pay = async (inv: any) => {
    const amt = prompt(`Record a payment for invoice #${inv.id} (outstanding ${money(inv.outstanding)}).\nAmount:`, String(inv.outstanding));
    if (amt == null) return;
    const method = prompt('Method (e.g. mobile money, bank, cash):', 'mobile money') || 'manual';
    const reference = prompt('Reference / transaction id (optional):') || '';
    const j = await act({ action: 'record_payment', invoice_id: inv.id, amount: Number(amt), method, reference });
    if (j?.success && j.paid_in_full) alert(`Paid in full — access extended to ${j.new_end || 'the period end'}.`);
  };
  const STATUS: Record<string, string> = { paid: 'bg-emerald-500/20 text-emerald-300', issued: 'bg-sky-500/20 text-sky-300', overdue: 'bg-rose-500/20 text-rose-300', void: 'bg-slate-600/40 text-slate-400' };

  return (
    <Panel title="Billing" icon={<CreditCard className="w-4 h-4" />}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">Outstanding: <span className={outstanding > 0 ? 'text-rose-300 font-semibold' : 'text-emerald-300 font-semibold'}>{money(outstanding)}</span></span>
        <button onClick={() => act({ action: 'generate_invoice' })} disabled={busy}
          className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50">Generate invoice</button>
      </div>
      {invoices.length === 0 ? <p className="text-xs text-slate-500">No invoices yet.</p> : (
        <div className="space-y-1.5">
          {invoices.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between text-xs bg-slate-950/30 rounded-lg px-3 py-2">
              <span className="text-slate-300">
                <span className="font-mono">#{i.id}</span> · {money(i.amount)}
                {Number(i.installation_amount) > 0 && <span className="text-amber-300/90"> (incl. {money(i.installation_amount)} install)</span>}
                <span className="text-slate-500"> · {i.period_start ? String(i.period_start).slice(0, 10) : '—'} → {i.period_end ? String(i.period_end).slice(0, 10) : 'one-time'}</span>
                {i.outstanding > 0 && i.status !== 'void' && <span className="text-rose-400"> · owes {money(i.outstanding)}</span>}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${STATUS[i.status] || ''}`}>{i.status}</span>
                {i.status !== 'paid' && i.status !== 'void' && <button onClick={() => pay(i)} disabled={busy} className="text-[11px] px-2 py-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white disabled:opacity-50">Pay</button>}
                {i.status !== 'paid' && i.status !== 'void' && <button onClick={() => confirm(`Void invoice #${i.id}?`) && act({ action: 'void_invoice', invoice_id: i.id })} disabled={busy} className="text-[11px] px-1.5 py-1 rounded bg-slate-800 hover:bg-rose-600/40 text-rose-300 disabled:opacity-50">Void</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-500 mt-2">Recording a full payment marks the invoice paid and extends the school's access to the invoice period end (which drives auto-suspend). Audited.</p>
    </Panel>
  );
}

function LifecycleControl({ school, act }: { school: any; act: (b: any) => Promise<boolean> }) {
  const deleted = !!school.deleted_at;
  const archived = school.status === 'archived';
  const ask = (msg: string, action: string, reason = false) => async () => {
    if (!confirm(msg)) return;
    const body: any = { action };
    if (reason) { const r = prompt('Reason (optional):') || undefined; if (r) body.reason = r; }
    await act(body);
  };
  const post = (body: any) => fetch(`/api/control-center/schools/${school.id}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json());

  const hardDelete = async () => {
    const fp = await post({ action: 'footprint' });
    const f = fp?.footprint || { learners: 0, staff: 0, events: 0, devices: 0 };
    const typed = prompt(
      `⚠ PERMANENT DELETE — this ERASES ALL DATA for "${school.name}" ` +
      `(${f.learners} learners, ${f.staff} staff, ${f.events} attendance events, ${f.devices} devices) ` +
      `across every table. This CANNOT be undone.\n\nType the school name exactly to confirm:`);
    if (typed == null) return;
    const real = f.learners >= 20 || f.staff >= 20 || f.events >= 500;
    let force = false;
    if (real) {
      if (!confirm(`This school holds real data. Are you ABSOLUTELY sure you want to force-permanently-delete it?`)) return;
      force = true;
    }
    const j = await post({ action: 'hard_delete', confirm_name: typed, force });
    if (j?.success) { alert(`Permanently deleted — ${j.totalRows} rows across ${j.tables} tables.`); window.location.href = '/control/schools'; }
    else alert(j?.error || 'Delete failed');
  };

  return (
    <Panel title="Lifecycle" icon={<Archive className="w-4 h-4" />}>
      {/* Per-tenant data export (Phase 22) — operator-controlled backup / DR extract */}
      <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-slate-800">
        <span className="text-[11px] text-slate-500">Download this school's full dataset (every table) as a JSON backup. Audited.</span>
        <a href={`/api/control-center/schools/${school.id}/export`}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 whitespace-nowrap">Export data</a>
      </div>
      {deleted ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-rose-300">Soft-deleted — hidden from the platform. All data is preserved and can be restored.</span>
            <button onClick={ask('Restore this school to active?', 'restore')} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium">Restore</button>
          </div>
          <div className="border-t border-slate-800 pt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">Danger zone — permanently erase this school and all its data. Irreversible; type the name to confirm.</span>
            <button onClick={hardDelete} className="text-xs px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold whitespace-nowrap">Permanently delete</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {archived
            ? <button onClick={ask('Un-archive (reactivate) this school?', 'restore')} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium">Un-archive</button>
            : <button onClick={ask('Archive this school? It stays recoverable and its data is untouched, but it is marked inactive.', 'archive', true)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white font-medium">Archive</button>}
          <button onClick={ask('Soft-delete this school? It disappears from the platform but ALL data is preserved and can be restored later.', 'soft_delete', true)} className="text-xs px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white font-medium">Delete</button>
          <span className="text-[10px] text-slate-500">Archive = pause · Delete = hide (recoverable). Nothing is ever hard-deleted; every action is audited.</span>
        </div>
      )}
    </Panel>
  );
}

function PlanUsagePanel({ plan, usage, act }: { plan: any; usage: any[] | null; act: (b: any) => Promise<boolean> }) {
  const { data } = useSWR<any>('/api/control-center/plans', fetcher);
  const plans = data?.plans || [];
  const shown = (usage || []).filter((u: any) => ['learners', 'staff', 'devices'].includes(u.key));
  const fmt = (v: any) => (v == null ? '∞' : Number(v).toLocaleString());
  return (
    <Panel title="Plan & usage" icon={<CreditCard className="w-4 h-4" />}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-slate-300">
          Current plan: {plan ? <span className="font-semibold text-slate-100">{plan.name}</span> : <span className="text-amber-300">none / legacy</span>}
        </span>
        <div className="flex items-center gap-1.5">
          {plan && <button onClick={() => confirm(`Renew ${plan.name} for another ${plan.billing_cycle}?`) && act({ action: 'renew' })}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium">Renew</button>}
          <select defaultValue="" onChange={(e) => { if (e.target.value) act({ action: 'assign_plan', plan_code: e.target.value }); }}
            className="text-xs px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200">
            <option value="">Assign plan…</option>
            {plans.map((p: any) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </div>
      </div>
      {plan && (
        <p className="text-[11px] text-slate-400 mb-3">
          {Number(plan.price) > 0 ? `${plan.currency} ${Number(plan.price).toLocaleString()}` : 'Custom / free'} / {plan.billing_cycle}
          {plan.installments > 1 && Number(plan.price) > 0 ? ` · ${plan.installments}× ${plan.currency} ${Math.ceil(plan.price / plan.installments).toLocaleString()}` : ''}
          {' · '}Assigning or renewing sets the expiry that drives auto-suspend.
        </p>
      )}
      {!plan ? <p className="text-xs text-slate-500">Assign a catalog plan to enforce limits.</p> : shown.length === 0 ? <p className="text-xs text-slate-500">No usage data.</p> : (
        <div className="space-y-2">
          {shown.map((u: any) => (
            <div key={u.key}>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="text-slate-400 capitalize">{u.key}</span>
                <span className={u.over ? 'text-rose-400 font-semibold' : 'text-slate-300'}>{u.used.toLocaleString()} / {fmt(u.limit)}{u.over ? ' · OVER' : ''}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${u.over ? 'bg-rose-500' : u.pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${u.unlimited ? 0 : u.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-slate-500 mt-2">Assigning a plan is audited. Limits shown vs live usage; ∞ = unlimited.</p>
    </Panel>
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

function OpenSchoolButton({ schoolId }: { schoolId: number }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/control-center/impersonate', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ school_id: schoolId }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) window.location.href = j.redirect || '/dashboard';
      else { alert(j.error || 'Could not open school'); setBusy(false); }
    } catch { setBusy(false); }
  };
  return (
    <button onClick={open} disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />} Open school
    </button>
  );
}
