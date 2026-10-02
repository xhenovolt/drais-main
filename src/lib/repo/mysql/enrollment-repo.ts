/**
 * @drais/repo-mysql — EnrollmentRepo, MySQL/TiDB implementation.
 * See ../contract/enrollment-repo.ts's header for the read-only scope and
 * the join-based tenant-isolation reasoning (enrollments.school_id is
 * nullable on the real table — confirmed live — so scoping goes through
 * the student, not that column).
 */
import { query } from '@/lib/db';
import type { EnrollmentRepo } from '../contract/enrollment-repo';
import type { EnrollmentRecord, NewEnrollmentInput, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
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
  end_date: string | Date | null;
  end_reason: string | null;
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
    endDate: toIsoDate(r.end_date),
    endReason: r.end_reason,
    createdAt: toIso(r.created_at),
    deletedAt: toIso(r.deleted_at),
  };
}

const BASE_SELECT = `SELECT e.id, e.student_id, e.class_id, e.stream_id, e.academic_year_id, e.term_id,
                             e.status, e.enrollment_type, e.enrollment_date, e.end_date, e.end_reason,
                             e.created_at, e.deleted_at
                        FROM enrollments e
                        JOIN students s ON s.id = e.student_id`;

/** Shared by update()/end() — both need "does this enrollment exist AND
 *  belong to this school" before touching it, same join-based scoping
 *  every read method here already uses. */
async function findByIdScoped(schoolId: number, id: number): Promise<EnrollmentRecord | null> {
  const rows = (await query(
    `${BASE_SELECT} WHERE e.id = ? AND s.school_id = ? LIMIT 1`, [id, schoolId],
  )) as EnrollmentRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

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

    async create(schoolId, input: NewEnrollmentInput) {
      // The student must genuinely belong to this school — a bare
      // student_id with no school check would let a caller enroll a
      // student into a class under a DIFFERENT school than the one the
      // session is scoped to.
      const owns = (await query(`SELECT 1 FROM students WHERE id = ? AND school_id = ? LIMIT 1`, [input.studentId, schoolId])) as any[];
      if (!owns.length) throw new RepoError(`Student ${input.studentId} not found in school ${schoolId}`, 'NOT_FOUND');

      const res = (await query(
        `INSERT INTO enrollments (student_id, class_id, stream_id, academic_year_id, term_id, status, enrollment_type, enrollment_date)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
        [
          input.studentId, input.classId ?? null, input.streamId ?? null, input.academicYearId ?? null, input.termId ?? null,
          input.enrollmentType ?? 'standard', input.enrollmentDate ?? new Date().toISOString().slice(0, 10),
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findByIdScoped(schoolId, res.insertId);
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
      await query(
        `UPDATE enrollments SET class_id=?, stream_id=?, academic_year_id=?, term_id=?, enrollment_type=?, enrollment_date=?
          WHERE id = ?`,
        [merged.classId, merged.streamId, merged.academicYearId, merged.termId, merged.enrollmentType, merged.enrollmentDate, id],
      );
      const updated = await findByIdScoped(schoolId, id);
      if (!updated) throw new RepoError(`Enrollment ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async end(schoolId, id, endDate, endReason = null) {
      const existing = await findByIdScoped(schoolId, id);
      if (!existing) throw new RepoError(`Enrollment ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      await query(
        `UPDATE enrollments SET status = 'ended', end_date = ?, end_reason = ? WHERE id = ?`,
        [endDate, endReason, id],
      );
      const ended = await findByIdScoped(schoolId, id);
      if (!ended) throw new RepoError(`Enrollment ${id} vanished after end`, 'NOT_FOUND');
      return ended;
    },
  };
}
