/**
 * Historical Repair (Founder-Independence Phase E).
 *
 * The last script-only workflow: when a PAST span of attendance is wrong (a
 * verdict that predates a correction, a fixed clock, a re-attribution), the
 * fix used to be a founder-run re-evaluation script. This makes it a bounded,
 * audited, self-service action: "re-evaluate attendance for these dates".
 *
 * It is SAFE by construction — it only rebuilds verdicts from the immutable
 * raw events (the source of truth) via the same evaluateDay the live pipeline
 * uses. It never edits raw events and is idempotent (re-running changes
 * nothing if already correct).
 *
 * planRange() is PURE and unit-tested (validation + day cap).
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';

const MAX_DAYS = 92; // one term — bound the work

export interface RangePlan { ok: boolean; reason?: string; from?: string; to?: string; days?: number; }

/** PURE: validate + bound a date range. */
export function planRange(fromStr: string, toStr: string): RangePlan {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(fromStr) || !iso.test(toStr)) return { ok: false, reason: 'Dates must be YYYY-MM-DD' };
  let from = fromStr, to = toStr;
  if (from > to) { const t = from; from = to; to = t; } // tolerate reversed
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days < 1) return { ok: false, reason: 'Empty range' };
  if (days > MAX_DAYS) return { ok: false, reason: `Range too large (${days} days; max ${MAX_DAYS}). Repair in smaller spans.` };
  const today = new Date().toISOString().slice(0, 10);
  if (from > today) return { ok: false, reason: 'Cannot repair a future date' };
  return { ok: true, from, to, days };
}

export interface RepairResult { ok: boolean; reason?: string; from: string; to: string; personDays: number; reevaluated: number; }

/**
 * Re-evaluate every (person, date) that has punches in the range — rebuilding
 * verdicts from raw events. Optional role/person filter. Bounded.
 */
export async function reevaluateRange(args: {
  schoolId: number; from: string; to: string; role?: 'staff' | 'student' | null; personId?: number | null;
}): Promise<RepairResult> {
  const plan = planRange(args.from, args.to);
  if (!plan.ok) return { ok: false, reason: plan.reason, from: args.from, to: args.to, personDays: 0, reevaluated: 0 };

  const off = (await resolveTimePolicy(args.schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
  const utcStart = new Date(Date.parse(`${plan.from}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(Date.parse(`${plan.to}T00:00:00Z`) - off * 60_000 + 86_400_000);

  const cond = ['school_id = ?', 'punch_at >= ?', 'punch_at < ?', 'person_id IS NOT NULL', 'role_type IS NOT NULL'];
  const params: any[] = [args.schoolId, utcStart, utcEnd];
  if (args.role) { cond.push('role_type = ?'); params.push(args.role); }
  if (args.personId) { cond.push('person_id = ?'); params.push(args.personId); }

  // Distinct (person, role, local date) with punches in the window.
  const rows = (await query(
    `SELECT DISTINCT person_id, role_type,
            DATE(DATE_ADD(punch_at, INTERVAL ? MINUTE)) AS local_date
       FROM attendance_raw_events
      WHERE ${cond.join(' AND ')}`,
    [off, ...params],
  ).catch(() => [])) as any[];

  const { evaluateDay } = await import('@/lib/attendance/engine');
  let n = 0;
  for (const r of rows) {
    try { await evaluateDay(args.schoolId, Number(r.person_id), r.role_type, new Date(`${String(r.local_date).slice(0, 10)}T00:00:00`)); n++; }
    catch { /* per-day best-effort */ }
  }
  return { ok: true, from: plan.from!, to: plan.to!, personDays: rows.length, reevaluated: n };
}
