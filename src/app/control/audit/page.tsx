'use client';

/** Control Center audit log — every operator action, who/what/when/where. */
import React from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { ExportButtons } from '@/app/control/_components/ExportButtons';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());

export default function ControlAudit() {
  const { data, isLoading } = useSWR<any>('/api/control-center/audit', fetcher);
  const rows = data?.rows || [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{rows.length} audit entr{rows.length === 1 ? 'y' : 'ies'}</p>
        <ExportButtons filename="drais-audit" rows={rows} columns={[
          { key: 'created_at', label: 'When', value: (r) => new Date(r.created_at).toISOString() },
          { key: 'user_name', label: 'Who' }, { key: 'action', label: 'Action' },
          { key: 'resource', label: 'Resource' }, { key: 'metadata', label: 'Detail' }, { key: 'ip', label: 'IP' },
        ]} />
      </div>
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-slate-500 border-b border-slate-800">
          <tr>
            <th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">Who</th>
            <th className="px-3 py-2 text-left">Action</th><th className="px-3 py-2 text-left">Resource</th>
            <th className="px-3 py-2 text-left">Detail</th><th className="px-3 py-2 text-left">IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {isLoading && <tr><td colSpan={6} className="px-3 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-indigo-400 inline" /></td></tr>}
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-3 py-2 text-slate-300">{r.user_name || '—'}</td>
              <td className="px-3 py-2 text-indigo-300 font-mono">{r.action}</td>
              <td className="px-3 py-2 text-slate-400 font-mono">{r.resource || ''}</td>
              <td className="px-3 py-2 text-slate-500 max-w-[240px] truncate">{r.metadata || ''}</td>
              <td className="px-3 py-2 text-slate-600 font-mono">{r.ip || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
