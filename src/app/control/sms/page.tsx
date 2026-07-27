'use client';

/**
 * Control Center — SMS Financial Control Center (P5).
 * Provider balance + estimated capacity, and per-school allocation vs used vs
 * remaining. Allocate credits so one school can't burn another's.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import { MessageSquare, Loader2, Wallet, Save } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const nf = (n: any) => Number(n || 0).toLocaleString();

export default function ControlSms() {
  const { data, isLoading, mutate } = useSWR<any>('/api/control-center/sms', fetcher, { refreshInterval: 60_000 });
  const provider = data?.provider;
  const totals = data?.totals;
  const rows = data?.rows || [];

  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const save = async (schoolId: number) => {
    const val = edits[schoolId];
    if (val === undefined) return;
    setSaving(schoolId);
    try {
      await fetch('/api/control-center/sms', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId, quota: Number(val) }),
      });
      setEdits((e) => { const n = { ...e }; delete n[schoolId]; return n; });
      await mutate();
    } finally { setSaving(null); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">SMS economics — provider balance, per-school allocation & usage.</p>

      {/* Provider overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1"><span className="text-xs text-slate-400">Provider balance</span><Wallet className="w-4 h-4 text-emerald-400" /></div>
          <div className="text-2xl font-bold text-slate-100 tabular-nums">
            {provider?.ok ? `${provider.currency} ${nf(provider.amount)}` : (isLoading ? '…' : '—')}
          </div>
          <div className="text-[11px] text-slate-500">Africa&apos;s Talking (platform)</div>
          {provider && !provider.ok && <div className="text-[11px] text-rose-400 mt-1">{provider.error}</div>}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Estimated capacity</div>
          <div className="text-2xl font-bold text-sky-300 tabular-nums">{provider?.estimated_sms != null ? nf(provider.estimated_sms) : '—'}</div>
          <div className="text-[11px] text-slate-500">SMS @ {provider?.unit_cost ?? 32}/unit</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Allocated</div>
          <div className="text-2xl font-bold text-indigo-300 tabular-nums">{nf(totals?.allocated)}</div>
          <div className="text-[11px] text-slate-500">across {totals?.schools ?? 0} schools</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Used (segments)</div>
          <div className="text-2xl font-bold text-amber-300 tabular-nums">{nf(totals?.used)}</div>
          <div className="text-[11px] text-slate-500">from SMS_SENT audit</div>
        </div>
      </div>

      {/* Per-school allocation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 border-b border-slate-800 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">School</th>
              <th className="px-3 py-2 text-right">Allocated</th>
              <th className="px-3 py-2 text-right">Used</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading && <tr><td colSpan={5} className="px-3 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400 inline" /></td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No schools.</td></tr>}
            {rows.map((r: any) => {
              const editing = edits[r.school_id] ?? (r.quota ?? '');
              const dirty = edits[r.school_id] !== undefined && Number(edits[r.school_id]) !== (r.quota ?? 0);
              const over = r.quota != null && r.used > r.quota;
              return (
                <tr key={r.school_id}>
                  <td className="px-3 py-2 text-slate-200">{r.name}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={editing}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [r.school_id]: e.target.value }))}
                      placeholder="unlimited"
                      className="w-24 px-2 py-1 text-right rounded bg-slate-800 border border-slate-700 text-slate-100 text-xs tabular-nums" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-300">{nf(r.used)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${over ? 'text-rose-400 font-semibold' : 'text-emerald-300'}`}>
                    {r.remaining == null ? '∞' : nf(r.remaining)}{over ? ' (over)' : ''}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => save(r.school_id)} disabled={!dirty || saving === r.school_id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs disabled:opacity-40">
                      {saving === r.school_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Allocation caps how many SMS segments a school may consume; usage is counted from audited SMS_SENT events. Leave blank for unlimited. Enforcement blocks a send once a school exceeds its allocation.</p>
    </div>
  );
}
