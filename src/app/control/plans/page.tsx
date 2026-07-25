'use client';

/**
 * Control Center — subscription plan catalog (Roadmap P5).
 * View the plan tiers and their configurable limits; edit limits inline.
 * A plan is assigned to a school from that school's operations view.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import { CreditCard, Loader2, Save } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const LIMITS: Array<[string, string]> = [
  ['learners', 'Learners'], ['staff', 'Staff'], ['devices', 'Devices'],
  ['sms_monthly', 'SMS / mo'], ['storage_mb', 'Storage (MB)'],
];
const fmt = (v: any) => (v == null || v === 0 ? '∞' : Number(v).toLocaleString());

export default function ControlPlans() {
  const { data, isLoading, mutate } = useSWR<any>('/api/control-center/plans', fetcher);
  const plans = data?.plans || [];
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [busy, setBusy] = useState(false);

  const startEdit = (p: any) => { setEditing(p.code); setDraft({ ...p, limits: { ...p.limits } }); };
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/control-center/plans', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (!j.success) alert(j.error || 'Save failed');
      setEditing(null);
      await mutate();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">{plans.length} plan tier{plans.length === 1 ? '' : 's'} · edit limits inline · assign a plan from a school's operations view</p>
      {isLoading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {plans.map((p: any) => {
          const isEd = editing === p.code;
          return (
            <div key={p.code} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  <span className="font-semibold text-slate-100">{p.name}</span>
                  <span className="text-[10px] font-mono text-slate-500">{p.code}</span>
                  {!p.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">inactive</span>}
                </div>
                {isEd
                  ? <button onClick={save} disabled={busy} className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50"><Save className="w-3 h-3" /> Save</button>
                  : <button onClick={() => startEdit(p)} className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">Edit limits</button>}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {LIMITS.map(([key, label]) => (
                  <div key={key} className="text-center">
                    <div className="text-[10px] text-slate-500">{label}</div>
                    {isEd
                      ? <input type="number" value={draft.limits?.[key] ?? ''} placeholder="∞"
                          onChange={e => setDraft((d: any) => ({ ...d, limits: { ...d.limits, [key]: e.target.value === '' ? null : Number(e.target.value) } }))}
                          className="w-full mt-0.5 px-1 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100 text-center" />
                      : <div className="text-sm font-bold text-slate-100 tabular-nums">{fmt(p.limits?.[key])}</div>}
                  </div>
                ))}
              </div>
              {p.features?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.features.map((f: string) => <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{f}</span>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">Limits: a blank / 0 value means unlimited. Changes are audited. Enforcement at create-time lands in a follow-up (the limit maths already ship here).</p>
    </div>
  );
}
