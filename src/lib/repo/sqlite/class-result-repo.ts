/**
 * @drais/repo-sqlite — ClassResultRepo, SQLite implementation.
 * Mirrors mysql/class-result-repo.ts's contract exactly, including the
 * join-through-classes tenant scoping (class_results has no school_id).
 */
import type { SqliteConnection } from './connection';
import type { ClassResultRepo } from '../contract/class-result-repo';
import type { ClassResultRecord, NewClassResultInput, SoftDeleteOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface ClassResultRow {
  id: number;
  student_id: number;
  class_id: number;
  subject_id: number;
  term_id: number | null;
  result_type_id: number;
  score: number | null;
  grade: string | null;
  remarks: string | null;
  academic_year_id: number | null;
  academic_type: ClassResultRecord['academicType'];
  program_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

function toRecord(r: ClassResultRow): ClassResultRecord {
  return {
    id: r.id,
    studentId: r.student_id,
    classId: r.class_id,
    subjectId: r.subject_id,
    termId: r.term_id,
    resultTypeId: r.result_type_id,
    score: r.score,
    grade: r.grade,
    remarks: r.remarks,
    academicYearId: r.academic_year_id,
    academicType: r.academic_type,
    programId: r.program_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `cr.id, cr.student_id, cr.class_id, cr.subject_id, cr.term_id, cr.result_type_id,
                      cr.score, cr.grade, cr.remarks, cr.academic_year_id, cr.academic_type, cr.program_id,
                      cr.created_at, cr.updated_at, cr.deleted_at, cr.deleted_by, cr.delete_reason,
                      cr.restored_at, cr.restored_by`;
const FROM_JOIN = `FROM class_results cr JOIN classes c ON c.id = cr.class_id`;

const nowIso = () => new Date().toISOString();

export function createSqliteClassResultRepo(db: SqliteConnection): ClassResultRepo {
  const findById = async (schoolId: number, id: number): Promise<ClassResultRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE cr.id = ? AND c.school_id = ?`)
      .get(id, schoolId) as ClassResultRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async findByStudentSubjectTerm(schoolId, studentId, classId, subjectId, termId, resultTypeId) {
      const termClause = termId == null ? 'cr.term_id IS NULL' : 'cr.term_id = ?';
      const params: unknown[] = [studentId, classId, subjectId, resultTypeId];
      if (termId != null) params.push(termId);
      params.push(schoolId);
      const row = db.prepare(
        `SELECT ${SELECT_COLS} ${FROM_JOIN}
          WHERE cr.student_id = ? AND cr.class_id = ? AND cr.subject_id = ? AND cr.result_type_id = ?
            AND ${termClause} AND c.school_id = ? AND cr.deleted_at IS NULL`,
      ).get(...params) as ClassResultRow | undefined;
      return row ? toRecord(row) : null;
    },

    async listByClassAndSubject(schoolId, classId, subjectId, termId) {
      const termClause = termId === undefined ? '' : termId === null ? 'AND cr.term_id IS NULL' : 'AND cr.term_id = ?';
      const params: unknown[] = [classId, subjectId, schoolId];
      if (termId !== undefined && termId !== null) params.push(termId);
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} ${FROM_JOIN}
          WHERE cr.class_id = ? AND cr.subject_id = ? AND c.school_id = ? ${termClause} AND cr.deleted_at IS NULL
          ORDER BY cr.student_id ASC`,
      ).all(...params) as ClassResultRow[];
      return rows.map(toRecord);
    },

    async create(input: NewClassResultInput) {
      const res = db.prepare(
        `INSERT INTO class_results (student_id, class_id, subject_id, term_id, result_type_id, score, grade, remarks, academic_year_id, academic_type, program_id)
         VALUES (@studentId, @classId, @subjectId, @termId, @resultTypeId, @score, @grade, @remarks, @academicYearId, @academicType, @programId)`,
      ).run({
        studentId: input.studentId, classId: input.classId, subjectId: input.subjectId, termId: input.termId ?? null,
        resultTypeId: input.resultTypeId, score: input.score ?? null, grade: input.grade ?? null,
        remarks: input.remarks ?? null, academicYearId: input.academicYearId ?? null,
        academicType: input.academicType ?? 'secular', programId: input.programId ?? null,
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE cr.id = ?`)
        .get(Number(res.lastInsertRowid)) as ClassResultRow | undefined;
      if (!row) throw new RepoError('Class result vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
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
      db.prepare(
        `UPDATE class_results SET student_id=@studentId, class_id=@classId, subject_id=@subjectId, term_id=@termId,
                result_type_id=@resultTypeId, score=@score, grade=@grade, remarks=@remarks,
                academic_year_id=@academicYearId, academic_type=@academicType, program_id=@programId, updated_at=@updatedAt
          WHERE id=@id AND class_id IN (SELECT id FROM classes WHERE school_id = @schoolId)`,
      ).run({
        id, schoolId, studentId: merged.studentId, classId: merged.classId, subjectId: merged.subjectId,
        termId: merged.termId ?? null, resultTypeId: merged.resultTypeId, score: merged.score ?? null,
        grade: merged.grade ?? null, remarks: merged.remarks ?? null, academicYearId: merged.academicYearId ?? null,
        academicType: merged.academicType ?? 'secular', programId: merged.programId ?? null, updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Class result ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE class_results SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND deleted_at IS NULL AND class_id IN (SELECT id FROM classes WHERE school_id = @schoolId)`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Class result ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE class_results SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND deleted_at IS NOT NULL AND class_id IN (SELECT id FROM classes WHERE school_id = @schoolId)`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Class result ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Class result ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
