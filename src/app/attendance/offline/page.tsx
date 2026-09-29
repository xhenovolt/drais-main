'use client';

/**
 * Offline Attendance — the first offline-attendance screen for DRAIS's
 * local-SQLite mode (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md
 * Phase 7, sub-effort 12).
 *
 * Deliberately NOT a port of /attendance/logs — that route is ~440 lines of
 * filters, sorting, pagination and live device/clock-health joins with no
 * offline equivalent. This is a smaller, separate screen: pick a date, see
 * who was present/late/absent/half-day/early-leave that day, and drill into
 * one person's recent daily statuses and raw punches. It shows attendance
 * already evaluated by the real online engine and carried into the local
 * file — it does not mark attendance (see index.ts's header for why: the
 * rule table this would need to compute a fresh status doesn't have a repo
 * yet, and guessing at "late after what time?" here would be exactly the
 * kind of rule this layer must never invent).
 *
 * Only reachable today by direct navigation — same as /students/offline,
 * the mode-switch UI still doesn't expose local-sqlite as selectable.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, WifiOff, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface OfflineAttendanceRow {
  id: number;
  personId: number;
  roleType: 'student' | 'staff';
  attendanceDate: string;
  firstInAt: string | null;
  lastOutAt: string | null;
  status: 'present' | 'late' | 'absent' | 'half_day' | 'early_leave' | 'holiday' | 'weekend';
  lateMinutes: number;
  earlyMinutes: number;
  totalMinutes: number;
  firstName: string;
  lastName: string;
  otherName: string | null;
}

interface OfflineAttendanceSummary {
  date: string; total: number; present: number; late: number; absent: number; halfDay: number; earlyLeave: number;
}

interface OfflinePersonAttendanceHistory {
  personId: number;
  firstName: string;
  lastName: string;
  otherName: string | null;
  days: OfflineAttendanceRow[];
  rawEvents: Array<{ id: number; punchAt: string; deviceSn: string; source: string; matched: boolean }>;
}

const STATUS_STYLE: Record<OfflineAttendanceRow['status'], string> = {
  present: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  late: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  absent: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  half_day: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  early_leave: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  holiday: 'bg-gray-100 dark:bg-slate-800 text-gray-500',
  weekend: 'bg-gray-100 dark:bg-slate-800 text-gray-500',
};

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new Error(body?.error?.message || `Request failed (${res.status})`);
  return body;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function friendlyTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const SUMMARY_TILES: Array<{ key: keyof OfflineAttendanceSummary; label: string }> = [
  { key: 'total', label: 'Total' }, { key: 'present', label: 'Present' }, { key: 'late', label: 'Late' },
  { key: 'absent', label: 'Absent' }, { key: 'halfDay', label: 'Half-day' }, { key: 'earlyLeave', label: 'Early leave' },
];

export default function OfflineAttendancePage() {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<OfflineAttendanceRow[]>([]);
  const [summary, setSummary] = useState<OfflineAttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPersonId, setOpenPersonId] = useState<number | null>(null);
  const [history, setHistory] = useState<OfflinePersonAttendanceHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ rows: OfflineAttendanceRow[]; summary: OfflineAttendanceSummary }>(
        `/api/attendance/offline?date=${date}`,
      );
      setRows(res.rows);
      setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const openHistory = async (personId: number) => {
    setOpenPersonId(personId);
    setHistoryLoading(true);
    setHistory(null);
    try {
      const from = shiftDate(date, -13);
      const res = await api<{ history: OfflinePersonAttendanceHistory }>(
        `/api/attendance/offline/person/${personId}?from=${from}&to=${date}`,
      );
      setHistory(res.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <WifiOff className="w-5 h-5 text-amber-500" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Attendance (Offline)</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
          Local SQLite
        </span>
        <button onClick={load} className="ml-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Shows attendance already evaluated online and carried into this local copy — it does not mark attendance
        yet. Filters, pagination and device details from the full online history page are not part of this screen.
      </p>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => setDate((d) => shiftDate(d, -1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100" />
        <button onClick={() => setDate((d) => shiftDate(d, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500">
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => setDate(todayIso())} className="text-xs text-indigo-600 dark:text-indigo-400 underline">Today</button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {SUMMARY_TILES.map((t) => (
            <div key={t.key} className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-center">
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{summary[t.key]}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-500 border-b border-gray-200 dark:border-slate-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">First in</th>
              <th className="px-3 py-2 text-left">Last out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {loading && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-12 text-center text-gray-400">No attendance evaluated for this date yet.</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/60" onClick={() => openHistory(r.personId)}>
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                  {r.firstName} {r.lastName}{r.otherName ? ` ${r.otherName}` : ''}
                </td>
                <td className="px-3 py-2 text-gray-500 capitalize">{r.roleType}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                    {r.status.replace('_', ' ')}{r.status === 'late' && r.lateMinutes > 0 ? ` (${r.lateMinutes}m)` : ''}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500">{friendlyTime(r.firstInAt)}</td>
                <td className="px-3 py-2 text-gray-500">{friendlyTime(r.lastOutAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openPersonId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setOpenPersonId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 max-w-lg w-full max-h-[80vh] overflow-y-auto p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                {history ? `${history.firstName} ${history.lastName}` : 'Loading…'} — last 14 days
              </h2>
              <button onClick={() => setOpenPersonId(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            {historyLoading && <div className="text-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
            {history && !historyLoading && (
              <>
                <div className="space-y-1">
                  {history.days.length === 0 && <p className="text-sm text-gray-400">No evaluated days in this range.</p>}
                  {history.days.map((d) => (
                    <div key={d.attendanceDate} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 dark:border-slate-800 last:border-0">
                      <span className="text-gray-500">{d.attendanceDate}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[d.status]}`}>{d.status.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-1">Raw punches</h3>
                  {history.rawEvents.length === 0 && <p className="text-sm text-gray-400">No punches in this range.</p>}
                  {history.rawEvents.map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-xs py-1 text-gray-500">
                      <span>{new Date(e.punchAt).toLocaleString()}</span>
                      <span className="font-mono">{e.deviceSn}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
