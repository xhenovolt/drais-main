/**
 * @drais/repo-sqlite — SubjectRepo, SQLite implementation.
 * Mirrors mysql/subject-repo.ts's contract exactly.
 */
import type { SqliteConnection } from './connection';
import type { SubjectRepo } from '../contract/subject-repo';
import type { SubjectRecord, NewSubjectInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface SubjectRow {
  id: number;
  school_id: number;
  name: string;
  name_ar: string | null;
  code: string | null;
  subject_type: string | null;
  academic_type: SubjectRecord['academicType'];
  department_id: number | null;
  subject_group_id: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: SubjectRow): SubjectRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    name: r.name,
    nameAr: r.name_ar,
    code: r.code,
    subjectType: r.subject_type,
    academicType: r.academic_type,
    departmentId: r.department_id,
    subjectGroupId: r.subject_group_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `id, school_id, name, name_ar, code, subject_type, academic_type, department_id,
                      subject_group_id, created_at, updated_at, deleted_at, deleted_by, delete_reason,
                      restored_at, restored_by`;

const nowIso = () => new Date().toISOString();

export function createSqliteSubjectRepo(db: SqliteConnection): SubjectRepo {
  const findById = async (schoolId: number, id: number): Promise<SubjectRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM subjects WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as SubjectRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `SELECT ${SELECT_COLS} FROM subjects WHERE school_id = ? ORDER BY name ASC LIMIT ?`
        : `SELECT ${SELECT_COLS} FROM subjects WHERE school_id = ? AND deleted_at IS NULL ORDER BY name ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as SubjectRow[];
      return rows.map(toRecord);
    },

    async create(input: NewSubjectInput) {
      const res = db.prepare(
        `INSERT INTO subjects (school_id, name, name_ar, code, subject_type, academic_type, department_id, subject_group_id)
         VALUES (@schoolId, @name, @nameAr, @code, @subjectType, @academicType, @departmentId, @subjectGroupId)`,
      ).run({
        schoolId: input.schoolId, name: input.name, nameAr: input.nameAr ?? null, code: input.code ?? null,
        subjectType: input.subjectType ?? null, academicType: input.academicType ?? 'secular',
        departmentId: input.departmentId ?? null, subjectGroupId: input.subjectGroupId ?? null,
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM subjects WHERE id = ?`)
        .get(Number(res.lastInsertRowid)) as SubjectRow | undefined;
      if (!row) throw new RepoError('Subject vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Subject ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewSubjectInput = {
        schoolId: patch.schoolId ?? existing.schoolId,
        name: patch.name ?? existing.name,
        nameAr: patch.nameAr !== undefined ? patch.nameAr : existing.nameAr,
        code: patch.code !== undefined ? patch.code : existing.code,
        subjectType: patch.subjectType !== undefined ? patch.subjectType : existing.subjectType,
        academicType: patch.academicType ?? existing.academicType,
        departmentId: patch.departmentId !== undefined ? patch.departmentId : existing.departmentId,
        subjectGroupId: patch.subjectGroupId !== undefined ? patch.subjectGroupId : existing.subjectGroupId,
      };
      db.prepare(
        `UPDATE subjects SET school_id=@schoolId, name=@name, name_ar=@nameAr, code=@code,
                subject_type=@subjectType, academic_type=@academicType, department_id=@departmentId,
                subject_group_id=@subjectGroupId, updated_at=@updatedAt
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId: merged.schoolId, name: merged.name, nameAr: merged.nameAr ?? null, code: merged.code ?? null,
        subjectType: merged.subjectType ?? null, academicType: merged.academicType ?? 'secular',
        departmentId: merged.departmentId ?? null, subjectGroupId: merged.subjectGroupId ?? null, updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Subject ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE subjects SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Subject ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE subjects SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Subject ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Subject ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
