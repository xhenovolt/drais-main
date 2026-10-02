/**
 * @drais/repo-sqlite — DepartmentRepo, SQLite implementation.
 * Mirrors mysql/department-repo.ts's contract exactly.
 */
import type { SqliteConnection } from './connection';
import type { DepartmentRepo } from '../contract/department-repo';
import type { DepartmentRecord, NewDepartmentInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface DepartmentRow {
  id: number;
  school_id: number;
  name: string;
  name_ar: string | null;
  head_staff_id: number | null;
  description: string | null;
  subject_group_id: number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: DepartmentRow): DepartmentRecord {
  return {
    id: r.id, schoolId: r.school_id, name: r.name, nameAr: r.name_ar,
    headStaffId: r.head_staff_id, description: r.description, subjectGroupId: r.subject_group_id,
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at,
    deletedBy: r.deleted_by, deleteReason: r.delete_reason, restoredAt: r.restored_at, restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `id, school_id, name, name_ar, head_staff_id, description, subject_group_id,
                      created_at, updated_at, deleted_at, deleted_by, delete_reason, restored_at, restored_by`;
const BASE_SELECT = `SELECT ${SELECT_COLS} FROM departments`;
const nowIso = () => new Date().toISOString();

export function createSqliteDepartmentRepo(db: SqliteConnection): DepartmentRepo {
  const findById = async (schoolId: number, id: number): Promise<DepartmentRecord | null> => {
    const row = db.prepare(`${BASE_SELECT} WHERE id = ? AND school_id = ?`).get(id, schoolId) as DepartmentRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `${BASE_SELECT} WHERE school_id = ? ORDER BY name ASC LIMIT ?`
        : `${BASE_SELECT} WHERE school_id = ? AND deleted_at IS NULL ORDER BY name ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as DepartmentRow[];
      return rows.map(toRecord);
    },

    async create(input: NewDepartmentInput) {
      const res = db.prepare(
        `INSERT INTO departments (school_id, name, name_ar, head_staff_id, description, subject_group_id, created_at)
         VALUES (@schoolId, @name, @nameAr, @headStaffId, @description, @subjectGroupId, @createdAt)`,
      ).run({
        schoolId: input.schoolId, name: input.name, nameAr: input.nameAr ?? null,
        headStaffId: input.headStaffId ?? null, description: input.description ?? null,
        subjectGroupId: input.subjectGroupId ?? null, createdAt: nowIso(),
      });
      const created = await findById(input.schoolId, Number(res.lastInsertRowid));
      if (!created) throw new RepoError('Department vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Department ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewDepartmentInput = {
        schoolId, name: patch.name ?? existing.name,
        nameAr: patch.nameAr !== undefined ? patch.nameAr : existing.nameAr,
        headStaffId: patch.headStaffId !== undefined ? patch.headStaffId : existing.headStaffId,
        description: patch.description !== undefined ? patch.description : existing.description,
        subjectGroupId: patch.subjectGroupId !== undefined ? patch.subjectGroupId : existing.subjectGroupId,
      };
      db.prepare(
        `UPDATE departments SET name=@name, name_ar=@nameAr, head_staff_id=@headStaffId,
                description=@description, subject_group_id=@subjectGroupId, updated_at=@updatedAt
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId, name: merged.name, nameAr: merged.nameAr ?? null, headStaffId: merged.headStaffId ?? null,
        description: merged.description ?? null, subjectGroupId: merged.subjectGroupId ?? null, updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Department ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE departments SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Department ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE departments SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Department ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Department ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
