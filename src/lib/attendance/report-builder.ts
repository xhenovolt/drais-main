/**
 * Phase 6 — single report-builder reading the Phase 3 canonical state.
 *
 * Two flavours, one function each:
 *
 *   buildDetailReport(filter)     — one row per (person, date) verdict.
 *                                   Backs the export CSV + the per-
 *                                   learner drill-down UI. Joins people
 *                                   + students/staff + classes for
 *                                   human-readable fields.
 *
 *   buildAggregateReport(filter)  — bucket counts per
 *                                   (school, class, date, role, status).
 *                                   Backs dashboards. Reads
 *                                   attendance_daily_aggregates so it's
 *                                   constant-time at any school size.
 *                                   Falls through to live recomputation
 *                                   if the aggregate row is stale
 *                                   (last_refreshed older than
 *                                   STALENESS_THRESHOLD_MS).
 *
 * Every other report surface in DRAIS should call one of these. The
 * legacy routes (/api/attendance/reports, /api/attendance/zk/reports,
 * /api/attendance/unified, /api/attendance/export) will be replaced
 * with calls into this module in the Phase 6 cutover commit; this
 * commit is purely additive.
 */
import { query } from '@/lib/db';
import { ensureAggregatesSchema } from '@/lib/attendance/migrations/aggregates-schema';
import { refreshDailyAggregates } from '@/lib/attendance/aggregates';

const STALENESS_THRESHOLD_MS = 10 * 60 * 1000; // 10 min

export type AttendanceStatus =
  | 'present' | 'late' | 'absent' | 'half_day'
  | 'early_leave' | 'holiday' | 'weekend';

export interface ReportFilter {
  schoolId: number;
  fromDate: string;    // YYYY-MM-DD
  toDate:   string;
  roleType?: 'student' | 'staff';
  classIds?: number[];
  statusIn?: AttendanceStatus[];
  /** Default 5000. Hard ceiling at 50000 to defend the API. */
  limit?: number;
}

export interface DetailRow {
  attendance_date: string;
  person_id: number;
  role_type: 'student' | 'staff';
  status: AttendanceStatus;
  first_in_at: string | null;
  last_out_at: string | null;
  late_minutes: number;
  early_minutes: number;
  total_minutes: number;
  first_in_device: string | null;
  last_out_device: string | null;
  // Joined display fields
  first_name: string | null;
  last_name: string | null;
  admission_no: string | null;
  class_id: number | null;
  class_name: string | null;
}

export interface AggregateBucket {
  attendance_date: string;
  class_id: number;
  class_name: string | null;
  role_type: 'student' | 'staff';
  status: AttendanceStatus;
  count: number;
}

// ── Detail report ─────────────────────────────────────────────────────

export async function buildDetailReport(filter: ReportFilter): Promise<DetailRow[]> {
  const limit = Math.min(Math.max(filter.limit ?? 5000, 1), 50_000);

  const where: string[] = [
    'ar.school_id = ?',
    'ar.attendance_date BETWEEN ? AND ?',
  ];
  const params: unknown[] = [filter.schoolId, filter.fromDate, filter.toDate];

  if (filter.roleType) {
    where.push('ar.role_type = ?');
    params.push(filter.roleType);
  }
  if (filter.statusIn && filter.statusIn.length > 0) {
    where.push(`ar.status IN (${filter.statusIn.map(() => '?').join(',')})`);
    params.push(...filter.statusIn);
  }
  if (filter.classIds && filter.classIds.length > 0) {
    where.push(
      `EXISTS (
         SELECT 1 FROM students s
          WHERE s.person_id = ar.person_id
            AND s.class_id IN (${filter.classIds.map(() => '?').join(',')})
       )`,
    );
    params.push(...filter.classIds);
  }

  const rows = (await query(
    `SELECT
       ar.attendance_date, ar.person_id, ar.role_type, ar.status,
       ar.first_in_at, ar.last_out_at,
       ar.late_minutes, ar.early_minutes, ar.total_minutes,
       ar.first_in_device, ar.last_out_device,
       p.first_name, p.last_name,
       s.admission_no, s.class_id,
       c.name AS class_name
       FROM attendance_records ar
       LEFT JOIN people   p ON p.id = ar.person_id
       LEFT JOIN students s ON s.person_id = ar.person_id
       LEFT JOIN classes  c ON c.id = s.class_id
      WHERE ${where.join(' AND ')}
      ORDER BY ar.attendance_date DESC, ar.person_id
      LIMIT ${limit}`,
    params,
  )) as DetailRow[];

  return rows;
}

// ── Aggregate report ──────────────────────────────────────────────────

export async function buildAggregateReport(filter: ReportFilter): Promise<AggregateBucket[]> {
  await ensureAggregatesSchema();

  // Check freshness for the requested window. If any (school, date)
  // is stale or missing, trigger a synchronous refresh BEFORE reading.
  // The refresh is bounded by the requested window size; small for
  // typical 1-7 day reports.
  if (await isWindowStale(filter)) {
    try {
      await refreshDailyAggregates({
        schoolId: filter.schoolId,
        fromDate: filter.fromDate,
        toDate: filter.toDate,
      });
    } catch (err) {
      console.warn('[report-builder] inline refresh failed:', err);
    }
  }

  const where: string[] = [
    'agg.school_id = ?',
    'agg.attendance_date BETWEEN ? AND ?',
  ];
  const params: unknown[] = [filter.schoolId, filter.fromDate, filter.toDate];

  if (filter.roleType) {
    where.push('agg.role_type = ?');
    params.push(filter.roleType);
  }
  if (filter.statusIn && filter.statusIn.length > 0) {
    where.push(`agg.status IN (${filter.statusIn.map(() => '?').join(',')})`);
    params.push(...filter.statusIn);
  }
  if (filter.classIds && filter.classIds.length > 0) {
    where.push(`agg.class_id IN (${filter.classIds.map(() => '?').join(',')})`);
    params.push(...filter.classIds);
  }

  const rows = (await query(
    `SELECT
       agg.attendance_date,
       agg.class_id,
       c.name AS class_name,
       agg.role_type,
       agg.status,
       agg.count
       FROM attendance_daily_aggregates agg
       LEFT JOIN classes c ON c.id = agg.class_id
      WHERE ${where.join(' AND ')}
      ORDER BY agg.attendance_date DESC, agg.class_id, agg.status`,
    params,
  )) as AggregateBucket[];

  return rows;
}

async function isWindowStale(filter: ReportFilter): Promise<boolean> {
  try {
    const r = (await query(
      `SELECT MIN(last_refreshed) AS oldest
         FROM attendance_daily_aggregates
        WHERE school_id = ?
          AND attendance_date BETWEEN ? AND ?`,
      [filter.schoolId, filter.fromDate, filter.toDate],
    )) as Array<{ oldest: string | Date | null }>;
    const oldest = r[0]?.oldest;
    if (!oldest) return true; // no rows yet for the window
    const age = Date.now() - new Date(oldest).getTime();
    return age > STALENESS_THRESHOLD_MS;
  } catch {
    return true; // safest is to refresh on error
  }
}
