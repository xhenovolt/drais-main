/**
 * @drais/repo-mysql — AttendanceRuleRepo, MySQL/TiDB implementation.
 * Mirrors src/lib/attendance/engine.ts's loadActiveRule() selection
 * query exactly (role eligibility, boarding-scope specificity,
 * priority/id tie-break) — written fresh per §25a, not imported from
 * that online file. personIsBoarding is always treated as unresolved
 * (null) here: the offline students schema doesn't carry
 * residency_status yet, which — same as a staff person, or any student
 * online whose residency genuinely isn't resolved — means only
 * boarding_scope='all' rules are eligible. Correct, not a shortcut.
 */
import { query } from '@/lib/db';
import type { AttendanceRuleRepo } from '../contract/attendance-rule-repo';
import type { AttendanceRuleRecord } from '../contract/types';

interface RuleRow {
  id: number | string;
  school_id: number | string;
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
    id: Number(r.id), schoolId: Number(r.school_id),
    arrivalStartTime: r.arrival_start_time, arrivalEndTime: r.arrival_end_time,
    lateThresholdMinutes: r.late_threshold_minutes, absenceCutoffTime: r.absence_cutoff_time,
    closingTime: r.closing_time, departureStartTime: r.departure_start_time, departureEndTime: r.departure_end_time,
    earlyLeaveThresholdMinutes: r.early_leave_threshold_minutes, halfDayThresholdMinutes: r.half_day_threshold_minutes,
    weekdayMask: r.weekday_mask, appliesOnHolidays: Number(r.applies_on_holidays) === 1,
    boardingScope: r.boarding_scope, appliesTo: r.applies_to,
    ignoreDuplicateScansWithinMinutes: r.ignore_duplicate_scans_within_minutes,
  };
}

export function createMysqlAttendanceRuleRepo(): AttendanceRuleRepo {
  return {
    async findActiveForRole(schoolId, roleType) {
      const appliesTo = roleType === 'staff' ? "('teachers','all')" : "('students','all')";
      const rows = (await query(
        `SELECT id, school_id, arrival_start_time, arrival_end_time, late_threshold_minutes,
                absence_cutoff_time, closing_time, departure_start_time, departure_end_time,
                early_leave_threshold_minutes, half_day_threshold_minutes, weekday_mask,
                applies_on_holidays, boarding_scope, applies_to, ignore_duplicate_scans_within_minutes
           FROM attendance_rules
          WHERE school_id = ? AND is_active = 1 AND applies_to IN ${appliesTo}
            AND boarding_scope = 'all'
          ORDER BY (applies_to = 'all') ASC, priority ASC, id DESC
          LIMIT 1`,
        [schoolId],
      )) as RuleRow[];
      return rows.length ? toRecord(rows[0]) : null;
    },

    async listActiveBySchool(schoolId) {
      const rows = (await query(
        `SELECT id, school_id, arrival_start_time, arrival_end_time, late_threshold_minutes,
                absence_cutoff_time, closing_time, departure_start_time, departure_end_time,
                early_leave_threshold_minutes, half_day_threshold_minutes, weekday_mask,
                applies_on_holidays, boarding_scope, applies_to, ignore_duplicate_scans_within_minutes
           FROM attendance_rules WHERE school_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1000`,
        [schoolId],
      )) as RuleRow[];
      return rows.map(toRecord);
    },
  };
}
