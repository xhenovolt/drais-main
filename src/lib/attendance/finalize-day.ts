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
 * Only finalises a past date, or today once the school's absence cutoff has
 * passed — never a future date, and never today before that cutoff (so we
 * don't mark people absent who simply haven't arrived yet). The cutoff is the
 * one the school configured on its attendance rules (absence_cutoff_time),
 * per role; 17:00 only when no rule sets one. It used to be a hardcoded
 * 17:00 for everyone, which is why Nakifuma's "absent" SMS — configured for
 * 10:00 — went out in the evening.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { evaluateDay } from '@/lib/attendance/engine';

/** School-local YYYY-MM-DD for "now". */
function localToday(offsetMin: number): string {
  return new Date(Date.now() + offsetMin * 60_000).toISOString().slice(0, 10);
}

export interface FinalizeResult { date: string; staff: number; students: number; skipped: boolean; }

/** Fallback cutoff (minutes after school-local midnight) when no rule sets absence_cutoff_time. */
const DEFAULT_CUTOFF_MIN = 17 * 60;

const toMinutes = (t: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Today's absence cutoff per role, from the school's active attendance rules.
 * The LATEST cutoff among the rules that can apply to a role wins, so nobody
 * covered by a later-cutoff rule is marked absent early.
 */
export async function absenceCutoffs(schoolId: number): Promise<{ student: number; staff: number }> {
  const rows = (await query(
    `SELECT applies_to, absence_cutoff_time FROM attendance_rules
      WHERE school_id = ? AND is_active = 1 AND absence_cutoff_time IS NOT NULL`,
    [schoolId],
  ).catch(() => [])) as Array<{ applies_to: string; absence_cutoff_time: string }>;
  const pick = (role: string) => {
    const mins = rows.filter((r) => r.applies_to === 'all' || r.applies_to === role)
      .map((r) => toMinutes(r.absence_cutoff_time)).filter((m): m is number => m != null);
    return mins.length ? Math.max(...mins) : DEFAULT_CUTOFF_MIN;
  };
  return { student: pick('students'), staff: pick('staff') };
}

export async function finalizeDay(schoolId: number, dateStr?: string, opts: { minHour?: number } = {}): Promise<FinalizeResult> {
  const off = (await resolveTimePolicy(schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
  const localNow = new Date(Date.now() + off * 60_000);
  const today = localToday(off);
  const date = dateStr || today;

  // Guard: never finalise the future; for today, wait until the role's
  // absence cutoff (school-local) so we don't mark not-yet-arrived people
  // absent. opts.minHour overrides the configured cutoff for both roles.
  if (date > today) return { date, staff: 0, students: 0, skipped: true };
  let staffDue = true;
  let studentsDue = true;
  if (date === today) {
    const nowMin = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
    const cut = opts.minHour != null
      ? { student: opts.minHour * 60, staff: opts.minHour * 60 }
      : await absenceCutoffs(schoolId);
    studentsDue = nowMin >= cut.student;
    staffDue = nowMin >= cut.staff;
    if (!studentsDue && !staffDue) return { date, staff: 0, students: 0, skipped: true };
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
  if (!staffDue) staffRows.length = 0;

  let staff = 0;
  for (const s of staffRows) {
    try { await evaluateDay(schoolId, Number(s.person_id), 'staff', dateObj); staff++; } catch { /* per-person best-effort */ }
  }

  // ── Expected learners (active roster) without a verdict ──
  // Gating on enrollments.status='active' (rather than students.status)
  // silently dropped anyone whose enrollment row was mid-rollover — at
  // Nakifuma, a class-promotion in progress had already closed 521 of 527
  // enrollment rows while the students themselves were still s.status=
  // 'active', so this sweep would materialise absences for only 6 people
  // and leave everyone else with NO row at all for the day (invisible,
  // not "present" — the missing-population bug). Any (non-deleted)
  // enrollment row is still required so a never-enrolled draft record is
  // not swept in.
  const studentRows = (await query(
    `SELECT DISTINCT s.person_id
       FROM students s
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.person_id IS NOT NULL
        AND s.status = 'active'
        AND EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.deleted_at IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM attendance_records r
           WHERE r.school_id = s.school_id AND r.role_type = 'student'
             AND r.person_id = s.person_id AND r.attendance_date = ?)`,
    [schoolId, date],
  ).catch(() => [])) as Array<{ person_id: number }>;
  if (!studentsDue) studentRows.length = 0;

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

// ── Heartbeat-driven "finalize today at the cutoff" ──
// The only scheduled job runs once a day (06:00 UTC), before most schools'
// cutoffs, so without this today's absences were only materialised when
// someone happened to open an intelligence page — often in the evening.
// Device heartbeats arrive every ~30-60s, so they serve as the clock:
// checked at most every 5 minutes per school per process, and once today
// has been finalised for a school it is not repeated in this process.
const FINALIZE_CHECK_MS = 5 * 60 * 1000;
const lastFinalizeCheck = new Map<number, number>();
const finalizedOn = new Map<number, string>();

export async function finalizeTodayWhenDue(schoolId: number): Promise<void> {
  const now = Date.now();
  if (now - (lastFinalizeCheck.get(schoolId) || 0) < FINALIZE_CHECK_MS) return;
  lastFinalizeCheck.set(schoolId, now);
  const off = (await resolveTimePolicy(schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
  const today = localToday(off);
  if (finalizedOn.get(schoolId) === today) return;
  const localNow = new Date(now + off * 60_000);
  const nowMin = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
  const cut = await absenceCutoffs(schoolId);
  if (nowMin < Math.min(cut.student, cut.staff)) return;
  const r = await finalizeDay(schoolId, today);
  // Done for the day only once every role's cutoff has passed and the day
  // was actually finalised (an outage-guarded skip retries on a later beat).
  if (!r.skipped && nowMin >= Math.max(cut.student, cut.staff)) finalizedOn.set(schoolId, today);
  if (r.students + r.staff > 0) {
    // The absent verdicts just queued their parent SMS — send them now
    // rather than waiting for the next heartbeat drain.
    const { drainNotificationOutbox } = await import('@/lib/notifications/drain');
    await drainNotificationOutbox().catch(() => undefined);
  }
}
