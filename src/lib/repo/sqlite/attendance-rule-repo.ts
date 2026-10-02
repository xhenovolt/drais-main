/**
 * @drais/repo-sqlite — AttendanceRuleRepo, SQLite implementation.
 * Mirrors mysql/attendance-rule-repo.ts's contract exactly.
 */
import type { SqliteConnection } from './connection';
import type { AttendanceRuleRepo } from '../contract/attendance-rule-repo';
import type { AttendanceRuleRecord } from '../contract/types';

interface RuleRow {
  id: number;
  school_id: number;
  arrival_start_time: string | null;
  arrival_end_time: string | null;
  late_threshold_minutes: number;
  absence_cutoff_time: string | null;
  closing_time: string | null;
  departure_start_time: string | null;
  departure_end_time: string | null;
  early_leave_threshold_minutes: number;
  half_day_threshold_minutes: number;
  weekday_mask: number;
  applies_on_holidays: number;
  boarding_scope: AttendanceRuleRecord['boardingScope'];
  applies_to: AttendanceRuleRecord['appliesTo'];
  ignore_duplicate_scans_within_minutes: number;
}

function toRecord(r: RuleRow): AttendanceRuleRecord {
  return {
    id: r.id, schoolId: r.school_id,
    arrivalStartTime: r.arrival_start_time, arrivalEndTime: r.arrival_end_time,
    lateThresholdMinutes: r.late_threshold_minutes, absenceCutoffTime: r.absence_cutoff_time,
    closingTime: r.closing_time, departureStartTime: r.departure_start_time, departureEndTime: r.departure_end_time,
    earlyLeaveThresholdMinutes: r.early_leave_threshold_minutes, halfDayThresholdMinutes: r.half_day_threshold_minutes,
    weekdayMask: r.weekday_mask, appliesOnHolidays: r.applies_on_holidays === 1,
    boardingScope: r.boarding_scope, appliesTo: r.applies_to,
    ignoreDuplicateScansWithinMinutes: r.ignore_duplicate_scans_within_minutes,
  };
}

export function createSqliteAttendanceRuleRepo(db: SqliteConnection): AttendanceRuleRepo {
  return {
    async findActiveForRole(schoolId, roleType) {
      const appliesTo = roleType === 'staff' ? ['teachers', 'all'] : ['students', 'all'];
      const row = db.prepare(
        `SELECT id, school_id, arrival_start_time, arrival_end_time, late_threshold_minutes,
                absence_cutoff_time, closing_time, departure_start_time, departure_end_time,
                early_leave_threshold_minutes, half_day_threshold_minutes, weekday_mask,
                applies_on_holidays, boarding_scope, applies_to, ignore_duplicate_scans_within_minutes
           FROM attendance_rules
          WHERE school_id = ? AND is_active = 1 AND applies_to IN (?, ?)
            AND boarding_scope = 'all'
          ORDER BY (applies_to = 'all') ASC, priority ASC, id DESC
          LIMIT 1`,
      ).get(schoolId, appliesTo[0], appliesTo[1]) as RuleRow | undefined;
      return row ? toRecord(row) : null;
    },

    async listActiveBySchool(schoolId) {
      const rows = db.prepare(
        `SELECT id, school_id, arrival_start_time, arrival_end_time, late_threshold_minutes,
                absence_cutoff_time, closing_time, departure_start_time, departure_end_time,
                early_leave_threshold_minutes, half_day_threshold_minutes, weekday_mask,
                applies_on_holidays, boarding_scope, applies_to, ignore_duplicate_scans_within_minutes
           FROM attendance_rules WHERE school_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1000`,
      ).all(schoolId) as RuleRow[];
      return rows.map(toRecord);
    },
  };
}
