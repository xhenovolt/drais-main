/**
 * @drais/repo-contract — ClassResultRepo interface.
 *
 * `class_results` is SYNCABLE, the brief's own named "enter academic
 * results" workflow, and one of §7's explicitly flagged HIGH-conflict-
 * risk tables ("same student × subject edited offline by different
 * teachers... last-write-wins is wrong; need merge UI for collisions").
 * MANUAL_REVIEW is the recorded conflict policy for this table (§12.3) —
 * nothing in THIS repo implements conflict resolution (that's sync,
 * roadmap Phase 10-11), but every method here takes schoolId explicitly
 * and enforces it via a join through classes, exactly like the real
 * system does, because class_results has no school_id of its own.
 */
import type { ClassResultRecord, NewClassResultInput, SoftDeleteOptions } from './types';

export interface ClassResultRepo {
  findById(schoolId: number, id: number): Promise<ClassResultRecord | null>;
  /** The natural key a real marks-entry screen queries by: one student's
   *  results for one subject/class/term/result-type combination. */
  findByStudentSubjectTerm(
    schoolId: number, studentId: number, classId: number, subjectId: number,
    termId: number | null, resultTypeId: number,
  ): Promise<ClassResultRecord | null>;
  listByClassAndSubject(schoolId: number, classId: number, subjectId: number, termId?: number | null): Promise<ClassResultRecord[]>;
  create(input: NewClassResultInput): Promise<ClassResultRecord>;
  update(schoolId: number, id: number, patch: Partial<NewClassResultInput>): Promise<ClassResultRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<ClassResultRecord>;
}
