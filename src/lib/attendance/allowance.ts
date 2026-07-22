/**
 * Allowance Eligibility Report — "who gets allowance today?"
 *
 * At JIPRA (and other schools) daily staff allowance is decided from
 * arrival time vs the school's attendance rule. This module turns the
 * engine's ALREADY-PERSISTED day verdicts (attendance_records — written
 * by evaluateDay, the single source of attendance truth) into a
 * payment-ready report. It never re-implements lateness math: `late`
 * comes from the engine (arrival_end_time + late_threshold_minutes from
 * the school's own attendance_rules / staff shifts).
 *
 * Classification on top of the verdict:
 *   EARLY            arrived before the rule's arrival_end_time
 *   ON_TIME          arrived at/after arrival_end but within grace
 *   LATE             engine verdict says late
 *   ABSENT           active staff with no attendance record for the day
 *   (+ checkoutMissing flag when no departure was recorded)
 *
 * Allowance: EARLY / ON_TIME → YES, LATE / ABSENT → NO.
 */
import { query } from '@/lib/db';
import { AttendanceFormatter } from '@/lib/attendance/export/AttendanceFormatter';
import { loadOverridesForRules } from '@/lib/attendance/day-overrides';

export type ArrivalStatus = 'EARLY' | 'ON_TIME' | 'LATE' | 'ABSENT';

export interface AllowanceRow {
  staffId: number;
  personId: number | null;
  name: string;
  designation: string | null;
  department: string | null;
  arrival: string | null;      // formatted school-local, 12h
  departure: string | null;    // formatted school-local, 12h
  arrivalStatus: ArrivalStatus;
  checkoutMissing: boolean;
  lateMinutes: number;
  allowance: boolean;
  engineStatus: string | null; // raw verdict for audit (present/late/half_day/…)
}

export interface AllowanceReport {
  date: string;                // YYYY-MM-DD (school-local)
  rows: AllowanceRow[];
  summary: {
    staff: number;
    eligible: number;
    late: number;
    absent: number;
    checkoutMissing: number;
  };
}

/** Pure classification — exported for tests. */
export function classifyArrival(args: {
  engineStatus: string | null;   // attendance_records.status, null = no record
  firstInAt: Date | null;
  lastOutAt: Date | null;
  /** rule's arrival_end_time as "HH:MM:SS" (school-local), null if unknown */
  arrivalEndTime: string | null;
  /** school-local date "YYYY-MM-DD" + tz offset minutes to place arrivalEnd */
  date: string;
  tzOffsetMinutes: number;
}): { arrivalStatus: ArrivalStatus; checkoutMissing: boolean; allowance: boolean } {
  const { engineStatus, firstInAt, lastOutAt } = args;
  if (!engineStatus || engineStatus === 'absent' || !firstInAt) {
    return { arrivalStatus: 'ABSENT', checkoutMissing: false, allowance: false };
  }
  if (engineStatus === 'late') {
    return { arrivalStatus: 'LATE', checkoutMissing: !lastOutAt, allowance: false };
  }
  // present / half_day / early_leave / holiday / weekend with a punch →
  // arrival-side classification vs the rule boundary.
  let arrivalStatus: ArrivalStatus = 'ON_TIME';
  if (args.arrivalEndTime) {
    const boundaryMs = Date.parse(`${args.date}T${args.arrivalEndTime}Z`) - args.tzOffsetMinutes * 60_000;
    if (Number.isFinite(boundaryMs) && firstInAt.getTime() < boundaryMs) arrivalStatus = 'EARLY';
  } else {
    arrivalStatus = 'EARLY'; // no configured boundary — arriving at all is early/on-time
  }
  return { arrivalStatus, checkoutMissing: !lastOutAt, allowance: true };
}

export async function buildAllowanceReport(
  schoolId: number,
  date: string, // YYYY-MM-DD school-local
): Promise<AllowanceReport> {
  const formatter = await AttendanceFormatter.forSchool(schoolId);
  const dayStartUtc = formatter.toUtcBoundary(date, 'start');
  const dayEndUtc = formatter.toUtcBoundary(date, 'end');
  // Recover the school offset from the boundary itself (start boundary is
  // local midnight): offset = localMidnightAsUtc − boundary.
  const tzOffsetMinutes = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dayStartUtc.replace(' ', 'T')}Z`)) / 60_000,
  );

  // All active staff — the report must show ABSENT people, so staff is
  // the driving table, records are LEFT-joined.
  const rows = (await query(
    `SELECT st.id AS staff_id, st.person_id, st.position,
            TRIM(CONCAT_WS(' ', p.first_name, p.other_name, p.last_name)) AS name,
            d.name AS department,
            rec.status AS engine_status, rec.first_in_at, rec.last_out_at,
            rec.late_minutes, rec.rule_id AS rule_id,
            r.arrival_end_time
       FROM staff st
       JOIN people p ON p.id = st.person_id
       LEFT JOIN departments d ON d.id = st.department_id
       LEFT JOIN attendance_records rec
         ON rec.school_id = st.school_id
        AND rec.role_type = 'staff'
        AND rec.person_id = st.person_id
        AND rec.attendance_date >= ? AND rec.attendance_date <= ?
       LEFT JOIN attendance_rules r ON r.id = rec.rule_id
      WHERE st.school_id = ?
        AND st.deleted_at IS NULL AND p.deleted_at IS NULL
        AND (st.status IS NULL OR st.status NOT IN ('terminated','resigned','inactive'))
      ORDER BY name ASC`,
    [dayStartUtc, dayEndUtc, schoolId],
  )) as Array<{
    staff_id: number; person_id: number | null; position: string | null;
    name: string; department: string | null;
    engine_status: string | null;
    first_in_at: Date | string | null; last_out_at: Date | string | null;
    late_minutes: number | null; rule_id: number | null;
    arrival_end_time: string | null;
  }>;

  // Per-weekday override of arrival_end_time for this report date (e.g.
  // "Saturday arrival ends 10:00") — same layer the engine applies.
  const overrides = await loadOverridesForRules(
    rows.map(r => Number(r.rule_id)).filter(n => Number.isFinite(n) && n > 0),
    date,
  );

  const toDate = (v: Date | string | null): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const out: AllowanceRow[] = rows.map(r => {
    const firstInAt = toDate(r.first_in_at);
    const lastOutAt = toDate(r.last_out_at);
    const cls = classifyArrival({
      engineStatus: r.engine_status,
      firstInAt, lastOutAt,
      arrivalEndTime: (() => {
        const ov = r.rule_id != null ? overrides.get(Number(r.rule_id)) : undefined;
        const t = ov?.arrival_end_time ?? r.arrival_end_time;
        return t ? String(t) : null;
      })(),
      date, tzOffsetMinutes,
    });
    return {
      staffId: Number(r.staff_id),
      personId: r.person_id == null ? null : Number(r.person_id),
      name: r.name,
      designation: r.position ?? null,
      department: r.department ?? null,
      arrival: firstInAt ? formatter.formatTime(firstInAt) : null,
      departure: lastOutAt ? formatter.formatTime(lastOutAt) : null,
      arrivalStatus: cls.arrivalStatus,
      checkoutMissing: cls.checkoutMissing,
      lateMinutes: Number(r.late_minutes ?? 0),
      allowance: cls.allowance,
      engineStatus: r.engine_status,
    };
  });

  // Payment-decision ordering: eligible first (early → on-time), then
  // late (most late last), then absent — the director reads top-down.
  const orderKey = (r: AllowanceRow) =>
    r.arrivalStatus === 'EARLY' ? 0 : r.arrivalStatus === 'ON_TIME' ? 1 : r.arrivalStatus === 'LATE' ? 2 : 3;
  out.sort((a, b) => orderKey(a) - orderKey(b) || a.lateMinutes - b.lateMinutes || a.name.localeCompare(b.name));

  return {
    date,
    rows: out,
    summary: {
      staff: out.length,
      eligible: out.filter(r => r.allowance).length,
      late: out.filter(r => r.arrivalStatus === 'LATE').length,
      absent: out.filter(r => r.arrivalStatus === 'ABSENT').length,
      checkoutMissing: out.filter(r => r.checkoutMissing && r.arrivalStatus !== 'ABSENT').length,
    },
  };
}
