'use client';

/** All schools with operational vitals — click through for the operations view. */
import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { School, HardDrive, Loader2 } from 'lucide-react';
import { ExportButtons } from '@/app/control/_components/ExportButtons';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const ago = (d: string | null) => {
  if (!d) return 'never';
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
};

export default function ControlSchools() {
  const [showDeleted, setShowDeleted] = React.useState(false);
  const { data, isLoading } = useSWR<any>(`/api/control-center/schools${showDeleted ? '?include_deleted=1' : ''}`, fetcher);
  const rows = data?.rows || [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{rows.length} school{rows.length === 1 ? '' : 's'} {showDeleted ? '(incl. deleted)' : 'on the platform'}</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Show deleted
          </label>
          <ExportButtons filename="drais-schools" rows={rows} columns={[
            { key: 'name', label: 'School' }, { key: 'status', label: 'Status' },
            { key: 'learners', label: 'Learners' }, { key: 'staff', label: 'Staff' },
            { key: 'devices', label: 'Devices online', value: (r) => `${r.devices.online}/${r.devices.total}` },
            { key: 'plan', label: 'Plan', value: (r) => r.subscription?.plan || '' },
            { key: 'sub_status', label: 'Sub status', value: (r) => r.subscription?.status || '' },
            { key: 'district', label: 'District' }, { key: 'country', label: 'Country' },
            { key: 'last_sync', label: 'Last sync' },
          ]} />
        </div>
      </div>
      {isLoading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((s: any) => (
          <Link key={s.id} href={`/control/schools/${s.id}`}
            className={`block bg-slate-900 border rounded-xl p-4 transition-colors hover:border-indigo-600 ${s.deleted_at ? 'border-rose-900/60 opacity-70' : 'border-slate-800'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <School className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-slate-100 truncate">{s.name}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                s.deleted_at ? 'bg-rose-500/20 text-rose-300'
                  : s.status === 'active' ? 'bg-emerald-500/20 text-emerald-300'
                    : s.status === 'archived' ? 'bg-slate-600/40 text-slate-300'
                      : 'bg-amber-500/20 text-amber-300'}`}>{s.deleted_at ? 'deleted' : s.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div><div className="text-lg font-bold text-slate-100 tabular-nums">{s.learners.toLocaleString()}</div><div className="text-[10px] text-slate-500">learners</div></div>
              <div><div className="text-lg font-bold text-slate-100 tabular-nums">{s.staff.toLocaleString()}</div><div className="text-[10px] text-slate-500">staff</div></div>
              <div>
                <div className={`text-lg font-bold tabular-nums ${s.devices.total && s.devices.online < s.devices.total ? 'text-amber-300' : 'text-slate-100'}`}>
                  {s.devices.online}/{s.devices.total}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center justify-center gap-0.5"><HardDrive className="w-3 h-3" /> devices</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
              <span>Sub: {s.subscription.plan || '—'} ({s.subscription.status || '—'})</span>
              <span>Last sync: {ago(s.last_sync)}</span>
            </div>
            {s.modules.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {s.modules.map((m: string) => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">✓ {m}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
