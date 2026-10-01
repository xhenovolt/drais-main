/**
 * @drais/repo-sqlite — EnrollmentRepo, SQLite implementation.
 * Mirrors mysql/enrollment-repo.ts's contract exactly, including the
 * join-based tenant scoping (never a direct enrollments.school_id check).
 */
import type { SqliteConnection } from './connection';
import type { EnrollmentRepo } from '../contract/enrollment-repo';
import type { EnrollmentRecord, ListOptions } from '../contract/types';

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
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
  };
}

const SELECT_COLS = `e.id, e.student_id, e.class_id, e.stream_id, e.academic_year_id, e.term_id,
                      e.status, e.enrollment_type, e.enrollment_date, e.created_at, e.deleted_at`;
const BASE_SELECT = `SELECT ${SELECT_COLS} FROM enrollments e JOIN students s ON s.id = e.student_id`;

export function createSqliteEnrollmentRepo(db: SqliteConnection): EnrollmentRepo {
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
  };
}
