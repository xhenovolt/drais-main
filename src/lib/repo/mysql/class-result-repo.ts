/**
 * @drais/repo-mysql — ClassResultRepo, MySQL/TiDB implementation.
 *
 * class_results has NO school_id column (confirmed live, see types.ts's
 * header) — every method here JOINs through classes for tenant scoping,
 * exactly matching the real system's own pattern
 * (src/lib/nexus/tools.ts:195-198: `JOIN classes c ON c.id = cr.class_id
 * WHERE c.school_id = ?`). `score` is DECIMAL(5,2) — mysql2's
 * bigNumberStrings:true affects DECIMAL the same way it affects BIGINT
 * (src/lib/repo/mysql/util.ts's toNum/toNumOrNull header), so it needs
 * the identical string->number normalization already used for ids.
 */
import { query } from '@/lib/db';
import type { ClassResultRepo } from '../contract/class-result-repo';
import type { ClassResultRecord, NewClassResultInput, SoftDeleteOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoRequired, toNum, toNumOrNull } from './util';

interface ClassResultRow {
  id: number | string;
  student_id: number | string;
  class_id: number | string;
  subject_id: number | string;
  term_id: number | string | null;
  result_type_id: number | string;
  score: number | string | null;
  grade: string | null;
  remarks: string | null;
  academic_year_id: number | null;
  academic_type: ClassResultRecord['academicType'];
  program_id: number | string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toRecord(r: ClassResultRow): ClassResultRecord {
  const createdAt = toIsoRequired(r.created_at);
  return {
    id: toNum(r.id),
    studentId: toNum(r.student_id),
    classId: toNum(r.class_id),
    subjectId: toNum(r.subject_id),
    termId: toNumOrNull(r.term_id),
    resultTypeId: toNum(r.result_type_id),
    score: toNumOrNull(r.score),
    grade: r.grade,
    remarks: r.remarks,
    academicYearId: r.academic_year_id,
    academicType: r.academic_type,
    programId: toNumOrNull(r.program_id),
    createdAt,
    updatedAt: toIsoRequired(r.updated_at, createdAt),
    deletedAt: toIso(r.deleted_at),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT cr.id, cr.student_id, cr.class_id, cr.subject_id, cr.term_id, cr.result_type_id,
                             cr.score, cr.grade, cr.remarks, cr.academic_year_id, cr.academic_type, cr.program_id,
                             cr.created_at, cr.updated_at, cr.deleted_at, cr.deleted_by, cr.delete_reason,
                             cr.restored_at, cr.restored_by
                        FROM class_results cr
                        JOIN classes c ON c.id = cr.class_id`;

async function findById(schoolId: number, id: number): Promise<ClassResultRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE cr.id = ? AND c.school_id = ? LIMIT 1`, [id, schoolId])) as ClassResultRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlClassResultRepo(): ClassResultRepo {
  return {
    findById,

    async findByStudentSubjectTerm(schoolId, studentId, classId, subjectId, termId, resultTypeId) {
      const termClause = termId == null ? 'cr.term_id IS NULL' : 'cr.term_id = ?';
      const params: unknown[] = [studentId, classId, subjectId, resultTypeId, schoolId];
      if (termId != null) params.splice(4, 0, termId);
      const rows = (await query(
        `${BASE_SELECT}
          WHERE cr.student_id = ? AND cr.class_id = ? AND cr.subject_id = ? AND cr.result_type_id = ?
            AND ${termClause} AND c.school_id = ? AND cr.deleted_at IS NULL
          LIMIT 1`,
        params,
      )) as ClassResultRow[];
      return rows.length ? toRecord(rows[0]) : null;
    },

    async listByClassAndSubject(schoolId, classId, subjectId, termId) {
      const termClause = termId === undefined ? '' : termId === null ? 'AND cr.term_id IS NULL' : 'AND cr.term_id = ?';
      const params: unknown[] = [classId, subjectId, schoolId];
      // Must match the ternary's third branch exactly — a truthy check
      // here would wrongly skip a (real, if unlikely) termId of 0.
      if (termId !== undefined && termId !== null) params.push(termId);
      const rows = (await query(
        `${BASE_SELECT} WHERE cr.class_id = ? AND cr.subject_id = ? AND c.school_id = ? ${termClause} AND cr.deleted_at IS NULL
          ORDER BY cr.student_id ASC`,
        params,
      )) as ClassResultRow[];
      return rows.map(toRecord);
    },

    async create(input: NewClassResultInput) {
      const res = (await query(
        `INSERT INTO class_results (student_id, class_id, subject_id, term_id, result_type_id, score, grade, remarks, academic_year_id, academic_type, program_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.studentId, input.classId, input.subjectId, input.termId ?? null, input.resultTypeId,
          input.score ?? null, input.grade ?? null, input.remarks ?? null, input.academicYearId ?? null,
          input.academicType ?? 'secular', input.programId ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const rows = (await query(`${BASE_SELECT} WHERE cr.id = ? LIMIT 1`, [res.insertId])) as ClassResultRow[];
      if (!rows.length) throw new RepoError('Class result vanished immediately after insert', 'NOT_FOUND');
      return toRecord(rows[0]);
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Class result ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewClassResultInput = {
        studentId: patch.studentId ?? existing.studentId,
        classId: patch.classId ?? existing.classId,
        subjectId: patch.subjectId ?? existing.subjectId,
        termId: patch.termId !== undefined ? patch.termId : existing.termId,
        resultTypeId: patch.resultTypeId ?? existing.resultTypeId,
        score: patch.score !== undefined ? patch.score : existing.score,
        grade: patch.grade !== undefined ? patch.grade : existing.grade,
        remarks: patch.remarks !== undefined ? patch.remarks : existing.remarks,
        academicYearId: patch.academicYearId !== undefined ? patch.academicYearId : existing.academicYearId,
        academicType: patch.academicType ?? existing.academicType,
        programId: patch.programId !== undefined ? patch.programId : existing.programId,
      };
      // Scoped through the same classes JOIN, via a subquery — an UPDATE
      // statement can't repeat the JOIN's alias in its own WHERE the way
      // a SELECT can.
      await query(
        `UPDATE class_results SET student_id=?, class_id=?, subject_id=?, term_id=?, result_type_id=?, score=?,
                grade=?, remarks=?, academic_year_id=?, academic_type=?, program_id=?
          WHERE id = ? AND class_id IN (SELECT id FROM classes WHERE school_id = ?)`,
        [
          merged.studentId, merged.classId, merged.subjectId, merged.termId ?? null, merged.resultTypeId,
          merged.score ?? null, merged.grade ?? null, merged.remarks ?? null, merged.academicYearId ?? null,
          merged.academicType ?? 'secular', merged.programId ?? null, id, schoolId,
        ],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Class result ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE class_results SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?
          WHERE id = ? AND deleted_at IS NULL AND class_id IN (SELECT id FROM classes WHERE school_id = ?)`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Class result ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE class_results SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?
          WHERE id = ? AND deleted_at IS NOT NULL AND class_id IN (SELECT id FROM classes WHERE school_id = ?)`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Class result ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Class result ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
