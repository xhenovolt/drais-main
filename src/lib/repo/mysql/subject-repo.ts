/**
 * @drais/repo-mysql — SubjectRepo, MySQL/TiDB implementation.
 * Thin wrapper over src/lib/db.ts's `query`, same pattern as class-repo.ts.
 * school_id is NOT NULL on the real table, so findById/create scope with
 * a plain WHERE school_id = ? — no nullable-school_id split needed.
 */
import { query } from '@/lib/db';
import type { SubjectRepo } from '../contract/subject-repo';
import type { SubjectRecord, NewSubjectInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toNum, toNumOrNull } from './util';

interface SubjectRow {
  id: number | string;
  school_id: number | string;
  name: string;
  name_ar: string | null;
  code: string | null;
  subject_type: string | null;
  academic_type: SubjectRecord['academicType'];
  department_id: number | string | null;
  subject_group_id: number | string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toRecord(r: SubjectRow): SubjectRecord {
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    name: r.name,
    nameAr: r.name_ar,
    code: r.code,
    subjectType: r.subject_type,
    academicType: r.academic_type,
    departmentId: toNumOrNull(r.department_id),
    subjectGroupId: toNumOrNull(r.subject_group_id),
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    deletedAt: toIso(r.deleted_at),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT id, school_id, name, name_ar, code, subject_type, academic_type,
                             department_id, subject_group_id, created_at, updated_at, deleted_at,
                             deleted_by, delete_reason, restored_at, restored_by
                        FROM subjects`;

async function findById(schoolId: number, id: number): Promise<SubjectRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as SubjectRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlSubjectRepo(): SubjectRepo {
  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY name ASC LIMIT ${limit}`,
        [schoolId],
      )) as SubjectRow[];
      return rows.map(toRecord);
    },

    async create(input: NewSubjectInput) {
      const res = (await query(
        `INSERT INTO subjects (school_id, name, name_ar, code, subject_type, academic_type, department_id, subject_group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId, input.name, input.nameAr ?? null, input.code ?? null, input.subjectType ?? null,
          input.academicType ?? 'secular', input.departmentId ?? null, input.subjectGroupId ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(input.schoolId, res.insertId);
      if (!created) throw new RepoError('Subject vanished immediately after insert', 'NOT_FOUND');
      return created;
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
      await query(
        `UPDATE subjects SET school_id=?, name=?, name_ar=?, code=?, subject_type=?, academic_type=?,
                department_id=?, subject_group_id=?
          WHERE id = ? AND school_id = ?`,
        [
          merged.schoolId, merged.name, merged.nameAr ?? null, merged.code ?? null, merged.subjectType ?? null,
          merged.academicType ?? 'secular', merged.departmentId ?? null, merged.subjectGroupId ?? null, id, schoolId,
        ],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Subject ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE subjects SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Subject ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE subjects SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Subject ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Subject ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
