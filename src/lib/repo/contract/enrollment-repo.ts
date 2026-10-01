/**
 * @drais/repo-contract — EnrollmentRepo interface.
 * See ./types.ts's header on EnrollmentRecord for why this is read-only
 * and deliberately smaller than the real 26-column `enrollments` table.
 *
 * Every method takes schoolId explicitly and enforces it via the
 * student, never a direct `enrollments.school_id` check — that column is
 * nullable on the real table (confirmed live), so trusting it directly
 * would silently under-scope. Tenant isolation goes through
 * `enrollments.student_id -> students.id -> students.school_id`, the
 * same join-based scoping already established for `class_results`
 * (sub-effort 2's own notes).
 */
import type { EnrollmentRecord, ListOptions } from './types';

export interface EnrollmentRepo {
  /** The one enrollment to treat as "current" for this student — null if
   *  the student has no active enrollment at all. See types.ts's header
   *  on the tie-break when more than one active row exists. */
  findActiveByStudentId(schoolId: number, studentId: number): Promise<EnrollmentRecord | null>;
  /** Full history for a student (active + ended), oldest first. */
  listByStudentId(schoolId: number, studentId: number, opts?: ListOptions): Promise<EnrollmentRecord[]>;
  /** Everyone currently active in a given class — the other direction of
   *  the same relationship, needed for an academics/class-roster view. */
  listActiveByClassId(schoolId: number, classId: number, opts?: ListOptions): Promise<EnrollmentRecord[]>;
  /** Every enrollment row for the school (active + ended), for provisioning
   *  and bulk reads — not exposed by the two student/class-scoped methods
   *  above, which deliberately don't double as "list everything." */
  listBySchool(schoolId: number, opts?: ListOptions): Promise<EnrollmentRecord[]>;
}
