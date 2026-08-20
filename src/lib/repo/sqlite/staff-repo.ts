/**
 * @drais/repo-sqlite — StaffRepo, SQLite implementation.
 * Mirrors mysql/staff-repo.ts's contract exactly, including the excluded
 * payroll fields and the nullable (no created_at fallback) updatedAt.
 */
import type { SqliteConnection } from './connection';
import type { StaffRepo } from '../contract/staff-repo';
import type { StaffRecord, NewStaffInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface StaffRow {
  id: number;
  school_id: number;
  branch_id: number | null;
  person_id: number;
  staff_no: string | null;
  department_id: number | null;
  role_id: number | null;
  position: string | null;
  position_id: number | null;
  employment_type: StaffRecord['employmentType'];
  qualification: string | null;
  experience_years: number | null;
  hire_date: string | null;
  status: string | null;
  manager_id: number | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: StaffRow): StaffRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    branchId: r.branch_id,
    personId: r.person_id,
    staffNo: r.staff_no,
    departmentId: r.department_id,
    roleId: r.role_id,
    position: r.position,
    positionId: r.position_id,
    employmentType: r.employment_type,
    qualification: r.qualification,
    experienceYears: r.experience_years,
    hireDate: r.hire_date,
    status: r.status,
    managerId: r.manager_id,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `id, school_id, branch_id, person_id, staff_no, department_id, role_id, position,
                      position_id, employment_type, qualification, experience_years, hire_date, status,
                      manager_id, updated_at, deleted_at, deleted_by, delete_reason, restored_at, restored_by`;

const nowIso = () => new Date().toISOString();

export function createSqliteStaffRepo(db: SqliteConnection): StaffRepo {
  const findById = async (schoolId: number, id: number): Promise<StaffRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM staff WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as StaffRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async findByPersonId(schoolId, personId) {
      const row = db.prepare(
        `SELECT ${SELECT_COLS} FROM staff WHERE person_id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
      ).get(personId, schoolId) as StaffRow | undefined;
      return row ? toRecord(row) : null;
    },

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `SELECT ${SELECT_COLS} FROM staff WHERE school_id = ? ORDER BY staff_no ASC, id ASC LIMIT ?`
        : `SELECT ${SELECT_COLS} FROM staff WHERE school_id = ? AND deleted_at IS NULL ORDER BY staff_no ASC, id ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as StaffRow[];
      return rows.map(toRecord);
    },

    async create(input: NewStaffInput) {
      const res = db.prepare(
        `INSERT INTO staff (school_id, branch_id, person_id, staff_no, department_id, role_id, position,
                             position_id, employment_type, qualification, experience_years, hire_date, status, manager_id, updated_at)
         VALUES (@schoolId, @branchId, @personId, @staffNo, @departmentId, @roleId, @position,
                 @positionId, @employmentType, @qualification, @experienceYears, @hireDate, @status, @managerId, @updatedAt)`,
      ).run({
        schoolId: input.schoolId, branchId: input.branchId ?? null, personId: input.personId,
        staffNo: input.staffNo ?? null, departmentId: input.departmentId ?? null, roleId: input.roleId ?? null,
        position: input.position ?? null, positionId: input.positionId ?? null,
        employmentType: input.employmentType ?? null, qualification: input.qualification ?? null,
        experienceYears: input.experienceYears ?? null, hireDate: input.hireDate ?? null,
        status: input.status ?? null, managerId: input.managerId ?? null, updatedAt: nowIso(),
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM staff WHERE id = ?`)
        .get(Number(res.lastInsertRowid)) as StaffRow | undefined;
      if (!row) throw new RepoError('Staff row vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
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
      db.prepare(
        `UPDATE staff SET school_id=@schoolId, branch_id=@branchId, person_id=@personId, staff_no=@staffNo,
                department_id=@departmentId, role_id=@roleId, position=@position, position_id=@positionId,
                employment_type=@employmentType, qualification=@qualification, experience_years=@experienceYears,
                hire_date=@hireDate, status=@status, manager_id=@managerId, updated_at=@updatedAt
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId: merged.schoolId, branchId: merged.branchId ?? null, personId: merged.personId,
        staffNo: merged.staffNo ?? null, departmentId: merged.departmentId ?? null, roleId: merged.roleId ?? null,
        position: merged.position ?? null, positionId: merged.positionId ?? null,
        employmentType: merged.employmentType ?? null, qualification: merged.qualification ?? null,
        experienceYears: merged.experienceYears ?? null, hireDate: merged.hireDate ?? null,
        status: merged.status ?? null, managerId: merged.managerId ?? null, updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Staff ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE staff SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Staff ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE staff SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Staff ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Staff ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
