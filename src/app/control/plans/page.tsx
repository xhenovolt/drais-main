'use client';

/**
 * Control Center — subscription plan catalog, full CRUD (P5 / completeness).
 * Create, rename, retier, edit every limit, toggle features, activate /
 * deactivate, duplicate, and delete plans (delete blocked while schools use it).
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import { CreditCard, Loader2, Save, Plus, Copy, Trash2, X, Power } from 'lucide-react';
import { ExportButtons } from '@/app/control/_components/ExportButtons';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const LIMITS: Array<[string, string]> = [
  ['learners', 'Learners'], ['staff', 'Staff'], ['devices', 'Devices'],
  ['sms_monthly', 'SMS / mo'], ['storage_mb', 'Storage (MB)'],
];
const fmt = (v: any) => (v == null || v === 0 ? '∞' : Number(v).toLocaleString());
const CYCLES = ['monthly', 'termly', 'annual', 'one_time'];
const money = (p: any, c: string) => (Number(p) > 0 ? `${c} ${Number(p).toLocaleString()}` : 'Custom / free');
const perInstallment = (p: any, n: any) => Math.ceil((Number(p) || 0) / Math.max(1, Number(n) || 1));
const blankDraft = () => ({ code: '', name: '', tier: 0, limits: {}, features: [], is_active: true,
  price: 0, currency: 'UGX', billing_cycle: 'annual', installments: 1, deliverables: [], _isNew: true });

export default function ControlPlans() {
  const { data, isLoading, mutate } = useSWR<any>('/api/control-center/plans', fetcher);
  const plans = data?.plans || [];
  const modules = data?.module_catalog || [];
  const [draft, setDraft] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft.code || !draft.name) { alert('Code and name are required.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/control-center/plans', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (!j.success) { alert(j.error || 'Save failed'); return; }
      setDraft(null); await mutate();
    } finally { setBusy(false); }
  };
  const del = async (code: string, schools: number) => {
    if (schools > 0) { alert(`${schools} school(s) still on this plan — reassign them first.`); return; }
    if (!confirm(`Delete plan "${code}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/control-center/plans?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!j.success) alert(j.error || 'Delete failed');
      await mutate();
    } finally { setBusy(false); }
  };
  const toggleFeature = (code: string) =>
    setDraft((d: any) => ({ ...d, features: d.features.includes(code) ? d.features.filter((f: string) => f !== code) : [...d.features, code] }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{plans.length} plan{plans.length === 1 ? '' : 's'} · full edit, features, activate, duplicate, delete</p>
        <div className="flex items-center gap-2">
          <ExportButtons filename="drais-plans" rows={plans} columns={[
            { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'tier', label: 'Tier' },
            { key: 'is_active', label: 'Active', value: (r) => (r.is_active ? 'yes' : 'no') },
            { key: 'schools', label: 'Schools' },
            { key: 'learners', label: 'Learners', value: (r) => r.limits?.learners ?? '∞' },
            { key: 'staff', label: 'Staff', value: (r) => r.limits?.staff ?? '∞' },
            { key: 'devices', label: 'Devices', value: (r) => r.limits?.devices ?? '∞' },
            { key: 'sms_monthly', label: 'SMS/mo', value: (r) => r.limits?.sms_monthly ?? '∞' },
            { key: 'storage_mb', label: 'Storage MB', value: (r) => r.limits?.storage_mb ?? '∞' },
            { key: 'features', label: 'Features', value: (r) => (r.features || []).join('; ') },
          ]} />
          <button onClick={() => setDraft(blankDraft())} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"><Plus className="w-3.5 h-3.5" /> New plan</button>
        </div>
      </div>
      {isLoading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {plans.map((p: any) => (
          <div key={p.code} className={`bg-slate-900 border rounded-xl p-4 ${p.is_active ? 'border-slate-800' : 'border-slate-800/50 opacity-70'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <CreditCard className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-slate-100 truncate">{p.name}</span>
                <span className="text-[10px] font-mono text-slate-500">{p.code}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">tier {p.tier}</span>
                {!p.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">inactive</span>}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">{p.schools} school{p.schools === 1 ? '' : 's'}</span>
                <button onClick={() => setDraft({ ...p, limits: { ...p.limits }, features: [...(p.features || [])] })} className="text-[11px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">Edit</button>
                <button onClick={() => setDraft({ ...p, code: `${p.code}_copy`, name: `${p.name} (copy)`, limits: { ...p.limits }, features: [...(p.features || [])], _isNew: true })} title="Duplicate" className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"><Copy className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(p.code, p.schools)} disabled={busy} title="Delete" className="p-1.5 rounded bg-slate-800 hover:bg-rose-600/40 text-rose-400 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {/* Price + billing cycle */}
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-lg font-bold text-slate-100">{money(p.price, p.currency)}</span>
              <span className="text-[11px] text-slate-400">
                / {p.billing_cycle}{p.installments > 1 && Number(p.price) > 0 ? ` · ${p.installments}× ${p.currency} ${perInstallment(p.price, p.installments).toLocaleString()}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {LIMITS.map(([key, label]) => (
                <div key={key} className="text-center">
                  <div className="text-[10px] text-slate-500">{label}</div>
                  <div className="text-sm font-bold text-slate-100 tabular-nums">{fmt(p.limits?.[key])}</div>
                </div>
              ))}
            </div>
            {p.deliverables?.length > 0 && (
              <ul className="mt-3 space-y-0.5">
                {p.deliverables.map((d: string, i: number) => <li key={i} className="text-[11px] text-slate-400 flex gap-1.5"><span className="text-emerald-400">✓</span> {d}</li>)}
              </ul>
            )}
            {p.features?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.features.map((f: string) => <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{f}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && setDraft(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">{draft._isNew ? 'New plan' : `Edit ${draft.name}`}</h2>
              <button onClick={() => setDraft(null)} className="text-slate-400 hover:text-slate-200"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-400">Code
                <input value={draft.code} disabled={!draft._isNew} onChange={e => setDraft((d: any) => ({ ...d, code: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-sm text-slate-100 disabled:opacity-50 font-mono" placeholder="e.g. custom_gov" />
              </label>
              <label className="text-[11px] text-slate-400">Name
                <input value={draft.name} onChange={e => setDraft((d: any) => ({ ...d, name: e.target.value }))}
                  className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-sm text-slate-100" placeholder="Display name" />
              </label>
              <label className="text-[11px] text-slate-400">Tier
                <input type="number" value={draft.tier} onChange={e => setDraft((d: any) => ({ ...d, tier: Number(e.target.value) }))}
                  className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-sm text-slate-100" />
              </label>
              <button onClick={() => setDraft((d: any) => ({ ...d, is_active: !d.is_active }))}
                className={`mt-4 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-sm font-medium ${draft.is_active ? 'bg-emerald-600/80 text-white' : 'bg-slate-700 text-slate-300'}`}>
                <Power className="w-3.5 h-3.5" /> {draft.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>

            {/* Billing */}
            <div>
              <p className="text-[11px] text-slate-400 mb-1">Billing</p>
              <div className="grid grid-cols-4 gap-2">
                <label className="text-[10px] text-slate-500 col-span-2">Price ({draft.currency})
                  <input type="number" value={draft.price ?? 0} onChange={e => setDraft((d: any) => ({ ...d, price: Number(e.target.value) }))}
                    className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-sm text-slate-100" />
                </label>
                <label className="text-[10px] text-slate-500">Currency
                  <input value={draft.currency} onChange={e => setDraft((d: any) => ({ ...d, currency: e.target.value.toUpperCase().slice(0, 8) }))}
                    className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-sm text-slate-100" />
                </label>
                <label className="text-[10px] text-slate-500">Installments
                  <input type="number" min={1} value={draft.installments ?? 1} onChange={e => setDraft((d: any) => ({ ...d, installments: Math.max(1, Number(e.target.value)) }))}
                    className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-sm text-slate-100" />
                </label>
                <label className="text-[10px] text-slate-500 col-span-4">Billing cycle
                  <select value={draft.billing_cycle} onChange={e => setDraft((d: any) => ({ ...d, billing_cycle: e.target.value }))}
                    className="w-full mt-0.5 px-2 py-1.5 rounded bg-slate-950 border border-slate-700 text-sm text-slate-100">
                    {CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              {Number(draft.price) > 0 && draft.installments > 1 && (
                <p className="text-[10px] text-slate-500 mt-1">{draft.installments} installments of ~{draft.currency} {perInstallment(draft.price, draft.installments).toLocaleString()} each, due every {draft.billing_cycle}.</p>
              )}
            </div>

            {/* Deliverables */}
            <div>
              <p className="text-[11px] text-slate-400 mb-1">Deliverables (what the school gets)</p>
              <div className="space-y-1">
                {(draft.deliverables || []).map((d: string, i: number) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input value={d} onChange={e => setDraft((dr: any) => ({ ...dr, deliverables: dr.deliverables.map((x: string, j: number) => j === i ? e.target.value : x) }))}
                      className="flex-1 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100" />
                    <button onClick={() => setDraft((dr: any) => ({ ...dr, deliverables: dr.deliverables.filter((_: any, j: number) => j !== i) }))} className="text-rose-400 text-xs px-1">✕</button>
                  </div>
                ))}
                <button onClick={() => setDraft((d: any) => ({ ...d, deliverables: [...(d.deliverables || []), ''] }))} className="text-[11px] text-indigo-300 hover:underline">+ Add deliverable</button>
              </div>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">Limits (blank / 0 = unlimited)</p>
              <div className="grid grid-cols-5 gap-2">
                {LIMITS.map(([key, label]) => (
                  <label key={key} className="text-center text-[10px] text-slate-500">{label}
                    <input type="number" value={draft.limits?.[key] ?? ''} placeholder="∞"
                      onChange={e => setDraft((d: any) => ({ ...d, limits: { ...d.limits, [key]: e.target.value === '' ? null : Number(e.target.value) } }))}
                      className="w-full mt-0.5 px-1 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100 text-center" />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">Features / modules included</p>
              <div className="grid grid-cols-2 gap-1">
                {modules.map((m: any) => {
                  const on = draft.features.includes(m.code);
                  return (
                    <button key={m.code} onClick={() => toggleFeature(m.code)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded text-xs ${on ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-700' : 'bg-slate-800/60 text-slate-400 border border-transparent'}`}>
                      <span className="truncate">{m.label}</span>
                      <span className="text-[10px]">{on ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDraft(null)} className="px-3 py-1.5 text-sm text-slate-400">Cancel</button>
              <button onClick={save} disabled={busy} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save plan
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-500">All changes are audited (plan_saved / plan_deleted). A plan can't be deleted while any school is assigned to it — reassign first.</p>
    </div>
  );
}
