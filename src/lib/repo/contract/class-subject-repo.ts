/**
 * @drais/repo-contract — ClassSubjectRepo interface.
 * See ./types.ts's header on ClassSubjectRecord for the read-only scope
 * and the "active" simplification. The real table has NO school_id
 * column at all (confirmed live) — tenant scoping goes through
 * `class_subjects.class_id -> classes.id -> classes.school_id`, the same
 * join-based scoping class_results already established for this exact
 * reason.
 */
import type { ClassSubjectRecord } from './types';

export interface ClassSubjectRepo {
  /** Who currently teaches what in this class — status='active' AND not
   *  superseded. See types.ts's header: this is an approximation of
   *  "currently valid," not an evaluation of valid_from/valid_to. */
  listActiveByClassId(schoolId: number, classId: number): Promise<ClassSubjectRecord[]>;
  /** Every allocation for the school (active + inactive), for provisioning
   *  and bulk reads — same role listBySchool plays for EnrollmentRepo. */
  listBySchool(schoolId: number): Promise<ClassSubjectRecord[]>;
}
