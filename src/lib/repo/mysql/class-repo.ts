/**
 * @drais/repo-mysql — ClassRepo, MySQL/TiDB implementation.
 * Thin wrapper over src/lib/db.ts's `query` — see school-repo.ts's header
 * for the isolation rule this follows.
 */
import { query } from '@/lib/db';
import type { ClassRepo } from '../contract/class-repo';
import type { ClassRecord, NewClassInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoRequired, toNum, toNumOrNull } from './util';

interface ClassRow {
  id: number | string;
  school_id: number | string | null;
  name: string;
  curriculum_id: number | string | null;
  program_id: number | string | null;
  class_level: number | null;
  head_teacher_id: number | string | null;
  capacity: number | null;
  code: string | null;
  level: number | null;
  name_ar: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toRecord(r: ClassRow): ClassRecord {
  const createdAt = toIsoRequired(r.created_at);
  return {
    id: toNum(r.id),
    schoolId: toNumOrNull(r.school_id),
    name: r.name,
    curriculumId: toNumOrNull(r.curriculum_id),
    programId: toNumOrNull(r.program_id),
    classLevel: r.class_level,
    headTeacherId: toNumOrNull(r.head_teacher_id),
    capacity: r.capacity,
    code: r.code,
    level: r.level,
    nameAr: r.name_ar,
    createdAt,
    updatedAt: toIsoRequired(r.updated_at, createdAt),
    deletedAt: toIso(r.deleted_at),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT id, school_id, name, curriculum_id, program_id, class_level, head_teacher_id,
                             capacity, code, level, name_ar, created_at, updated_at, deleted_at,
                             deleted_by, delete_reason, restored_at, restored_by
                        FROM classes`;

async function findById(schoolId: number, id: number): Promise<ClassRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as ClassRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlClassRepo(): ClassRepo {
  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY name ASC LIMIT ${limit}`,
        [schoolId],
      )) as ClassRow[];
      return rows.map(toRecord);
    },

    async create(input: NewClassInput) {
      const res = (await query(
        `INSERT INTO classes (school_id, name, curriculum_id, program_id, class_level, head_teacher_id, capacity, code, level, name_ar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId ?? null, input.name, input.curriculumId ?? null, input.programId ?? null,
          input.classLevel ?? null, input.headTeacherId ?? null, input.capacity ?? null,
          input.code ?? null, input.level ?? null, input.nameAr ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      // Fetch by id alone, not findById(schoolId, id) — input.schoolId can
      // legitimately be null (the real DDL allows it), and findById's
      // `AND school_id = ?` would then never match a NULL column even for
      // the row that was just correctly created.
      const rows = (await query(`${BASE_SELECT} WHERE id = ? LIMIT 1`, [res.insertId])) as ClassRow[];
      if (!rows.length) throw new RepoError('Class vanished immediately after insert', 'NOT_FOUND');
      return toRecord(rows[0]);
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
      await query(
        `UPDATE classes SET school_id=?, name=?, curriculum_id=?, program_id=?, class_level=?, head_teacher_id=?,
                capacity=?, code=?, level=?, name_ar=?
          WHERE id = ? AND school_id = ?`,
        [
          merged.schoolId ?? null, merged.name, merged.curriculumId ?? null, merged.programId ?? null,
          merged.classLevel ?? null, merged.headTeacherId ?? null, merged.capacity ?? null,
          merged.code ?? null, merged.level ?? null, merged.nameAr ?? null, id, schoolId,
        ],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Class ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE classes SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Class ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE classes SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Class ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Class ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
