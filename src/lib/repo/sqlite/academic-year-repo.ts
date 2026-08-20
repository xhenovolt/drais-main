/**
 * @drais/repo-sqlite — AcademicYearRepo, SQLite implementation.
 * No created_at/updated_at columns exist on this table — see
 * contract/types.ts's header. Nothing here reads or writes either.
 */
import type { SqliteConnection } from './connection';
import type { AcademicYearRepo } from '../contract/academic-year-repo';
import type { AcademicYearRecord, NewAcademicYearInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface AcademicYearRow {
  id: number;
  school_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: AcademicYearRow): AcademicYearRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `id, school_id, name, start_date, end_date, status, deleted_at, deleted_by,
                      delete_reason, restored_at, restored_by`;

const nowIso = () => new Date().toISOString();

export function createSqliteAcademicYearRepo(db: SqliteConnection): AcademicYearRepo {
  const findById = async (schoolId: number, id: number): Promise<AcademicYearRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM academic_years WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as AcademicYearRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `SELECT ${SELECT_COLS} FROM academic_years WHERE school_id = ? ORDER BY start_date DESC, name DESC LIMIT ?`
        : `SELECT ${SELECT_COLS} FROM academic_years WHERE school_id = ? AND deleted_at IS NULL ORDER BY start_date DESC, name DESC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as AcademicYearRow[];
      return rows.map(toRecord);
    },

    async create(input: NewAcademicYearInput) {
      const res = db.prepare(
        `INSERT INTO academic_years (school_id, name, start_date, end_date, status)
         VALUES (@schoolId, @name, @startDate, @endDate, @status)`,
      ).run({
        schoolId: input.schoolId, name: input.name, startDate: input.startDate ?? null,
        endDate: input.endDate ?? null, status: input.status ?? null,
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM academic_years WHERE id = ?`)
        .get(Number(res.lastInsertRowid)) as AcademicYearRow | undefined;
      if (!row) throw new RepoError('Academic year vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
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
      db.prepare(
        `UPDATE academic_years SET school_id=@schoolId, name=@name, start_date=@startDate, end_date=@endDate, status=@status
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId: merged.schoolId, name: merged.name, startDate: merged.startDate ?? null,
        endDate: merged.endDate ?? null, status: merged.status ?? null,
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Academic year ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE academic_years SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Academic year ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE academic_years SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Academic year ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Academic year ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
