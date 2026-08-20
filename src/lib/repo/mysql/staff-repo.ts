/**
 * @drais/repo-mysql — StaffRepo, MySQL/TiDB implementation.
 *
 * Both school_id and person_id are NOT NULL on the real table, so unlike
 * class-repo.ts, findById/create can scope and re-fetch with a plain
 * `WHERE school_id = ?` — no nullable-school_id split needed.
 *
 * Deliberately does NOT select salary/bank_name/bank_account_no/
 * nssf_no/tin_no — see contract/types.ts's header on this sub-effort for
 * the security reasoning (repo-sqlite has no at-rest encryption yet).
 *
 * No created_at column on this table (confirmed live) — updatedAt is
 * read with plain toIso(), not toIsoRequired(), since there is no
 * created_at to fall back to and fabricating one would misrepresent a
 * genuinely-unknown history as a known timestamp.
 */
import { query } from '@/lib/db';
import type { StaffRepo } from '../contract/staff-repo';
import type { StaffRecord, NewStaffInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoDate, toNum, toNumOrNull } from './util';

interface StaffRow {
  id: number | string;
  school_id: number | string;
  branch_id: number | string | null;
  person_id: number | string;
  staff_no: string | null;
  department_id: number | string | null;
  role_id: number | string | null;
  position: string | null;
  position_id: number | string | null;
  employment_type: StaffRecord['employmentType'];
  qualification: string | null;
  experience_years: number | null;
  hire_date: string | Date | null;
  status: string | null;
  manager_id: number | string | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toRecord(r: StaffRow): StaffRecord {
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    branchId: toNumOrNull(r.branch_id),
    personId: toNum(r.person_id),
    staffNo: r.staff_no,
    departmentId: toNumOrNull(r.department_id),
    roleId: toNumOrNull(r.role_id),
    position: r.position,
    positionId: toNumOrNull(r.position_id),
    employmentType: r.employment_type,
    qualification: r.qualification,
    experienceYears: r.experience_years,
    hireDate: toIsoDate(r.hire_date),
    status: r.status,
    managerId: toNumOrNull(r.manager_id),
    updatedAt: toIso(r.updated_at),
    deletedAt: toIso(r.deleted_at),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT id, school_id, branch_id, person_id, staff_no, department_id, role_id,
                             position, position_id, employment_type, qualification, experience_years,
                             hire_date, status, manager_id, updated_at, deleted_at, deleted_by,
                             delete_reason, restored_at, restored_by
                        FROM staff`;

async function findById(schoolId: number, id: number): Promise<StaffRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as StaffRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlStaffRepo(): StaffRepo {
  return {
    findById,

    async findByPersonId(schoolId, personId) {
      const rows = (await query(
        `${BASE_SELECT} WHERE person_id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
        [personId, schoolId],
      )) as StaffRow[];
      return rows.length ? toRecord(rows[0]) : null;
    },

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY staff_no ASC, id ASC LIMIT ${limit}`,
        [schoolId],
      )) as StaffRow[];
      return rows.map(toRecord);
    },

    async create(input: NewStaffInput) {
      const res = (await query(
        `INSERT INTO staff (school_id, branch_id, person_id, staff_no, department_id, role_id, position,
                             position_id, employment_type, qualification, experience_years, hire_date, status, manager_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId, input.branchId ?? null, input.personId, input.staffNo ?? null,
          input.departmentId ?? null, input.roleId ?? null, input.position ?? null, input.positionId ?? null,
          input.employmentType ?? null, input.qualification ?? null, input.experienceYears ?? null,
          input.hireDate ?? null, input.status ?? null, input.managerId ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(input.schoolId, res.insertId);
      if (!created) throw new RepoError('Staff row vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Staff ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewStaffInput = {
        schoolId: patch.schoolId ?? existing.schoolId,
        personId: patch.personId ?? existing.personId,
        branchId: patch.branchId !== undefined ? patch.branchId : existing.branchId,
        staffNo: patch.staffNo !== undefined ? patch.staffNo : existing.staffNo,
        departmentId: patch.departmentId !== undefined ? patch.departmentId : existing.departmentId,
        roleId: patch.roleId !== undefined ? patch.roleId : existing.roleId,
        position: patch.position !== undefined ? patch.position : existing.position,
        positionId: patch.positionId !== undefined ? patch.positionId : existing.positionId,
        employmentType: patch.employmentType !== undefined ? patch.employmentType : existing.employmentType,
        qualification: patch.qualification !== undefined ? patch.qualification : existing.qualification,
        experienceYears: patch.experienceYears !== undefined ? patch.experienceYears : existing.experienceYears,
        hireDate: patch.hireDate !== undefined ? patch.hireDate : existing.hireDate,
        status: patch.status !== undefined ? patch.status : existing.status,
        managerId: patch.managerId !== undefined ? patch.managerId : existing.managerId,
      };
      await query(
        `UPDATE staff SET school_id=?, branch_id=?, person_id=?, staff_no=?, department_id=?, role_id=?,
                position=?, position_id=?, employment_type=?, qualification=?, experience_years=?,
                hire_date=?, status=?, manager_id=?, updated_at=UTC_TIMESTAMP()
          WHERE id = ? AND school_id = ?`,
        [
          merged.schoolId, merged.branchId ?? null, merged.personId, merged.staffNo ?? null,
          merged.departmentId ?? null, merged.roleId ?? null, merged.position ?? null, merged.positionId ?? null,
          merged.employmentType ?? null, merged.qualification ?? null, merged.experienceYears ?? null,
          merged.hireDate ?? null, merged.status ?? null, merged.managerId ?? null, id, schoolId,
        ],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Staff ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE staff SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?, updated_at = UTC_TIMESTAMP()
          WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Staff ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE staff SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?, updated_at = UTC_TIMESTAMP()
          WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Staff ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Staff ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
