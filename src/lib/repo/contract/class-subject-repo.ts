/**
 * @drais/repo-contract — ClassSubjectRepo interface.
 * See ./types.ts's header on ClassSubjectRecord for the "active"
 * simplification and sub-effort 19's bounded write capability. The real
 * table has NO school_id column at all (confirmed live) — tenant scoping
 * goes through `class_subjects.class_id -> classes.id -> classes.school_id`,
 * the same join-based scoping class_results already established for this
 * exact reason.
 */
import type { ClassSubjectRecord, NewClassSubjectInput } from './types';

export interface ClassSubjectRepo {
  /** Who currently teaches what in this class — status='active' AND not
   *  superseded. See types.ts's header: this is an approximation of
   *  "currently valid," not an evaluation of valid_from/valid_to. */
  listActiveByClassId(schoolId: number, classId: number): Promise<ClassSubjectRecord[]>;
  /** Every allocation for the school (active + inactive), for provisioning
   *  and bulk reads — same role listBySchool plays for EnrollmentRepo. */
  listBySchool(schoolId: number): Promise<ClassSubjectRecord[]>;
  /** CREATE — allocate a teacher/subject to a class as a new active row.
   *  Does not end any existing allocation for the same class+subject;
   *  the caller decides (co-teaching is a real, legitimate case). */
  create(schoolId: number, input: NewClassSubjectInput): Promise<ClassSubjectRecord>;
  /** UPDATE — correct an existing allocation's teacher/role/term in
   *  place, without ending it. */
  update(schoolId: number, id: number, patch: Partial<NewClassSubjectInput>): Promise<ClassSubjectRecord>;
  /** DELETE, in the sense this entity supports: mark the allocation
   *  inactive rather than erase it. */
  end(schoolId: number, id: number): Promise<ClassSubjectRecord>;
}
