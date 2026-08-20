/**
 * @drais/repo-mysql — TermRepo, MySQL/TiDB implementation.
 * `id` is a plain INT on this table (not BIGINT), unlike almost every
 * other id in this codebase — harmless here since toNum() accepts either
 * a number or a numeric string, but noted because mysql2's
 * bigNumberStrings:true does NOT apply to INT, only BIGINT/DECIMAL, so
 * this column may already arrive as a real number rather than a string.
 * `is_active` is TINYINT(1) — same Boolean() normalization already used
 * for attendance_raw_events.matched.
 */
import { query } from '@/lib/db';
import type { TermRepo } from '../contract/term-repo';
import type { TermRecord, NewTermInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoDate, toNum, toNumOrNull } from './util';

interface TermRow {
  id: number | string;
  school_id: number | string;
  name: string;
  code: string | null;
  start_date: string | Date;
  end_date: string | Date;
  academic_year_id: number | string | null;
  is_active: number | null;
  term_number: number | null;
  status: string | null;
  notes: string | null;
  name_ar: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toRecord(r: TermRow): TermRecord {
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    name: r.name,
    nameAr: r.name_ar,
    code: r.code,
    startDate: toIsoDate(r.start_date) as string,
    endDate: toIsoDate(r.end_date) as string,
    academicYearId: toNumOrNull(r.academic_year_id),
    isActive: r.is_active == null ? null : Boolean(r.is_active),
    termNumber: r.term_number,
    status: r.status,
    notes: r.notes,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    deletedAt: toIso(r.deleted_at),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT id, school_id, name, code, start_date, end_date, academic_year_id, is_active,
                             term_number, status, notes, name_ar, created_at, updated_at, deleted_at,
                             deleted_by, delete_reason, restored_at, restored_by
                        FROM terms`;

async function findById(schoolId: number, id: number): Promise<TermRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as TermRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlTermRepo(): TermRepo {
  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY start_date ASC LIMIT ${limit}`,
        [schoolId],
      )) as TermRow[];
      return rows.map(toRecord);
    },

    async listByAcademicYear(schoolId, academicYearId) {
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? AND academic_year_id = ? AND deleted_at IS NULL ORDER BY start_date ASC`,
        [schoolId, academicYearId],
      )) as TermRow[];
      return rows.map(toRecord);
    },

    async create(input: NewTermInput) {
      const res = (await query(
        `INSERT INTO terms (school_id, name, code, start_date, end_date, academic_year_id, is_active, term_number, status, notes, name_ar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId, input.name, input.code ?? null, input.startDate, input.endDate,
          input.academicYearId ?? null, input.isActive == null ? null : (input.isActive ? 1 : 0),
          input.termNumber ?? null, input.status ?? null, input.notes ?? null, input.nameAr ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(input.schoolId, res.insertId);
      if (!created) throw new RepoError('Term vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Term ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewTermInput = {
        schoolId: patch.schoolId ?? existing.schoolId,
        name: patch.name ?? existing.name,
        nameAr: patch.nameAr !== undefined ? patch.nameAr : existing.nameAr,
        code: patch.code !== undefined ? patch.code : existing.code,
        startDate: patch.startDate ?? existing.startDate,
        endDate: patch.endDate ?? existing.endDate,
        academicYearId: patch.academicYearId !== undefined ? patch.academicYearId : existing.academicYearId,
        isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
        termNumber: patch.termNumber !== undefined ? patch.termNumber : existing.termNumber,
        status: patch.status !== undefined ? patch.status : existing.status,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
      };
      await query(
        `UPDATE terms SET school_id=?, name=?, code=?, start_date=?, end_date=?, academic_year_id=?,
                is_active=?, term_number=?, status=?, notes=?, name_ar=?
          WHERE id = ? AND school_id = ?`,
        [
          merged.schoolId, merged.name, merged.code ?? null, merged.startDate, merged.endDate,
          merged.academicYearId ?? null, merged.isActive == null ? null : (merged.isActive ? 1 : 0),
          merged.termNumber ?? null, merged.status ?? null, merged.notes ?? null, merged.nameAr ?? null,
          id, schoolId,
        ],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Term ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE terms SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Term ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE terms SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Term ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Term ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
