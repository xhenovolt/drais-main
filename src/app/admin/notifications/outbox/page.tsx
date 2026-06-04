'use client';

/**
 * /admin/notifications/outbox — observability tail for Phase 5.
 *
 * Phase 5 ships the policy + outbox + drainer cron — all working at
 * the data layer. This page is the missing operational eyeball: ops
 * sees what's queued, in-flight, delivered, or failed; spot-checks
 * delivery cost; chases failures to a misconfigured provider key or
 * exhausted AT credit before parents complain.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Inbox, Send, CheckCircle2, XCircle, Loader2, Clock, Filter,
  RefreshCw,
} from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface OutboxRow {
  id: number;
  policy_id: number;
  policy_name: string | null;
  channel: 'sms' | 'email' | 'push';
  recipient_phone: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  body: string;
  status: 'queued' | 'sending' | 'delivered' | 'failed' | 'expired';
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  scheduled_at: string;
  attempted_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface ApiPayload {
  rows: OutboxRow[];
  statusCounts: Record<string, number>;
  deliverySummary: { successCount: number; failureCount: number; totalCost: number };
  sinceHours: number;
}

type StatusFilter = 'all' | 'queued' | 'sending' | 'delivered' | 'failed' | 'expired';
type ChannelFilter = '' | 'sms' | 'email' | 'push';

const WINDOW_OPTIONS = [
  { value: 1,   label: 'Last 1h' },
  { value: 24,  label: 'Last 24h' },
  { value: 72,  label: 'Last 3d' },
  { value: 168, label: 'Last 7d' },
];

export default function NotificationOutboxPage() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [channel, setChannel] = useState<ChannelFilter>('');
  const [sinceHours, setSinceHours] = useState(24);

  const qs = new URLSearchParams();
  if (status !== 'all') qs.set('status', status);
  if (channel) qs.set('channel', channel);
  qs.set('since_hours', String(sinceHours));

  const { data, mutate, isLoading } = useSWR<ApiPayload>(
    `/api/admin/notifications/outbox?${qs.toString()}`,
    fetcher,
    { refreshInterval: 15_000 },
  );

  const rows = data?.rows ?? [];
  const counts = data?.statusCounts ?? { queued: 0, sending: 0, delivered: 0, failed: 0, expired: 0 };
  const delivery = data?.deliverySummary ?? { successCount: 0, failureCount: 0, totalCost: 0 };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-indigo-600" />
            Notification Outbox
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            What the Phase 5 fanout queued and what the drainer cron is
            doing about it. Auto-refreshes every 15s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sinceHours}
            onChange={e => setSinceHours(Number(e.target.value))}
            className={selectCls}
          >
            {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Status counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        <Counter
          icon={<Clock className="w-4 h-4" />}
          label="Queued"
          value={counts.queued}
          tone="muted"
          onClick={() => setStatus('queued')}
        />
        <Counter
          icon={<Send className="w-4 h-4" />}
          label="Sending"
          value={counts.sending}
          tone="info"
          onClick={() => setStatus('sending')}
        />
        <Counter
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Delivered"
          value={counts.delivered}
          tone="success"
          onClick={() => setStatus('delivered')}
        />
        <Counter
          icon={<XCircle className="w-4 h-4" />}
          label="Failed"
          value={counts.failed}
          tone="danger"
          onClick={() => setStatus('failed')}
        />
        <Counter
          icon={<XCircle className="w-4 h-4" />}
          label="Expired"
          value={counts.expired}
          tone="muted"
          onClick={() => setStatus('expired')}
        />
      </div>

      {/* Delivery cost / receipts strip */}
      <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-900/10 px-4 py-3 mb-5 flex items-center gap-6 flex-wrap text-sm">
        <span className="text-indigo-700 dark:text-indigo-300 font-medium">
          Delivery in window
        </span>
        <span className="text-gray-700 dark:text-gray-300">
          ✓ {delivery.successCount} success
        </span>
        <span className="text-gray-700 dark:text-gray-300">
          ✗ {delivery.failureCount} failure
        </span>
        <span className="text-gray-700 dark:text-gray-300">
          ~ cost {delivery.totalCost.toFixed(2)}
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-gray-600 dark:text-gray-400">Status</span>
        {(['all','queued','sending','delivered','failed','expired'] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
              status === s
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-900 text-gray-700 border-gray-300 dark:border-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-3 text-gray-600 dark:text-gray-400">Channel</span>
        {(['', 'sms', 'email', 'push'] as ChannelFilter[]).map(c => (
          <button
            key={c || 'any'}
            onClick={() => setChannel(c)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
              channel === c
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-900 text-gray-700 border-gray-300 dark:border-gray-700'
            }`}
          >
            {c || 'any'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <Inbox className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            No outbox rows match the current filters.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Channel</th>
                <th className="px-3 py-2 text-left">Recipient</th>
                <th className="px-3 py-2 text-left">Policy</th>
                <th className="px-3 py-2 text-left">Body</th>
                <th className="px-3 py-2 text-left">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map(r => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-[12px] text-gray-600">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2"><StatusPill status={r.status} attempts={r.attempts} maxAttempts={r.max_attempts} /></td>
                  <td className="px-3 py-2"><ChannelPill channel={r.channel} /></td>
                  <td className="px-3 py-2 max-w-[180px] truncate" title={r.recipient_phone || r.recipient_email || ''}>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{r.recipient_name || '—'}</div>
                    <div className="text-[11px] text-gray-500 font-mono">
                      {r.recipient_phone || r.recipient_email || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[12px] text-gray-700 dark:text-gray-300">{r.policy_name || `policy ${r.policy_id}`}</td>
                  <td className="px-3 py-2 max-w-[280px]">
                    <span className="text-[12px] text-gray-700 dark:text-gray-300 line-clamp-2">{r.body}</span>
                  </td>
                  <td className="px-3 py-2 text-[12px] text-red-600 dark:text-red-400 max-w-[200px]">
                    <span className="line-clamp-2">{r.last_error || ''}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status, attempts, maxAttempts }: { status: OutboxRow['status']; attempts: number; maxAttempts: number }) {
  const tone = {
    queued:    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    sending:   'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    failed:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    expired:   'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }[status];
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${tone}`}>{status}</span>
      <span className="text-[10px] text-gray-500">{attempts}/{maxAttempts}</span>
    </div>
  );
}

function ChannelPill({ channel }: { channel: OutboxRow['channel'] }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
      {channel}
    </span>
  );
}

interface CounterProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'info' | 'muted';
  onClick: () => void;
}

function Counter({ icon, label, value, tone, onClick }: CounterProps) {
  const cls = {
    success: 'border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    danger:  'border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300',
    info:    'border-sky-200 dark:border-sky-900/40 text-sky-700 dark:text-sky-300',
    muted:   'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300',
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`text-left px-4 py-3 rounded-xl border bg-white dark:bg-gray-900 ${cls}`}
    >
      <div className="flex items-center gap-2 text-xs font-medium">{icon} {label}</div>
      <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{value}</div>
    </button>
  );
}

const selectCls =
  'px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800';
