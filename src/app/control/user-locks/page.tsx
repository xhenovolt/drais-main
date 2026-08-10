'use client';

/**
 * Control Center — locked school accounts (Phase 2).
 *
 * The administrative counterpart to the login lockout. Without this screen a
 * cooldown could only be waited out, and a bursar locked out on results
 * morning becomes a phone call to the founder — the dependency this programme
 * exists to remove.
 *
 * Shows anyone currently locked AND anyone accumulating failures inside the
 * window, because a run of failures on one account is the signal that matters:
 * it is what a credential attack looks like before it succeeds.
 */
import React, { useCallback, useState } from 'react';
import useSWR from 'swr';
import { Lock, Unlock, Loader2, ShieldAlert, RefreshCw } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

interface Row {
  id: number;
  email: string;
  name: string;
  school_id: number | null;
  school_name: string | null;
  status: string;
  failed_attempts: number;
  locked_until: string | null;
  last_failed_login_at: string | null;
  last_login_at: string | null;
  is_locked: boolean;
  retry_after_sec: number;
}

const when = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');

function countdown(sec: number): string {
  if (sec <= 0) return 'expired';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m}m ${sec % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function ControlUserLocks() {
  const { data, mutate, isLoading } = useSWR<any>('/api/control-center/school-users/locks', fetcher, {
    refreshInterval: 30_000,
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const act = useCallback(
    async (userId: number, action: 'unlock' | 'lock') => {
      // prompt() returns null on cancel and '' on an empty OK — they mean
      // different things, so the null check must happen BEFORE any coalescing.
      const raw = window.prompt(
        action === 'lock'
          ? 'Reason for locking this account (recorded in the audit log):'
          : 'Reason for unlocking (recorded in the audit log):',
      );
      if (raw === null) return; // cancelled
      const reason = raw.trim();

      setBusy(userId);
      setMsg(null);
      try {
        const r = await fetch('/api/control-center/school-users/locks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId, action, reason, minutes: 60 }),
        });
        const j = await r.json();
        setMsg(r.ok ? (action === 'unlock' ? 'Account unlocked' : 'Account locked for 60 minutes') : j.error || 'Failed');
        if (r.ok) mutate();
      } catch {
        setMsg('Request failed');
      } finally {
        setBusy(null);
      }
    },
    [mutate],
  );

  const rows: Row[] = data?.rows ?? [];
  const locked = rows.filter((r) => r.is_locked);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" /> Locked school accounts
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Locks expire on their own — they are cooldowns, not permanent bars. Unlock here when a member of
              staff needs back in immediately.
            </p>
          </div>
          <button
            onClick={() => mutate()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs flex items-center gap-1.5 hover:bg-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="flex gap-4 mt-3 text-xs">
          <span className="text-slate-400">
            Currently locked: <strong className="text-amber-300">{locked.length}</strong>
          </span>
          <span className="text-slate-400">
            With recent failures: <strong className="text-slate-200">{rows.length - locked.length}</strong>
          </span>
          {data?.windowMinutes ? (
            <span className="text-slate-500">Window: {data.windowMinutes} min</span>
          ) : null}
        </div>
      </div>

      {msg && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200">{msg}</div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 bg-slate-950/60">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">School</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2 text-right">Failures</th>
                <th className="px-3 py-2">Last failed</th>
                <th className="px-3 py-2">Last login</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
                  </td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    No locked accounts and no recent failed sign-ins. Nothing needs attention.
                  </td>
                </tr>
              )}

              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">
                    <div className="text-slate-200">{r.name || '—'}</div>
                    <div className="text-xs text-slate-500">{r.email}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {r.school_name || (r.school_id ? `#${r.school_id}` : '—')}
                  </td>
                  <td className="px-3 py-2">
                    {r.is_locked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        <Lock className="w-3 h-3" /> Locked · {countdown(r.retry_after_sec)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-400 border border-slate-700">
                        Failing
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-300">{r.failed_attempts}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{when(r.last_failed_login_at)}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{when(r.last_login_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      {r.is_locked ? (
                        <button
                          disabled={busy === r.id}
                          onClick={() => act(r.id, 'unlock')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-xs flex items-center gap-1 disabled:opacity-50"
                        >
                          {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlock className="w-3 h-3" />}
                          Unlock
                        </button>
                      ) : (
                        <button
                          disabled={busy === r.id}
                          onClick={() => act(r.id, 'lock')}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 disabled:opacity-50"
                        >
                          {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                          Lock
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Every lock and unlock is written to the Control Center audit log with the operator, the reason and the
        origin IP.
      </p>
    </div>
  );
}
