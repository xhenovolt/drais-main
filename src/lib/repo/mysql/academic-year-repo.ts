/**
 * @drais/repo-mysql — AcademicYearRepo, MySQL/TiDB implementation.
 * The real table has neither created_at nor updated_at — see
 * contract/types.ts's header on this sub-effort. Nothing in this file
 * reads or writes either column because neither exists.
 */
import { query } from '@/lib/db';
import type { AcademicYearRepo } from '../contract/academic-year-repo';
import type { AcademicYearRecord, NewAcademicYearInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoDate, toNum, toNumOrNull } from './util';

interface AcademicYearRow {
  id: number | string;
  school_id: number | string;
  name: string;
  start_date: string | Date | null;
  end_date: string | Date | null;
  status: string | null;
  deleted_at: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toRecord(r: AcademicYearRow): AcademicYearRecord {
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    name: r.name,
    startDate: toIsoDate(r.start_date),
    endDate: toIsoDate(r.end_date),
    status: r.status,
    deletedAt: toIso(r.deleted_at),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT id, school_id, name, start_date, end_date, status, deleted_at,
                             deleted_by, delete_reason, restored_at, restored_by
                        FROM academic_years`;

async function findById(schoolId: number, id: number): Promise<AcademicYearRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as AcademicYearRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlAcademicYearRepo(): AcademicYearRepo {
  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY start_date DESC, name DESC LIMIT ${limit}`,
        [schoolId],
      )) as AcademicYearRow[];
      return rows.map(toRecord);
    },

    async create(input: NewAcademicYearInput) {
      const res = (await query(
        `INSERT INTO academic_years (school_id, name, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?)`,
        [input.schoolId, input.name, input.startDate ?? null, input.endDate ?? null, input.status ?? null],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(input.schoolId, res.insertId);
      if (!created) throw new RepoError('Academic year vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Academic year ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewAcademicYearInput = {
        schoolId: patch.schoolId ?? existing.schoolId,
        name: patch.name ?? existing.name,
        startDate: patch.startDate !== undefined ? patch.startDate : existing.startDate,
        endDate: patch.endDate !== undefined ? patch.endDate : existing.endDate,
        status: patch.status !== undefined ? patch.status : existing.status,
      };
      await query(
        `UPDATE academic_years SET school_id=?, name=?, start_date=?, end_date=?, status=?
          WHERE id = ? AND school_id = ?`,
        [merged.schoolId, merged.name, merged.startDate ?? null, merged.endDate ?? null, merged.status ?? null, id, schoolId],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Academic year ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE academic_years SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Academic year ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE academic_years SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Academic year ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Academic year ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
