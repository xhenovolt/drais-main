/**
 * @drais/repo-sqlite — StudentRepo, SQLite implementation.
 * Mirrors mysql/student-repo.ts's contract exactly. schoolId is still
 * taken explicitly and filtered on in every query even though a real local
 * install's database holds exactly one school (§9) — the repo layer
 * doesn't get to assume that; it stays engine-agnostic and callers stay
 * identical whichever repo they're handed.
 */
import type { SqliteConnection } from './connection';
import type { StudentRepo } from '../contract/student-repo';
import type { StudentRecord, NewStudentInput, ListOptions, SoftDeleteOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface StudentRow {
  id: number;
  school_id: number;
  person_id: number;
  admission_no: string | null;
  village_id: number | null;
  admission_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: StudentRow): StudentRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    personId: r.person_id,
    admissionNo: r.admission_no,
    villageId: r.village_id,
    admissionDate: r.admission_date,
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

const BASE_SELECT = `SELECT id, school_id, person_id, admission_no, village_id, admission_date,
                             status, notes, created_at, updated_at, deleted_at,
                             deleted_by, delete_reason, restored_at, restored_by
                        FROM students`;

const nowIso = () => new Date().toISOString();

export function createSqliteStudentRepo(db: SqliteConnection): StudentRepo {
  const findById = async (schoolId: number, id: number): Promise<StudentRecord | null> => {
    const row = db.prepare(`${BASE_SELECT} WHERE id = ? AND school_id = ?`).get(id, schoolId) as StudentRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async findByAdmissionNo(schoolId, admissionNo) {
      const row = db.prepare(`${BASE_SELECT} WHERE school_id = ? AND admission_no = ?`)
        .get(schoolId, admissionNo) as StudentRow | undefined;
      return row ? toRecord(row) : null;
    },

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 100));
      const sql = opts.includeDeleted
        ? `${BASE_SELECT} WHERE school_id = ? ORDER BY id ASC LIMIT ?`
        : `${BASE_SELECT} WHERE school_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as StudentRow[];
      return rows.map(toRecord);
    },

    async create(input: NewStudentInput) {
      let insertId: number;
      try {
        const res = db.prepare(
          `INSERT INTO students (school_id, person_id, admission_no, village_id, admission_date, status, notes)
           VALUES (@schoolId, @personId, @admissionNo, @villageId, @admissionDate, @status, @notes)`,
        ).run({
          schoolId: input.schoolId,
          personId: input.personId,
          admissionNo: input.admissionNo ?? null,
          villageId: input.villageId ?? null,
          admissionDate: input.admissionDate ?? null,
          status: input.status ?? 'active',
          notes: input.notes ?? null,
        });
        insertId = Number(res.lastInsertRowid);
      } catch (err: any) {
        if (String(err?.code) === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(String(err?.message))) {
          throw new RepoError(`admission_no "${input.admissionNo}" is already in use`, 'DUPLICATE');
        }
        throw err;
      }
      const created = await findById(input.schoolId, insertId);
      if (!created) throw new RepoError('Student vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Student ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      // `!== undefined`, not `??`, for nullable fields — see
      // mysql/school-repo.ts's update() for why.
      const merged: NewStudentInput = {
        schoolId,
        personId: patch.personId ?? existing.personId,
        admissionNo: patch.admissionNo !== undefined ? patch.admissionNo : existing.admissionNo,
        villageId: patch.villageId !== undefined ? patch.villageId : existing.villageId,
        admissionDate: patch.admissionDate !== undefined ? patch.admissionDate : existing.admissionDate,
        status: patch.status ?? existing.status,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
      };
      db.prepare(
        `UPDATE students SET person_id=@personId, admission_no=@admissionNo, village_id=@villageId,
                admission_date=@admissionDate, status=@status, notes=@notes, updated_at=@updatedAt
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId,
        personId: merged.personId, admissionNo: merged.admissionNo ?? null, villageId: merged.villageId ?? null,
        admissionDate: merged.admissionDate ?? null, status: merged.status ?? 'active', notes: merged.notes ?? null,
        updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Student ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE students SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Student ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE students SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Student ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Student ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
