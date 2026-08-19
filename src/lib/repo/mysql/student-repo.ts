/**
 * @drais/repo-mysql — StudentRepo, MySQL/TiDB implementation.
 * Thin wrapper over src/lib/db.ts's `query` — see school-repo.ts's header
 * for the isolation rule this follows. Every method takes `schoolId`
 * explicitly and puts it in the WHERE clause, matching the online app's
 * existing tenant-isolation pattern (3,662 school_id references) exactly —
 * this repo does not change that model, it formalizes it.
 */
import { query } from '@/lib/db';
import type { StudentRepo } from '../contract/student-repo';
import type { StudentRecord, NewStudentInput, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoDate, toIsoRequired, toNum, toNumOrNull } from './util';

interface StudentRow {
  id: number | string;
  school_id: number | string;
  person_id: number | string;
  admission_no: string | null;
  village_id: number | string | null;
  admission_date: string | Date | null;
  status: string | null;
  notes: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
}

function toRecord(r: StudentRow): StudentRecord {
  // created_at/updated_at can genuinely be NULL in real production rows
  // (see toIsoRequired's header) — updated_at falls back to created_at,
  // created_at falls back to the sentinel. Order matters: compute
  // createdAt first so updatedAt's fallback is the real value when one
  // exists, not the sentinel.
  const createdAt = toIsoRequired(r.created_at);
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    personId: toNum(r.person_id),
    admissionNo: r.admission_no,
    villageId: toNumOrNull(r.village_id),
    admissionDate: toIsoDate(r.admission_date),
    // Real DDL: `status VARCHAR(20) DEFAULT 'active'`, no NOT NULL — a
    // real row can have NULL here (schema.ts's header). Falls back to
    // the column's own declared default, not an arbitrary guess.
    status: r.status ?? 'active',
    notes: r.notes,
    createdAt,
    updatedAt: toIsoRequired(r.updated_at, createdAt),
    deletedAt: toIso(r.deleted_at),
  };
}

const BASE_SELECT = `SELECT id, school_id, person_id, admission_no, village_id, admission_date,
                             status, notes, created_at, updated_at, deleted_at
                        FROM students`;

async function findById(schoolId: number, id: number): Promise<StudentRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as StudentRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlStudentRepo(): StudentRepo {
  return {
    findById,

    async findByAdmissionNo(schoolId, admissionNo) {
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? AND admission_no = ? LIMIT 1`,
        [schoolId, admissionNo],
      )) as StudentRow[];
      return rows.length ? toRecord(rows[0]) : null;
    },

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 100));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY id ASC LIMIT ${limit}`,
        [schoolId],
      )) as StudentRow[];
      return rows.map(toRecord);
    },

    async create(input: NewStudentInput) {
      const res = (await query(
        `INSERT INTO students (school_id, person_id, admission_no, village_id, admission_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId, input.personId, input.admissionNo ?? null, input.villageId ?? null,
          input.admissionDate ?? null, input.status ?? 'active', input.notes ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(input.schoolId, res.insertId);
      if (!created) throw new RepoError('Student vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Student ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewStudentInput = {
        schoolId,
        personId: patch.personId ?? existing.personId,
        admissionNo: patch.admissionNo ?? existing.admissionNo,
        villageId: patch.villageId ?? existing.villageId,
        admissionDate: patch.admissionDate ?? existing.admissionDate,
        status: patch.status ?? existing.status,
        notes: patch.notes ?? existing.notes,
      };
      await query(
        `UPDATE students SET person_id=?, admission_no=?, village_id=?, admission_date=?, status=?, notes=?
          WHERE id = ? AND school_id = ?`,
        [
          merged.personId, merged.admissionNo ?? null, merged.villageId ?? null,
          merged.admissionDate ?? null, merged.status ?? 'active', merged.notes ?? null,
          id, schoolId,
        ],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Student ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id) {
      const res = (await query(
        `UPDATE students SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Student ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },
  };
}
