/**
 * @drais/repo-mysql — DepartmentRepo, MySQL/TiDB implementation.
 * Thin wrapper over src/lib/db.ts's `query`, same shape as class-repo.ts.
 */
import { query } from '@/lib/db';
import type { DepartmentRepo } from '../contract/department-repo';
import type { DepartmentRecord, NewDepartmentInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoRequired, toNum, toNumOrNull } from './util';

interface DepartmentRow {
  id: number | string;
  school_id: number | string;
  name: string;
  name_ar: string | null;
  head_staff_id: number | string | null;
  description: string | null;
  subject_group_id: number | string | null;
  created_at: string | Date;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toRecord(r: DepartmentRow): DepartmentRecord {
  const createdAt = toIsoRequired(r.created_at);
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    name: r.name,
    nameAr: r.name_ar,
    headStaffId: toNumOrNull(r.head_staff_id),
    description: r.description,
    subjectGroupId: toNumOrNull(r.subject_group_id),
    createdAt,
    updatedAt: toIso(r.updated_at),
    deletedAt: toIso(r.deleted_at),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT id, school_id, name, name_ar, head_staff_id, description, subject_group_id,
                             created_at, updated_at, deleted_at, deleted_by, delete_reason, restored_at, restored_by
                        FROM departments`;

async function findById(schoolId: number, id: number): Promise<DepartmentRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as DepartmentRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlDepartmentRepo(): DepartmentRepo {
  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY name ASC LIMIT ${limit}`,
        [schoolId],
      )) as DepartmentRow[];
      return rows.map(toRecord);
    },

    async create(input: NewDepartmentInput) {
      const res = (await query(
        `INSERT INTO departments (school_id, name, name_ar, head_staff_id, description, subject_group_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.schoolId, input.name, input.nameAr ?? null, input.headStaffId ?? null, input.description ?? null, input.subjectGroupId ?? null],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(input.schoolId, res.insertId);
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
      await query(
        `UPDATE departments SET name=?, name_ar=?, head_staff_id=?, description=?, subject_group_id=?
          WHERE id = ? AND school_id = ?`,
        [merged.name, merged.nameAr ?? null, merged.headStaffId ?? null, merged.description ?? null, merged.subjectGroupId ?? null, id, schoolId],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Department ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE departments SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Department ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE departments SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Department ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Department ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
