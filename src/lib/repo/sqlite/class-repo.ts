/**
 * @drais/repo-sqlite — ClassRepo, SQLite implementation.
 * Mirrors mysql/class-repo.ts's contract exactly, including the richer
 * deleted_by/delete_reason/restored_at/restored_by audit trail.
 */
import type { SqliteConnection } from './connection';
import type { ClassRepo } from '../contract/class-repo';
import type { ClassRecord, NewClassInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface ClassRow {
  id: number;
  school_id: number | null;
  name: string;
  curriculum_id: number | null;
  program_id: number | null;
  class_level: number | null;
  head_teacher_id: number | null;
  capacity: number | null;
  code: string | null;
  level: number | null;
  name_ar: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: ClassRow): ClassRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    name: r.name,
    curriculumId: r.curriculum_id,
    programId: r.program_id,
    classLevel: r.class_level,
    headTeacherId: r.head_teacher_id,
    capacity: r.capacity,
    code: r.code,
    level: r.level,
    nameAr: r.name_ar,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `id, school_id, name, curriculum_id, program_id, class_level, head_teacher_id,
                      capacity, code, level, name_ar, created_at, updated_at, deleted_at,
                      deleted_by, delete_reason, restored_at, restored_by`;

const nowIso = () => new Date().toISOString();

export function createSqliteClassRepo(db: SqliteConnection): ClassRepo {
  const findById = async (schoolId: number, id: number): Promise<ClassRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM classes WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as ClassRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `SELECT ${SELECT_COLS} FROM classes WHERE school_id = ? ORDER BY name ASC LIMIT ?`
        : `SELECT ${SELECT_COLS} FROM classes WHERE school_id = ? AND deleted_at IS NULL ORDER BY name ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as ClassRow[];
      return rows.map(toRecord);
    },

    async create(input: NewClassInput) {
      const res = db.prepare(
        `INSERT INTO classes (school_id, name, curriculum_id, program_id, class_level, head_teacher_id, capacity, code, level, name_ar)
         VALUES (@schoolId, @name, @curriculumId, @programId, @classLevel, @headTeacherId, @capacity, @code, @level, @nameAr)`,
      ).run({
        schoolId: input.schoolId ?? null, name: input.name, curriculumId: input.curriculumId ?? null,
        programId: input.programId ?? null, classLevel: input.classLevel ?? null, headTeacherId: input.headTeacherId ?? null,
        capacity: input.capacity ?? null, code: input.code ?? null, level: input.level ?? null, nameAr: input.nameAr ?? null,
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM classes WHERE id = ?`).get(Number(res.lastInsertRowid)) as ClassRow | undefined;
      if (!row) throw new RepoError('Class vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Class ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewClassInput = {
        schoolId: patch.schoolId !== undefined ? patch.schoolId : existing.schoolId,
        name: patch.name ?? existing.name,
        curriculumId: patch.curriculumId !== undefined ? patch.curriculumId : existing.curriculumId,
        programId: patch.programId !== undefined ? patch.programId : existing.programId,
        classLevel: patch.classLevel !== undefined ? patch.classLevel : existing.classLevel,
        headTeacherId: patch.headTeacherId !== undefined ? patch.headTeacherId : existing.headTeacherId,
        capacity: patch.capacity !== undefined ? patch.capacity : existing.capacity,
        code: patch.code !== undefined ? patch.code : existing.code,
        level: patch.level !== undefined ? patch.level : existing.level,
        nameAr: patch.nameAr !== undefined ? patch.nameAr : existing.nameAr,
      };
      db.prepare(
        `UPDATE classes SET school_id=@schoolId, name=@name, curriculum_id=@curriculumId, program_id=@programId,
                class_level=@classLevel, head_teacher_id=@headTeacherId, capacity=@capacity, code=@code,
                level=@level, name_ar=@nameAr, updated_at=@updatedAt
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId: merged.schoolId ?? null, name: merged.name, curriculumId: merged.curriculumId ?? null,
        programId: merged.programId ?? null, classLevel: merged.classLevel ?? null, headTeacherId: merged.headTeacherId ?? null,
        capacity: merged.capacity ?? null, code: merged.code ?? null, level: merged.level ?? null,
        nameAr: merged.nameAr ?? null, updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Class ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE classes SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Class ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE classes SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Class ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Class ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
