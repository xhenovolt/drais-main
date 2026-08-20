/**
 * @drais/repo-mysql — AttendanceRecordRepo, MySQL/TiDB implementation.
 * upsert() uses ON DUPLICATE KEY UPDATE against the real table's own
 * uk_person_day unique key — matching how the real evaluator recomputes
 * and replaces a day's summary, not an ordinary create/update pair.
 */
import { query } from '@/lib/db';
import type { AttendanceRecordRepo } from '../contract/attendance-record-repo';
import type { AttendanceRecordRecord, UpsertAttendanceRecordInput } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoDate, toIsoRequired, toNum } from './util';

interface AttendanceRecordRow {
  id: number | string;
  school_id: number | string;
  person_id: number | string;
  role_type: AttendanceRecordRecord['roleType'];
  attendance_date: string | Date;
  first_in_at: string | Date | null;
  last_out_at: string | Date | null;
  first_in_device: string | null;
  last_out_device: string | null;
  status: AttendanceRecordRecord['status'];
  late_minutes: number;
  early_minutes: number;
  total_minutes: number;
  rule_id: number | string | null;
  raw_event_count: number;
  evaluated_at: string | Date | null;
}

function toRecord(r: AttendanceRecordRow): AttendanceRecordRecord {
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    personId: toNum(r.person_id),
    roleType: r.role_type,
    // attendance_date is a DATE column — mysql2 returns it as a Date
    // object, exactly like admission_date/date_of_birth elsewhere in
    // this repo layer. Caught the hard way (again) verifying against
    // real production data: a naive String(dateObj) is NOT an ISO date
    // string, and a query built from that garbage silently found nothing.
    attendanceDate: toIsoDate(r.attendance_date)!,
    firstInAt: toIso(r.first_in_at),
    lastOutAt: toIso(r.last_out_at),
    firstInDevice: r.first_in_device,
    lastOutDevice: r.last_out_device,
    status: r.status,
    lateMinutes: r.late_minutes,
    earlyMinutes: r.early_minutes,
    totalMinutes: r.total_minutes,
    ruleId: r.rule_id == null ? null : toNum(r.rule_id),
    rawEventCount: r.raw_event_count,
    evaluatedAt: toIsoRequired(r.evaluated_at),
  };
}

const BASE_SELECT = `SELECT id, school_id, person_id, role_type, attendance_date, first_in_at, last_out_at,
                             first_in_device, last_out_device, status, late_minutes, early_minutes, total_minutes,
                             rule_id, raw_event_count, evaluated_at
                        FROM attendance_records`;

export function createMysqlAttendanceRecordRepo(): AttendanceRecordRepo {
  return {
    async findByPersonAndDate(schoolId, personId, date) {
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? AND person_id = ? AND attendance_date = ? LIMIT 1`,
        [schoolId, personId, date],
      )) as AttendanceRecordRow[];
      return rows.length ? toRecord(rows[0]) : null;
    },

    async listBySchoolAndDate(schoolId, date) {
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? AND attendance_date = ? ORDER BY person_id ASC`,
        [schoolId, date],
      )) as AttendanceRecordRow[];
      return rows.map(toRecord);
    },

    async upsert(input: UpsertAttendanceRecordInput) {
      await query(
        `INSERT INTO attendance_records
           (school_id, person_id, role_type, attendance_date, first_in_at, last_out_at, first_in_device, last_out_device,
            status, late_minutes, early_minutes, total_minutes, rule_id, raw_event_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           role_type=VALUES(role_type), first_in_at=VALUES(first_in_at), last_out_at=VALUES(last_out_at),
           first_in_device=VALUES(first_in_device), last_out_device=VALUES(last_out_device), status=VALUES(status),
           late_minutes=VALUES(late_minutes), early_minutes=VALUES(early_minutes), total_minutes=VALUES(total_minutes),
           rule_id=VALUES(rule_id), raw_event_count=VALUES(raw_event_count)`,
        [
          input.schoolId, input.personId, input.roleType, input.attendanceDate,
          input.firstInAt ?? null, input.lastOutAt ?? null, input.firstInDevice ?? null, input.lastOutDevice ?? null,
          input.status, input.lateMinutes ?? 0, input.earlyMinutes ?? 0, input.totalMinutes ?? 0,
          input.ruleId ?? null, input.rawEventCount ?? 0,
        ],
      );
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? AND person_id = ? AND attendance_date = ? LIMIT 1`,
        [input.schoolId, input.personId, input.attendanceDate],
      )) as AttendanceRecordRow[];
      if (!rows.length) throw new RepoError('Attendance record vanished immediately after upsert', 'NOT_FOUND');
      return toRecord(rows[0]);
    },
  };
}
