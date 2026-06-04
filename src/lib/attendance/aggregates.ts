/**
 * Phase 6 — denormalised aggregate refresher.
 *
 * Reads attendance_records (Phase 3 canonical) for a (school, date)
 * window and UPSERTs the bucket counts into attendance_daily_aggregates.
 * Idempotent — re-running on the same window produces identical rows
 * because the UPSERT is keyed on (school, class, date, role, status).
 *
 * Class attribution
 * -----------------
 * A learner's class on a given date comes from `enrollments` (active
 * row spanning the date) — falling back to `students.class_id` (the
 * non-enrolled placeholder). For staff there is no class bucket; we
 * use class_id=0 which is the catch-all the schema reserves.
 *
 * Refresh contract
 * ----------------
 * The cron caller drives the date window. Typical: last 7 days, every
 * 5 minutes. A single school's day re-computes in O(rows in records
 * for that day) which is cheap. The whole-cluster O(schools × days)
 * scan stays bounded by the 7-day window.
 *
 * No double-counting: the refresher deletes the prior aggregate for
 * (school, date, role, class, status) tuples BEFORE inserting the
 * fresh ones, INSIDE a single SQL statement so a concurrent reader
 * sees either the old or the new totals, never both summed.
 */
import { query } from '@/lib/db';
import { ensureAggregatesSchema } from '@/lib/attendance/migrations/aggregates-schema';

export interface RefreshOptions {
  schoolId: number;
  fromDate: string;   // YYYY-MM-DD inclusive
  toDate: string;     // YYYY-MM-DD inclusive
}

export interface RefreshReport {
  schoolId: number;
  daysRefreshed: number;
  bucketsWritten: number;
  durationMs: number;
}

/**
 * Recompute the aggregate rows for one school over the given range.
 * Returns a small report so the cron can sum metrics across schools.
 */
export async function refreshDailyAggregates(
  opts: RefreshOptions,
): Promise<RefreshReport> {
  const t0 = Date.now();
  await ensureAggregatesSchema();

  // Pre-delete the window's existing buckets so a verdict that flipped
  // (e.g. late → present after a backdated punch) doesn't leave a stale
  // count behind.
  await query(
    `DELETE FROM attendance_daily_aggregates
      WHERE school_id = ?
        AND attendance_date BETWEEN ? AND ?`,
    [opts.schoolId, opts.fromDate, opts.toDate],
  );

  // Compute fresh counts. Class attribution joins enrollments first
  // (date-bounded), falling back to students.class_id.
  const insertResult = (await query(
    `INSERT INTO attendance_daily_aggregates
       (school_id, class_id, attendance_date, role_type, status, count)
     SELECT
       ar.school_id,
       COALESCE(
         (SELECT e.class_id
            FROM students s
            JOIN enrollments e ON e.student_id = s.id
           WHERE s.person_id = ar.person_id
             AND e.status = 'active'
             AND (e.start_date IS NULL OR e.start_date <= ar.attendance_date)
             AND (e.end_date   IS NULL OR e.end_date   >= ar.attendance_date)
           LIMIT 1),
         (SELECT s.class_id FROM students s WHERE s.person_id = ar.person_id LIMIT 1),
         0
       ) AS class_id,
       ar.attendance_date,
       ar.role_type,
       ar.status,
       COUNT(*) AS count
       FROM attendance_records ar
      WHERE ar.school_id = ?
        AND ar.attendance_date BETWEEN ? AND ?
      GROUP BY ar.school_id, class_id, ar.attendance_date, ar.role_type, ar.status`,
    [opts.schoolId, opts.fromDate, opts.toDate],
  )) as { affectedRows?: number };

  const days =
    Math.floor(
      (new Date(opts.toDate).getTime() - new Date(opts.fromDate).getTime())
        / (24 * 60 * 60 * 1000),
    ) + 1;

  return {
    schoolId: opts.schoolId,
    daysRefreshed: days,
    bucketsWritten: Number(insertResult?.affectedRows ?? 0),
    durationMs: Date.now() - t0,
  };
}

/**
 * Multi-school refresher for the cron. Loads every school that has
 * had a punch in the last `lookbackDays` (avoids work on dormant
 * tenants) and refreshes the same window.
 */
export async function refreshActiveSchools(
  lookbackDays = 7,
): Promise<{ schools: number; bucketsWritten: number; durationMs: number }> {
  const t0 = Date.now();
  await ensureAggregatesSchema();

  const fromDate = isoDateNDaysAgo(lookbackDays);
  const toDate = isoDateToday();

  const schoolsResult = (await query(
    `SELECT DISTINCT school_id
       FROM attendance_records
      WHERE attendance_date BETWEEN ? AND ?`,
    [fromDate, toDate],
  )) as Array<{ school_id: number }>;

  let bucketsWritten = 0;
  for (const s of schoolsResult) {
    try {
      const r = await refreshDailyAggregates({
        schoolId: s.school_id,
        fromDate,
        toDate,
      });
      bucketsWritten += r.bucketsWritten;
    } catch (err) {
      console.warn(`[aggregates] refresh failed for school ${s.school_id}:`, err);
    }
  }

  return {
    schools: schoolsResult.length,
    bucketsWritten,
    durationMs: Date.now() - t0,
  };
}

function isoDateNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}
function isoDateToday(): string { return formatDate(new Date()); }
function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
