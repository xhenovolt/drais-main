'use client';

/**
 * /admin/device-alerts — operator surface for Phase 2's device_alerts.
 *
 * The cron sweeper has been emitting rows here since Phase 2 shipped;
 * this page is the missing UI handle so ops can see them and ack
 * resolved ones.  Auto-refreshes every 30 s so a critical alert
 * doesn't sit unseen.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle, AlertCircle, Info, Check, Loader2, Filter, Cpu,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Alert {
  id: number;
  device_sn: string;
  school_id: number | null;
  severity: 'info' | 'warning' | 'critical';
  code: string;
  message: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  device_name: string | null;
  location: string | null;
}

type StatusFilter = 'open' | 'acked' | 'all';
type SeverityFilter = '' | 'info' | 'warning' | 'critical';

export default function DeviceAlertsPage() {
  const [status, setStatus] = useState<StatusFilter>('open');
  const [severity, setSeverity] = useState<SeverityFilter>('');
  const qs = new URLSearchParams();
  qs.set('status', status);
  if (severity) qs.set('severity', severity);

  const { data, mutate, isLoading } = useSWR<{
    alerts: Alert[];
    openCounts: { info: number; warning: number; critical: number };
  }>(`/api/admin/device-alerts?${qs.toString()}`, fetcher, {
    refreshInterval: 30_000,
  });
  const alerts = data?.alerts ?? [];
  const counts = data?.openCounts ?? { info: 0, warning: 0, critical: 0 };

  const ack = async (a: Alert) => {
    try {
      const r = await fetch(`/api/admin/device-alerts/${a.id}/ack`, { method: 'PATCH' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Ack failed');
      toast.success('Alert acknowledged');
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ack failed');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            Device Alerts
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Operational events emitted by the device health sweeper.
            Acknowledge once you have investigated; the alert stays in
            history but stops counting against open totals.
          </p>
        </div>
      </div>

      {/* Severity counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Counter
          icon={<AlertCircle className="w-4 h-4" />}
          label="Critical"
          value={counts.critical}
          tone="critical"
          onClick={() => setSeverity('critical')}
        />
        <Counter
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Warning"
          value={counts.warning}
          tone="warning"
          onClick={() => setSeverity('warning')}
        />
        <Counter
          icon={<Info className="w-4 h-4" />}
          label="Info"
          value={counts.info}
          tone="info"
          onClick={() => setSeverity('info')}
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3 text-sm">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-gray-600 dark:text-gray-400">Status</span>
        {(['open','acked','all'] as StatusFilter[]).map(s => (
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
        {severity && (
          <button
            onClick={() => setSeverity('')}
            className="ml-2 text-xs text-gray-500 underline"
          >
            clear severity filter ({severity})
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <Cpu className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600">
            {status === 'open'
              ? 'No open alerts. All devices are quiet.'
              : 'No alerts match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
          {alerts.map(a => (
            <div key={a.id} className="p-3 flex items-start gap-3">
              <SeverityBadge severity={a.severity} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {a.device_name || a.device_sn}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {a.code}
                  </span>
                  {a.location && (
                    <span className="text-[10px] text-gray-500">@{a.location}</span>
                  )}
                </div>
                {a.message && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{a.message}</p>
                )}
                <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-3">
                  <span>opened {new Date(a.created_at).toLocaleString()}</span>
                  {a.acknowledged_at && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      acked {new Date(a.acknowledged_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              {!a.acknowledged_at && (
                <button
                  onClick={() => ack(a)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Check className="w-3.5 h-3.5" /> Ack
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Alert['severity'] }) {
  const map = {
    critical: { Icon: AlertCircle, cls: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-300' },
    warning:  { Icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300' },
    info:     { Icon: Info, cls: 'text-sky-600 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-300' },
  } as const;
  const { Icon, cls } = map[severity];
  return (
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
      <Icon className="w-4 h-4" />
    </div>
  );
}

interface CounterProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'critical' | 'warning' | 'info';
  onClick: () => void;
}

function Counter({ icon, label, value, tone, onClick }: CounterProps) {
  const cls = {
    critical: 'border-red-200 dark:border-red-900/40 hover:bg-red-50/50 dark:hover:bg-red-900/10 text-red-700 dark:text-red-300',
    warning:  'border-amber-200 dark:border-amber-900/40 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 text-amber-700 dark:text-amber-300',
    info:     'border-sky-200 dark:border-sky-900/40 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 text-sky-700 dark:text-sky-300',
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`text-left px-4 py-3 rounded-xl border bg-white dark:bg-gray-900 transition-colors ${cls}`}
    >
      <div className="flex items-center gap-2 text-xs font-medium">{icon} {label} (open)</div>
      <div className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{value}</div>
    </button>
  );
}
