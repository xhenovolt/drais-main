'use client';

/** All schools with operational vitals — click through for the operations view. */
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { School, HardDrive, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  // Debounce search → one query on pause; any filter change resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => { setPage(1); }, [showDeleted]);

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (showDeleted) params.set('include_deleted', '1');
  if (q) params.set('q', q);
  const { data, isLoading } = useSWR<any>(`/api/control-center/schools?${params}`, fetcher, { keepPreviousData: true });
  const rows = data?.rows || [];
  const pg = data?.pagination || { page: 1, total: 0, totalPages: 1, limit: 25 };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search name, code, district…"
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 w-64 max-w-full"
            />
          </div>
          <p className="text-sm text-slate-400 whitespace-nowrap">{Number(pg.total).toLocaleString()} school{pg.total === 1 ? '' : 's'} {showDeleted ? '(incl. deleted)' : ''}</p>
        </div>
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
      {!isLoading && rows.length === 0 && (
        <p className="py-12 text-center text-slate-500 text-sm">No schools match your search.</p>
      )}
      {/* Pager */}
      <div className="flex items-center justify-end gap-2">
        <button
          disabled={pg.page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
        ><ChevronLeft className="w-3.5 h-3.5" /> Prev</button>
        <span className="text-xs text-slate-500">Page {pg.page} of {pg.totalPages}</span>
        <button
          disabled={pg.page >= pg.totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
        >Next <ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}
