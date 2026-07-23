/**
 * Daily absence finalization.
 *
 * evaluateDay() only writes a verdict for people it is triggered on — in
 * practice, those who PUNCHED. A no-show therefore produces no row at all, so
 * absence is invisible to every per-person query (leaderboards, profiles,
 * analytics, allowance). This module closes that gap: for a given school-local
 * date it runs evaluateDay for every EXPECTED person who has no verdict yet,
 * materialising the absent rows the engine would have produced.
 *
 * Idempotent: people who already have a record for the date are skipped, so
 * it is safe to run repeatedly (opportunistic sweep + end-of-day).
 *
 * Only finalises a past date, or today AFTER school hours — never a future
 * date, and never today before the day is effectively over (so we don't mark
 * people absent who simply haven't arrived yet).
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { evaluateDay } from '@/lib/attendance/engine';

/** School-local YYYY-MM-DD for "now". */
function localToday(offsetMin: number): string {
  return new Date(Date.now() + offsetMin * 60_000).toISOString().slice(0, 10);
}

export interface FinalizeResult { date: string; staff: number; students: number; skipped: boolean; }

export async function finalizeDay(schoolId: number, dateStr?: string, opts: { minHour?: number } = {}): Promise<FinalizeResult> {
  const off = (await resolveTimePolicy(schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
  const localNow = new Date(Date.now() + off * 60_000);
  const today = localToday(off);
  const date = dateStr || today;

  // Guard: never finalise the future; for today, wait until the day is
  // effectively over (default 17:00 school-local) so we don't mark
  // not-yet-arrived people absent.
  if (date > today) return { date, staff: 0, students: 0, skipped: true };
  if (date === today && localNow.getUTCHours() < (opts.minHour ?? 17)) {
    return { date, staff: 0, students: 0, skipped: true };
  }

  const holiday = ((await query(
    `SELECT 1 FROM holidays WHERE holiday_date = ? AND (school_id = ? OR school_id IS NULL) LIMIT 1`,
    [date, schoolId],
  ).catch(() => [])) as any[]).length > 0;
  if (holiday) return { date, staff: 0, students: 0, skipped: true };

  // Outage guard: if the WHOLE school produced (almost) no punches that day,
  // it is a device/ingest outage or a non-operating day — NOT everyone being
  // absent. Marking 200 people absent on a device-down day is worse than
  // leaving the day unfinalized (Recovery / Device Intelligence flag the
  // outage; Pattern Analytics' mass-absence detector would also catch it).
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const punchRows = (await query(
    `SELECT COUNT(*) n FROM attendance_raw_events WHERE school_id = ? AND punch_at >= ? AND punch_at < ?`,
    [schoolId, utcStart, utcEnd],
  ).catch(() => [{ n: 0 }])) as any[];
  if (Number(punchRows[0]?.n || 0) < 3) return { date, staff: 0, students: 0, skipped: true };

  const dateObj = new Date(`${date}T00:00:00`);

  // ── Expected staff without a verdict for the date ──
  const staffRows = (await query(
    `SELECT st.person_id
       FROM staff st
      WHERE st.school_id = ? AND st.deleted_at IS NULL
        AND (st.status IS NULL OR st.status NOT IN ('terminated','resigned','inactive'))
        AND st.person_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM attendance_records r
           WHERE r.school_id = st.school_id AND r.role_type = 'staff'
             AND r.person_id = st.person_id AND r.attendance_date = ?)`,
    [schoolId, date],
  ).catch(() => [])) as Array<{ person_id: number }>;

  let staff = 0;
  for (const s of staffRows) {
    try { await evaluateDay(schoolId, Number(s.person_id), 'staff', dateObj); staff++; } catch { /* per-person best-effort */ }
  }

  // ── Expected learners (actively enrolled) without a verdict ──
  const studentRows = (await query(
    `SELECT DISTINCT s.person_id
       FROM students s
       JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.person_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM attendance_records r
           WHERE r.school_id = s.school_id AND r.role_type = 'student'
             AND r.person_id = s.person_id AND r.attendance_date = ?)`,
    [schoolId, date],
  ).catch(() => [])) as Array<{ person_id: number }>;

  let students = 0;
  for (const s of studentRows) {
    try { await evaluateDay(schoolId, Number(s.person_id), 'student', dateObj); students++; } catch { /* best-effort */ }
  }

  return { date, staff, students, skipped: false };
}

/** Finalise the last N school-local days (backfill helper). */
export async function finalizeRecentDays(schoolId: number, days = 1): Promise<FinalizeResult[]> {
  const off = (await resolveTimePolicy(schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
  const out: FinalizeResult[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() + off * 60_000 - i * 86_400_000).toISOString().slice(0, 10);
    out.push(await finalizeDay(schoolId, d));
  }
  return out;
}
