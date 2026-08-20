/**
 * @drais/repo-mysql — AttendanceRawEventRepo, MySQL/TiDB implementation.
 * See contract/attendance-raw-event-repo.ts for why create() is
 * idempotent-by-design rather than throw-on-duplicate.
 */
import { query } from '@/lib/db';
import type { AttendanceRawEventRepo, CreateRawEventResult } from '../contract/attendance-raw-event-repo';
import type { AttendanceRawEventRecord, NewAttendanceRawEventInput } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoRequired, toNum, toNumOrNull } from './util';

interface RawEventRow {
  id: number | string;
  school_id: number | string;
  device_sn: string;
  device_user_id: number;
  display_name: string | null;
  enrollment_id: number | string | null;
  person_id: number | string | null;
  role_type: AttendanceRawEventRecord['roleType'];
  role_ref_id: number | string | null;
  punch_at: string | Date;
  verify_type: number | null;
  io_mode: number | null;
  source: AttendanceRawEventRecord['source'];
  matched: number | boolean;
  resolution_path: string | null;
  resolution_score: number | string | null;
  legacy_table: string | null;
  legacy_id: number | string | null;
  ingested_at: string | Date | null;
}

function toRecord(r: RawEventRow): AttendanceRawEventRecord {
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    deviceSn: r.device_sn,
    deviceUserId: r.device_user_id,
    displayName: r.display_name,
    enrollmentId: toNumOrNull(r.enrollment_id),
    personId: toNumOrNull(r.person_id),
    roleType: r.role_type,
    roleRefId: toNumOrNull(r.role_ref_id),
    punchAt: toIsoRequired(r.punch_at),
    verifyType: r.verify_type,
    ioMode: r.io_mode,
    source: r.source,
    matched: Boolean(r.matched),
    resolutionPath: r.resolution_path,
    resolutionScore: r.resolution_score == null ? null : Number(r.resolution_score),
    legacyTable: r.legacy_table,
    legacyId: toNumOrNull(r.legacy_id),
    ingestedAt: toIsoRequired(r.ingested_at),
  };
}

const BASE_SELECT = `SELECT id, school_id, device_sn, device_user_id, display_name, enrollment_id, person_id,
                             role_type, role_ref_id, punch_at, verify_type, io_mode, source, matched,
                             resolution_path, resolution_score, legacy_table, legacy_id, ingested_at
                        FROM attendance_raw_events`;

async function findById(schoolId: number, id: number): Promise<AttendanceRawEventRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as RawEventRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlAttendanceRawEventRepo(): AttendanceRawEventRepo {
  return {
    findById,

    async create(input: NewAttendanceRawEventInput): Promise<CreateRawEventResult> {
      // Mirrors src/lib/attendance/engine.ts's recordRawEvent(): INSERT
      // IGNORE against the real uk_raw_punch dedup key. A "duplicate" is
      // an expected device re-send, not an error — see this repo's
      // contract-level header for why this differs from StudentRepo's
      // throw-on-duplicate-admission_no.
      const res = (await query(
        `INSERT IGNORE INTO attendance_raw_events
           (school_id, device_sn, device_user_id, display_name, enrollment_id, person_id, role_type, role_ref_id,
            punch_at, verify_type, io_mode, source, matched, resolution_path, resolution_score, legacy_table, legacy_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId, input.deviceSn, input.deviceUserId, input.displayName ?? null,
          input.enrollmentId ?? null, input.personId ?? null, input.roleType ?? null, input.roleRefId ?? null,
          input.punchAt, input.verifyType ?? null, input.ioMode ?? null, input.source,
          input.matched ? 1 : 0, input.resolutionPath ?? null, input.resolutionScore ?? null,
          input.legacyTable ?? null, input.legacyId ?? null,
        ],
      )) as unknown as { insertId?: number; affectedRows?: number };

      const inserted = Boolean(res?.affectedRows && res.insertId);
      if (inserted) {
        const record = await findById(input.schoolId, res.insertId!);
        if (!record) throw new RepoError('Raw event vanished immediately after insert', 'NOT_FOUND');
        return { inserted: true, record };
      }

      // Duplicate — the row that already occupies the dedup key IS the
      // "record" this call resolves to; look it up by the same key.
      const existing = (await query(
        `${BASE_SELECT} WHERE school_id = ? AND device_sn = ? AND device_user_id = ? AND punch_at = ? AND source = ? LIMIT 1`,
        [input.schoolId, input.deviceSn, input.deviceUserId, input.punchAt, input.source],
      )) as RawEventRow[];
      if (!existing.length) {
        throw new RepoError('INSERT IGNORE reported a duplicate but the existing row could not be found by its own dedup key', 'INVALID_INPUT');
      }
      return { inserted: false, record: toRecord(existing[0]) };
    },

    async listByPersonAndDateRange(schoolId, personId, fromDate, toDate) {
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? AND person_id = ? AND DATE(punch_at) BETWEEN ? AND ? ORDER BY punch_at ASC`,
        [schoolId, personId, fromDate, toDate],
      )) as RawEventRow[];
      return rows.map(toRecord);
    },
  };
}
