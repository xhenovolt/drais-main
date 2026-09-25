'use client';

/**
 * SMS Outbox — what DRAIS created, and exactly how far each message got.
 *
 * Statuses are honest: SENT means the provider accepted the message; only a provider delivery report makes it
 * DELIVERED. Click any row to see the full lifecycle and WHY DRAIS sent it (residence, boarding policy, punch,
 * reporting period, rule) — so no one has to ask the founder.
 */
import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Inbox, Loader2, RefreshCw, Search, X, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import FilterAccordion, { FilterField, filterInputCls, type FilterChip } from '@/components/ui/FilterAccordion';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

type Status = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'expired';
const STATUSES: Status[] = ['queued', 'sending', 'sent', 'delivered', 'failed', 'expired'];
const STATUS_LABEL: Record<Status, string> = {
  queued: 'Queued', sending: 'Sending', sent: 'Sent to provider', delivered: 'Delivered', failed: 'Failed', expired: 'Expired',
};
const TONE: Record<Status, string> = {
  queued: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  sending: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  sent: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const TYPE_LABEL: Record<string, string> = {
  ARRIVAL_ON_TIME: 'Arrival', LATE_ARRIVAL: 'Late arrival', ABSENT: 'Absence', HALF_DAY: 'Half day',
  EARLY_LEAVE: 'Early leave', NON_SESSION_DAY: 'No school', BOARDING_REPORTED: 'Boarding reported',
};

interface Row {
  id: number; channel: string; recipient_name: string | null; recipient_phone: string; body_preview: string;
  attempts: number; max_attempts: number; last_error: string | null; notification_type: string | null;
  attendance_date: string | null; created_at: string; display_status: Status; policy_name: string | null;
  learner_name: string | null; provider: string | null; provider_message_id: string | null;
}
interface Payload { rows: Row[]; total: number; page: number; totalPages: number; statusCounts: Record<string, number>; types: { type: string; n: number }[] }

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');

export default function SmsOutboxPage() {
  const [status, setStatus] = useState<'all' | Status>('all');
  const [type, setType] = useState('');
  const [channel, setChannel] = useState('');
  const [range, setRange] = useState('24');            // hours, or 'custom'
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => { setQ(searchInput.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [searchInput]);
  useEffect(() => { setPage(1); }, [status, type, channel, range, from, to]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (status !== 'all') p.set('status', status);
    if (type) p.set('type', type);
    if (channel) p.set('channel', channel);
    if (q) p.set('q', q);
    if (range === 'custom') { if (from) p.set('date_from', from); if (to) p.set('date_to', to); } else p.set('since_hours', range);
    p.set('page', String(page)); p.set('per_page', '50');
    return p.toString();
  }, [status, type, channel, q, range, from, to, page]);

  const { data, mutate, isLoading } = useSWR<Payload & { error?: string }>(`/api/admin/notifications/outbox?${qs}`, fetcher, { refreshInterval: 15_000 });
  const rows = data?.rows ?? [];
  const counts = data?.statusCounts ?? {};

  const chips: FilterChip[] = [];
  if (type) chips.push({ key: 'type', label: `Type: ${TYPE_LABEL[type] ?? type}`, onRemove: () => setType('') });
  if (channel) chips.push({ key: 'ch', label: `Channel: ${channel}`, onRemove: () => setChannel('') });
  if (range !== '24') chips.push({ key: 'range', label: range === 'custom' ? `Dates: ${from || '…'} → ${to || '…'}` : `Last ${Number(range) >= 24 ? `${Number(range) / 24}d` : `${range}h`}`, onRemove: () => setRange('24') });
  const clearAll = () => { setType(''); setChannel(''); setRange('24'); setFrom(''); setTo(''); setStatus('all'); setSearchInput(''); };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Inbox className="w-6 h-6 text-indigo-600" /> SMS Outbox</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Every message DRAIS created, and how far it got. Refreshes every 15 seconds.</p>
        </div>
        <button onClick={() => mutate()} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? 'all' : s)} aria-pressed={status === s}
            className={`text-left px-3 py-2.5 rounded-xl border bg-white dark:bg-gray-900 ${status === s ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{STATUS_LABEL[s]}</div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{(counts[s] ?? 0).toLocaleString()}</div>
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span><b>Sent to provider</b> means the SMS company accepted the message. <b>Delivered</b> appears only when the provider confirms it reached the phone.</span>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search parent name, phone or learner…"
          className={`${filterInputCls} pl-9 py-2`} aria-label="Search messages" />
      </div>

      <FilterAccordion chips={chips} onClear={clearAll}>
        <FilterField label="Message type">
          <select className={filterInputCls} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any</option>
            {(data?.types ?? []).map((t) => <option key={t.type} value={t.type}>{TYPE_LABEL[t.type] ?? t.type} ({t.n})</option>)}
          </select>
        </FilterField>
        <FilterField label="Channel">
          <select className={filterInputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">Any</option><option value="sms">SMS</option><option value="email">Email</option><option value="push">Push</option>
          </select>
        </FilterField>
        <FilterField label="When">
          <select className={filterInputCls} value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="1">Last hour</option><option value="24">Last 24 hours</option><option value="72">Last 3 days</option>
            <option value="168">Last 7 days</option><option value="720">Last 30 days</option><option value="custom">Custom dates…</option>
          </select>
        </FilterField>
        {range === 'custom' && (
          <>
            <FilterField label="From"><input type="date" className={filterInputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></FilterField>
            <FilterField label="To"><input type="date" className={filterInputCls} value={to} onChange={(e) => setTo(e.target.value)} /></FilterField>
          </>
        )}
      </FilterAccordion>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : data?.error ? (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{data.error}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-14 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <Inbox className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">No messages match these filters.</p>
          {(status !== 'all' || chips.length > 0 || q) && <button onClick={clearAll} className="mt-2 text-sm text-indigo-600 underline">Clear filters</button>}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Created</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Parent</th><th className="px-3 py-2 text-left">Learner</th><th className="px-3 py-2 text-left">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}
                  className="align-top cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-800/60">
                  <td className="px-3 py-2 whitespace-nowrap text-[12px] text-gray-600 dark:text-gray-400">{fmt(r.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${TONE[r.display_status]}`}>{STATUS_LABEL[r.display_status]}</span>
                    {r.attempts > 1 && <span className="ml-1 text-[10px] text-gray-500">{r.attempts}/{r.max_attempts}</span>}
                    {r.last_error && <div className="text-[11px] text-red-600 dark:text-red-400 mt-1 max-w-[200px] line-clamp-2">{r.last_error}</div>}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-gray-700 dark:text-gray-300">{r.notification_type ? TYPE_LABEL[r.notification_type] ?? r.notification_type : (r.policy_name ?? '—')}</td>
                  <td className="px-3 py-2"><div className="font-medium text-gray-900 dark:text-gray-100">{r.recipient_name || '—'}</div><div className="text-[11px] text-gray-500 font-mono">{r.recipient_phone}</div></td>
                  <td className="px-3 py-2 text-[12px] text-gray-700 dark:text-gray-300">{r.learner_name || '—'}</td>
                  <td className="px-3 py-2 max-w-[260px]"><span className="text-[12px] text-gray-600 dark:text-gray-400 line-clamp-2">{r.body_preview}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>{data.total.toLocaleString()} messages · page {data.page} of {data.totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Prev</button>
            <button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {openId && <Detail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Detail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = useSWR<any>(`/api/admin/notifications/outbox/${id}`, fetcher);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const m = data?.message;
  const dec = data?.decision;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="SMS details">
      <div className="w-full max-w-lg h-full overflow-y-auto bg-white dark:bg-gray-900 shadow-2xl p-5 space-y-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">SMS details</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
        </div>
        {isLoading && <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
        {data?.error && <p className="text-sm text-red-600">{data.error}</p>}
        {m && (
          <>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-gray-500">Status</dt>
              <dd><span className={`text-[11px] px-1.5 py-0.5 rounded ${TONE[m.status as Status]}`}>{STATUS_LABEL[m.status as Status]}</span><div className="text-xs text-gray-500 mt-1">{m.statusHelp}</div></dd>
              <dt className="text-gray-500">Recipient</dt><dd className="text-gray-900 dark:text-gray-100">{m.recipientName || '—'}<div className="font-mono text-xs text-gray-500">{m.recipientPhone || m.recipientEmail}</div></dd>
              <dt className="text-gray-500">School</dt><dd className="text-gray-900 dark:text-gray-100">{m.schoolName || '—'}</dd>
              <dt className="text-gray-500">Learner</dt><dd className="text-gray-900 dark:text-gray-100">{m.learnerName || '—'}</dd>
              <dt className="text-gray-500">Type</dt><dd className="text-gray-900 dark:text-gray-100">{m.notificationLabel || m.policyName || '—'}{m.attendanceDate ? <span className="text-gray-500"> · {String(m.attendanceDate).slice(0, 10)}</span> : null}</dd>
              <dt className="text-gray-500">Message</dt><dd className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{m.body}</dd>
              {m.lastError && (<><dt className="text-gray-500">Problem</dt><dd className="text-red-600 dark:text-red-400">{m.lastError}</dd></>)}
            </dl>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">What happened to it</h3>
              <ol className="space-y-2">
                {data.lifecycle.map((s: any, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1 w-2.5 h-2.5 rounded-full ${s.done ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className={s.done ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}>{s.step}{s.at ? <span className="text-gray-500"> — {fmt(s.at)}</span> : s.done ? '' : ' — not yet'}</span>
                  </li>
                ))}
              </ol>
              {data.deliveries.length > 0 && (
                <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {data.deliveries.map((d: any, i: number) => (
                    <div key={i} className="rounded-md bg-gray-50 dark:bg-gray-800 px-2 py-1.5">
                      {d.provider} · {d.accepted ? 'accepted' : 'rejected'}{d.providerMessageId ? <> · id <span className="font-mono">{d.providerMessageId}</span></> : null}{d.cost ? ` · ${d.cost}` : ''}{d.error ? ` · ${d.error}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Why was this sent?</h3>
              {dec ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-2">
                  <div className="font-medium text-gray-900 dark:text-gray-100">Decision: {dec.decision === 'SEND' ? 'Send' : 'Do not send'}{dec.reasonText ? <span className="font-normal text-gray-600 dark:text-gray-400"> — {dec.reasonText}</span> : null}</div>
                  <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300 space-y-0.5">{dec.explanation.map((l: string, i: number) => <li key={i}>{l}</li>)}</ul>
                  {dec.facts?.firstPunchAt && <div className="text-xs text-gray-500">Punch: {fmt(dec.facts.firstPunchAt)}{dec.facts.reportingPeriod ? ` · Reporting period: ${dec.facts.reportingPeriod}` : ''}</div>}
                </div>
              ) : (
                <p className="text-sm text-gray-500">{data.decisionNote || 'This message was not created by an attendance rule.'}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
