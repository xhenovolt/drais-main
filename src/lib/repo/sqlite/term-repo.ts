/**
 * @drais/repo-sqlite — TermRepo, SQLite implementation.
 * Mirrors mysql/term-repo.ts's contract exactly, including is_active
 * stored as 0/1/NULL and converted to boolean|null on read.
 */
import type { SqliteConnection } from './connection';
import type { TermRepo } from '../contract/term-repo';
import type { TermRecord, NewTermInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface TermRow {
  id: number;
  school_id: number;
  name: string;
  name_ar: string | null;
  code: string | null;
  start_date: string;
  end_date: string;
  academic_year_id: number | null;
  is_active: number | null;
  term_number: number | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: TermRow): TermRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    name: r.name,
    nameAr: r.name_ar,
    code: r.code,
    startDate: r.start_date,
    endDate: r.end_date,
    academicYearId: r.academic_year_id,
    isActive: r.is_active == null ? null : Boolean(r.is_active),
    termNumber: r.term_number,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `id, school_id, name, name_ar, code, start_date, end_date, academic_year_id,
                      is_active, term_number, status, notes, created_at, updated_at, deleted_at,
                      deleted_by, delete_reason, restored_at, restored_by`;

const nowIso = () => new Date().toISOString();
const toBit = (v: boolean | null | undefined): number | null => (v == null ? null : v ? 1 : 0);

export function createSqliteTermRepo(db: SqliteConnection): TermRepo {
  const findById = async (schoolId: number, id: number): Promise<TermRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM terms WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as TermRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `SELECT ${SELECT_COLS} FROM terms WHERE school_id = ? ORDER BY start_date ASC LIMIT ?`
        : `SELECT ${SELECT_COLS} FROM terms WHERE school_id = ? AND deleted_at IS NULL ORDER BY start_date ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as TermRow[];
      return rows.map(toRecord);
    },

    async listByAcademicYear(schoolId, academicYearId) {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM terms WHERE school_id = ? AND academic_year_id = ? AND deleted_at IS NULL ORDER BY start_date ASC`,
      ).all(schoolId, academicYearId) as TermRow[];
      return rows.map(toRecord);
    },

    async create(input: NewTermInput) {
      const res = db.prepare(
        `INSERT INTO terms (school_id, name, name_ar, code, start_date, end_date, academic_year_id, is_active, term_number, status, notes)
         VALUES (@schoolId, @name, @nameAr, @code, @startDate, @endDate, @academicYearId, @isActive, @termNumber, @status, @notes)`,
      ).run({
        schoolId: input.schoolId, name: input.name, nameAr: input.nameAr ?? null, code: input.code ?? null,
        startDate: input.startDate, endDate: input.endDate, academicYearId: input.academicYearId ?? null,
        isActive: toBit(input.isActive), termNumber: input.termNumber ?? null, status: input.status ?? null,
        notes: input.notes ?? null,
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM terms WHERE id = ?`)
        .get(Number(res.lastInsertRowid)) as TermRow | undefined;
      if (!row) throw new RepoError('Term vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Term ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewTermInput = {
        schoolId: patch.schoolId ?? existing.schoolId,
        name: patch.name ?? existing.name,
        nameAr: patch.nameAr !== undefined ? patch.nameAr : existing.nameAr,
        code: patch.code !== undefined ? patch.code : existing.code,
        startDate: patch.startDate ?? existing.startDate,
        endDate: patch.endDate ?? existing.endDate,
        academicYearId: patch.academicYearId !== undefined ? patch.academicYearId : existing.academicYearId,
        isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
        termNumber: patch.termNumber !== undefined ? patch.termNumber : existing.termNumber,
        status: patch.status !== undefined ? patch.status : existing.status,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
      };
      db.prepare(
        `UPDATE terms SET school_id=@schoolId, name=@name, name_ar=@nameAr, code=@code, start_date=@startDate,
                end_date=@endDate, academic_year_id=@academicYearId, is_active=@isActive, term_number=@termNumber,
                status=@status, notes=@notes, updated_at=@updatedAt
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId: merged.schoolId, name: merged.name, nameAr: merged.nameAr ?? null, code: merged.code ?? null,
        startDate: merged.startDate, endDate: merged.endDate, academicYearId: merged.academicYearId ?? null,
        isActive: toBit(merged.isActive), termNumber: merged.termNumber ?? null, status: merged.status ?? null,
        notes: merged.notes ?? null, updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Term ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE terms SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Term ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE terms SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Term ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Term ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
