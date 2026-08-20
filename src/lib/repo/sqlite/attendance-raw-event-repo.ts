/**
 * @drais/repo-sqlite — AttendanceRawEventRepo, SQLite implementation.
 * Mirrors mysql/attendance-raw-event-repo.ts's contract exactly,
 * including the idempotent-not-throwing create() semantics.
 */
import type { SqliteConnection } from './connection';
import type { AttendanceRawEventRepo, CreateRawEventResult } from '../contract/attendance-raw-event-repo';
import type { AttendanceRawEventRecord, NewAttendanceRawEventInput } from '../contract/types';
import { RepoError } from '../contract/types';

interface RawEventRow {
  id: number;
  school_id: number;
  device_sn: string;
  device_user_id: number;
  display_name: string | null;
  enrollment_id: number | null;
  person_id: number | null;
  role_type: AttendanceRawEventRecord['roleType'];
  role_ref_id: number | null;
  punch_at: string;
  verify_type: number | null;
  io_mode: number | null;
  source: AttendanceRawEventRecord['source'];
  matched: number;
  resolution_path: string | null;
  resolution_score: number | null;
  legacy_table: string | null;
  legacy_id: number | null;
  ingested_at: string;
}

function toRecord(r: RawEventRow): AttendanceRawEventRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    deviceSn: r.device_sn,
    deviceUserId: r.device_user_id,
    displayName: r.display_name,
    enrollmentId: r.enrollment_id,
    personId: r.person_id,
    roleType: r.role_type,
    roleRefId: r.role_ref_id,
    punchAt: r.punch_at,
    verifyType: r.verify_type,
    ioMode: r.io_mode,
    source: r.source,
    matched: Boolean(r.matched),
    resolutionPath: r.resolution_path,
    resolutionScore: r.resolution_score,
    legacyTable: r.legacy_table,
    legacyId: r.legacy_id,
    ingestedAt: r.ingested_at,
  };
}

const SELECT_COLS = `id, school_id, device_sn, device_user_id, display_name, enrollment_id, person_id,
                      role_type, role_ref_id, punch_at, verify_type, io_mode, source, matched,
                      resolution_path, resolution_score, legacy_table, legacy_id, ingested_at`;

export function createSqliteAttendanceRawEventRepo(db: SqliteConnection): AttendanceRawEventRepo {
  const findById = async (schoolId: number, id: number): Promise<AttendanceRawEventRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM attendance_raw_events WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as RawEventRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async create(input: NewAttendanceRawEventInput): Promise<CreateRawEventResult> {
      // SQLite's INSERT OR IGNORE against the real UNIQUE constraint —
      // same dedup semantics as mysql's INSERT IGNORE. See the contract
      // interface's header for why a duplicate resolves rather than throws.
      const res = db.prepare(
        `INSERT OR IGNORE INTO attendance_raw_events
           (school_id, device_sn, device_user_id, display_name, enrollment_id, person_id, role_type, role_ref_id,
            punch_at, verify_type, io_mode, source, matched, resolution_path, resolution_score, legacy_table, legacy_id)
         VALUES (@schoolId, @deviceSn, @deviceUserId, @displayName, @enrollmentId, @personId, @roleType, @roleRefId,
                 @punchAt, @verifyType, @ioMode, @source, @matched, @resolutionPath, @resolutionScore, @legacyTable, @legacyId)`,
      ).run({
        schoolId: input.schoolId, deviceSn: input.deviceSn, deviceUserId: input.deviceUserId,
        displayName: input.displayName ?? null, enrollmentId: input.enrollmentId ?? null, personId: input.personId ?? null,
        roleType: input.roleType ?? null, roleRefId: input.roleRefId ?? null, punchAt: input.punchAt,
        verifyType: input.verifyType ?? null, ioMode: input.ioMode ?? null, source: input.source,
        matched: input.matched ? 1 : 0, resolutionPath: input.resolutionPath ?? null,
        resolutionScore: input.resolutionScore ?? null, legacyTable: input.legacyTable ?? null,
        legacyId: input.legacyId ?? null,
      });

      if (res.changes > 0) {
        const record = await findById(input.schoolId, Number(res.lastInsertRowid));
        if (!record) throw new RepoError('Raw event vanished immediately after insert', 'NOT_FOUND');
        return { inserted: true, record };
      }

      const existing = db.prepare(
        `SELECT ${SELECT_COLS} FROM attendance_raw_events
          WHERE school_id = ? AND device_sn = ? AND device_user_id = ? AND punch_at = ? AND source = ?`,
      ).get(input.schoolId, input.deviceSn, input.deviceUserId, input.punchAt, input.source) as RawEventRow | undefined;
      if (!existing) {
        throw new RepoError('INSERT OR IGNORE reported a duplicate but the existing row could not be found by its own dedup key', 'INVALID_INPUT');
      }
      return { inserted: false, record: toRecord(existing) };
    },

    async listByPersonAndDateRange(schoolId, personId, fromDate, toDate) {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM attendance_raw_events
          WHERE school_id = ? AND person_id = ? AND date(punch_at) BETWEEN ? AND ?
          ORDER BY punch_at ASC`,
      ).all(schoolId, personId, fromDate, toDate) as RawEventRow[];
      return rows.map(toRecord);
    },
  };
}
