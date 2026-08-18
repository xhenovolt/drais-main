'use client';

/**
 * Control Center — cross-school communications overview.
 * Reuses comm_dispatch_log's channel/status columns (no new tables) —
 * see src/app/api/control-center/comm/route.ts. Distinct from
 * /control/sms (SMS billing/quota economics specifically).
 */
import React from 'react';
import useSWR from 'swr';
import { Send, Loader2, CheckCircle2, XCircle, Eye } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const nf = (n: any) => Number(n || 0).toLocaleString();

const CHANNEL_LABEL: Record<string, string> = {
  sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp', push: 'Push', in_app: 'In-app',
};

export default function ControlComm() {
  const { data, isLoading } = useSWR<any>('/api/control-center/comm?days=30', fetcher, { refreshInterval: 60_000 });
  const overview = data?.overview ?? [];
  const bySchool: any[] = data?.bySchool ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Cross-school message delivery — last 30 days, every channel.</p>

      {isLoading && <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}

      {!isLoading && overview.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
          No messages sent on any channel in the last 30 days.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {overview.map((o: any) => (
          <div key={o.channel} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-200">{CHANNEL_LABEL[o.channel] ?? o.channel}</span>
              <Send className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-slate-100 tabular-nums">{nf(o.total)}</div>
                <div className="text-[10px] text-slate-500">Total</div>
              </div>
              <div>
                <div className="text-lg font-bold text-emerald-400 tabular-nums flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />{nf(o.delivered)}
                </div>
                <div className="text-[10px] text-slate-500">Delivered</div>
              </div>
              <div>
                <div className="text-lg font-bold text-rose-400 tabular-nums flex items-center justify-center gap-1">
                  <XCircle className="w-3.5 h-3.5" />{nf(o.failed)}
                </div>
                <div className="text-[10px] text-slate-500">Failed</div>
              </div>
            </div>
            {o.deliveryRate != null && (
              <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
                <Eye className="w-3 h-3" /> {o.deliveryRate}% delivery rate (of sent)
              </div>
            )}
          </div>
        ))}
      </div>

      {bySchool.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-semibold text-slate-300">By school</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">School</th>
                  <th className="text-left px-4 py-2">Channel</th>
                  <th className="text-right px-4 py-2">Messages</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {bySchool.map((r: any, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-300">{r.school_name ?? `#${r.school_id}`}</td>
                    <td className="px-4 py-2 text-slate-400">{CHANNEL_LABEL[r.channel] ?? r.channel}</td>
                    <td className="px-4 py-2 text-right text-slate-200 tabular-nums">{nf(r.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
