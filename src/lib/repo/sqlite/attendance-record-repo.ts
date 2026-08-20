/**
 * @drais/repo-sqlite — AttendanceRecordRepo, SQLite implementation.
 * upsert() uses SQLite's ON CONFLICT DO UPDATE against the real
 * (person_id, attendance_date) unique key — same semantics as mysql's
 * ON DUPLICATE KEY UPDATE.
 */
import type { SqliteConnection } from './connection';
import type { AttendanceRecordRepo } from '../contract/attendance-record-repo';
import type { AttendanceRecordRecord, UpsertAttendanceRecordInput } from '../contract/types';
import { RepoError } from '../contract/types';

interface AttendanceRecordRow {
  id: number;
  school_id: number;
  person_id: number;
  role_type: AttendanceRecordRecord['roleType'];
  attendance_date: string;
  first_in_at: string | null;
  last_out_at: string | null;
  first_in_device: string | null;
  last_out_device: string | null;
  status: AttendanceRecordRecord['status'];
  late_minutes: number;
  early_minutes: number;
  total_minutes: number;
  rule_id: number | null;
  raw_event_count: number;
  evaluated_at: string;
}

function toRecord(r: AttendanceRecordRow): AttendanceRecordRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    personId: r.person_id,
    roleType: r.role_type,
    attendanceDate: r.attendance_date,
    firstInAt: r.first_in_at,
    lastOutAt: r.last_out_at,
    firstInDevice: r.first_in_device,
    lastOutDevice: r.last_out_device,
    status: r.status,
    lateMinutes: r.late_minutes,
    earlyMinutes: r.early_minutes,
    totalMinutes: r.total_minutes,
    ruleId: r.rule_id,
    rawEventCount: r.raw_event_count,
    evaluatedAt: r.evaluated_at,
  };
}

const SELECT_COLS = `id, school_id, person_id, role_type, attendance_date, first_in_at, last_out_at,
                      first_in_device, last_out_device, status, late_minutes, early_minutes, total_minutes,
                      rule_id, raw_event_count, evaluated_at`;

const nowIso = () => new Date().toISOString();

export function createSqliteAttendanceRecordRepo(db: SqliteConnection): AttendanceRecordRepo {
  return {
    async findByPersonAndDate(schoolId, personId, date) {
      const row = db.prepare(
        `SELECT ${SELECT_COLS} FROM attendance_records WHERE school_id = ? AND person_id = ? AND attendance_date = ?`,
      ).get(schoolId, personId, date) as AttendanceRecordRow | undefined;
      return row ? toRecord(row) : null;
    },

    async listBySchoolAndDate(schoolId, date) {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM attendance_records WHERE school_id = ? AND attendance_date = ? ORDER BY person_id ASC`,
      ).all(schoolId, date) as AttendanceRecordRow[];
      return rows.map(toRecord);
    },

    async upsert(input: UpsertAttendanceRecordInput) {
      db.prepare(
        `INSERT INTO attendance_records
           (school_id, person_id, role_type, attendance_date, first_in_at, last_out_at, first_in_device, last_out_device,
            status, late_minutes, early_minutes, total_minutes, rule_id, raw_event_count, evaluated_at)
         VALUES (@schoolId, @personId, @roleType, @attendanceDate, @firstInAt, @lastOutAt, @firstInDevice, @lastOutDevice,
                 @status, @lateMinutes, @earlyMinutes, @totalMinutes, @ruleId, @rawEventCount, @evaluatedAt)
         ON CONFLICT(person_id, attendance_date) DO UPDATE SET
           role_type=excluded.role_type, first_in_at=excluded.first_in_at, last_out_at=excluded.last_out_at,
           first_in_device=excluded.first_in_device, last_out_device=excluded.last_out_device, status=excluded.status,
           late_minutes=excluded.late_minutes, early_minutes=excluded.early_minutes, total_minutes=excluded.total_minutes,
           rule_id=excluded.rule_id, raw_event_count=excluded.raw_event_count, evaluated_at=excluded.evaluated_at`,
      ).run({
        schoolId: input.schoolId, personId: input.personId, roleType: input.roleType, attendanceDate: input.attendanceDate,
        firstInAt: input.firstInAt ?? null, lastOutAt: input.lastOutAt ?? null,
        firstInDevice: input.firstInDevice ?? null, lastOutDevice: input.lastOutDevice ?? null,
        status: input.status, lateMinutes: input.lateMinutes ?? 0, earlyMinutes: input.earlyMinutes ?? 0,
        totalMinutes: input.totalMinutes ?? 0, ruleId: input.ruleId ?? null, rawEventCount: input.rawEventCount ?? 0,
        evaluatedAt: nowIso(),
      });
      const row = db.prepare(
        `SELECT ${SELECT_COLS} FROM attendance_records WHERE person_id = ? AND attendance_date = ?`,
      ).get(input.personId, input.attendanceDate) as AttendanceRecordRow | undefined;
      if (!row) throw new RepoError('Attendance record vanished immediately after upsert', 'NOT_FOUND');
      return toRecord(row);
    },
  };
}
