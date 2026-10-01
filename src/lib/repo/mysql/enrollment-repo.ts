/**
 * @drais/repo-mysql — EnrollmentRepo, MySQL/TiDB implementation.
 * See ../contract/enrollment-repo.ts's header for the read-only scope and
 * the join-based tenant-isolation reasoning (enrollments.school_id is
 * nullable on the real table — confirmed live — so scoping goes through
 * the student, not that column).
 */
import { query } from '@/lib/db';
import type { EnrollmentRepo } from '../contract/enrollment-repo';
import type { EnrollmentRecord, ListOptions } from '../contract/types';
import { toIso, toIsoDate, toNum, toNumOrNull } from './util';

interface EnrollmentRow {
  id: number | string;
  student_id: number | string;
  class_id: number | string | null;
  stream_id: number | string | null;
  academic_year_id: number | string | null;
  term_id: number | string | null;
  status: string | null;
  enrollment_type: string | null;
  enrollment_date: string | Date | null;
  created_at: string | Date | null;
  deleted_at: string | Date | null;
}

function toRecord(r: EnrollmentRow): EnrollmentRecord {
  return {
    id: toNum(r.id),
    studentId: toNum(r.student_id),
    classId: toNumOrNull(r.class_id),
    streamId: toNumOrNull(r.stream_id),
    academicYearId: toNumOrNull(r.academic_year_id),
    termId: toNumOrNull(r.term_id),
    status: r.status,
    enrollmentType: r.enrollment_type,
    enrollmentDate: toIsoDate(r.enrollment_date),
    createdAt: toIso(r.created_at),
    deletedAt: toIso(r.deleted_at),
  };
}

const BASE_SELECT = `SELECT e.id, e.student_id, e.class_id, e.stream_id, e.academic_year_id, e.term_id,
                             e.status, e.enrollment_type, e.enrollment_date, e.created_at, e.deleted_at
                        FROM enrollments e
                        JOIN students s ON s.id = e.student_id`;

export function createMysqlEnrollmentRepo(): EnrollmentRepo {
  return {
    async findActiveByStudentId(schoolId, studentId) {
      const rows = (await query(
        `${BASE_SELECT}
          WHERE s.school_id = ? AND e.student_id = ? AND e.status = 'active' AND e.deleted_at IS NULL
          ORDER BY e.id DESC LIMIT 1`,
        [schoolId, studentId],
      )) as EnrollmentRow[];
      return rows.length ? toRecord(rows[0]) : null;
    },

    async listByStudentId(schoolId, studentId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND e.deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE s.school_id = ? AND e.student_id = ? ${deletedClause}
          ORDER BY e.id ASC LIMIT ${limit}`,
        [schoolId, studentId],
      )) as EnrollmentRow[];
      return rows.map(toRecord);
    },

    async listActiveByClassId(schoolId, classId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 500));
      const rows = (await query(
        `${BASE_SELECT}
          WHERE s.school_id = ? AND e.class_id = ? AND e.status = 'active' AND e.deleted_at IS NULL
          ORDER BY e.id ASC LIMIT ${limit}`,
        [schoolId, classId],
      )) as EnrollmentRow[];
      return rows.map(toRecord);
    },

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(100_000, opts.limit ?? 100_000));
      const deletedClause = opts.includeDeleted ? '' : 'AND e.deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE s.school_id = ? ${deletedClause} ORDER BY e.id ASC LIMIT ${limit}`,
        [schoolId],
      )) as EnrollmentRow[];
      return rows.map(toRecord);
    },
  };
}
