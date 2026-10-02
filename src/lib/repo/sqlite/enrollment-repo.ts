/**
 * @drais/repo-sqlite — EnrollmentRepo, SQLite implementation.
 * Mirrors mysql/enrollment-repo.ts's contract exactly, including the
 * join-based tenant scoping (never a direct enrollments.school_id check).
 */
import type { SqliteConnection } from './connection';
import type { EnrollmentRepo } from '../contract/enrollment-repo';
import type { EnrollmentRecord, NewEnrollmentInput, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface EnrollmentRow {
  id: number;
  student_id: number;
  class_id: number | null;
  stream_id: number | null;
  academic_year_id: number | null;
  term_id: number | null;
  status: string | null;
  enrollment_type: string | null;
  enrollment_date: string | null;
  end_date: string | null;
  end_reason: string | null;
  created_at: string | null;
  deleted_at: string | null;
}

function toRecord(r: EnrollmentRow): EnrollmentRecord {
  return {
    id: r.id,
    studentId: r.student_id,
    classId: r.class_id,
    streamId: r.stream_id,
    academicYearId: r.academic_year_id,
    termId: r.term_id,
    status: r.status,
    enrollmentType: r.enrollment_type,
    enrollmentDate: r.enrollment_date,
    endDate: r.end_date,
    endReason: r.end_reason,
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
  };
}

const SELECT_COLS = `e.id, e.student_id, e.class_id, e.stream_id, e.academic_year_id, e.term_id,
                      e.status, e.enrollment_type, e.enrollment_date, e.end_date, e.end_reason,
                      e.created_at, e.deleted_at`;
const BASE_SELECT = `SELECT ${SELECT_COLS} FROM enrollments e JOIN students s ON s.id = e.student_id`;
const nowIso = () => new Date().toISOString();

export function createSqliteEnrollmentRepo(db: SqliteConnection): EnrollmentRepo {
  const findByIdScoped = async (schoolId: number, id: number): Promise<EnrollmentRecord | null> => {
    const row = db.prepare(`${BASE_SELECT} WHERE e.id = ? AND s.school_id = ?`).get(id, schoolId) as EnrollmentRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    async findActiveByStudentId(schoolId, studentId) {
      const row = db.prepare(
        `${BASE_SELECT}
          WHERE s.school_id = ? AND e.student_id = ? AND e.status = 'active' AND e.deleted_at IS NULL
          ORDER BY e.id DESC LIMIT 1`,
      ).get(schoolId, studentId) as EnrollmentRow | undefined;
      return row ? toRecord(row) : null;
    },

    async listByStudentId(schoolId, studentId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `${BASE_SELECT} WHERE s.school_id = ? AND e.student_id = ? ORDER BY e.id ASC LIMIT ?`
        : `${BASE_SELECT} WHERE s.school_id = ? AND e.student_id = ? AND e.deleted_at IS NULL ORDER BY e.id ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, studentId, limit) as EnrollmentRow[];
      return rows.map(toRecord);
    },

    async listActiveByClassId(schoolId, classId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 500));
      const rows = db.prepare(
        `${BASE_SELECT}
          WHERE s.school_id = ? AND e.class_id = ? AND e.status = 'active' AND e.deleted_at IS NULL
          ORDER BY e.id ASC LIMIT ?`,
      ).all(schoolId, classId, limit) as EnrollmentRow[];
      return rows.map(toRecord);
    },

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(100_000, opts.limit ?? 100_000));
      const sql = opts.includeDeleted
        ? `${BASE_SELECT} WHERE s.school_id = ? ORDER BY e.id ASC LIMIT ?`
        : `${BASE_SELECT} WHERE s.school_id = ? AND e.deleted_at IS NULL ORDER BY e.id ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as EnrollmentRow[];
      return rows.map(toRecord);
    },

    async create(schoolId, input: NewEnrollmentInput) {
      const owns = db.prepare(`SELECT 1 FROM students WHERE id = ? AND school_id = ?`).get(input.studentId, schoolId);
      if (!owns) throw new RepoError(`Student ${input.studentId} not found in school ${schoolId}`, 'NOT_FOUND');

      const res = db.prepare(
        `INSERT INTO enrollments (student_id, class_id, stream_id, academic_year_id, term_id, status, enrollment_type, enrollment_date)
         VALUES (@studentId, @classId, @streamId, @academicYearId, @termId, 'active', @enrollmentType, @enrollmentDate)`,
      ).run({
        studentId: input.studentId, classId: input.classId ?? null, streamId: input.streamId ?? null,
        academicYearId: input.academicYearId ?? null, termId: input.termId ?? null,
        enrollmentType: input.enrollmentType ?? 'standard', enrollmentDate: input.enrollmentDate ?? nowIso().slice(0, 10),
      });
      const created = await findByIdScoped(schoolId, Number(res.lastInsertRowid));
      if (!created) throw new RepoError('Enrollment vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findByIdScoped(schoolId, id);
      if (!existing) throw new RepoError(`Enrollment ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged = {
        classId: patch.classId !== undefined ? patch.classId : existing.classId,
        streamId: patch.streamId !== undefined ? patch.streamId : existing.streamId,
        academicYearId: patch.academicYearId !== undefined ? patch.academicYearId : existing.academicYearId,
        termId: patch.termId !== undefined ? patch.termId : existing.termId,
        enrollmentType: patch.enrollmentType !== undefined ? patch.enrollmentType : existing.enrollmentType,
        enrollmentDate: patch.enrollmentDate !== undefined ? patch.enrollmentDate : existing.enrollmentDate,
      };
      db.prepare(
        `UPDATE enrollments SET class_id=@classId, stream_id=@streamId, academic_year_id=@academicYearId,
                term_id=@termId, enrollment_type=@enrollmentType, enrollment_date=@enrollmentDate
          WHERE id=@id`,
      ).run({ id, ...merged });
      const updated = await findByIdScoped(schoolId, id);
      if (!updated) throw new RepoError(`Enrollment ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async end(schoolId, id, endDate, endReason = null) {
      const existing = await findByIdScoped(schoolId, id);
      if (!existing) throw new RepoError(`Enrollment ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      db.prepare(`UPDATE enrollments SET status = 'ended', end_date = ?, end_reason = ? WHERE id = ?`).run(endDate, endReason, id);
      const ended = await findByIdScoped(schoolId, id);
      if (!ended) throw new RepoError(`Enrollment ${id} vanished after end`, 'NOT_FOUND');
      return ended;
    },
  };
}
