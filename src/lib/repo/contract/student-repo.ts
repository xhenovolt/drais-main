/**
 * @drais/repo-contract — StudentRepo interface.
 * See ./types.ts and docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §8.
 *
 * `students` is SYNCABLE, identity-critical per the local data contract
 * (§9) — the highest-conflict-risk category the audit names (§7: same
 * admission_no entered on two devices). Chosen as this phase's complex
 * proof case deliberately, not the easy one. Every method takes schoolId
 * explicitly (never inferred) — the MySQL implementation enforces it as a
 * WHERE clause the same way the online app's 3,662 school_id references
 * do; the SQLite implementation enforces it structurally, since a local
 * install's database contains exactly one school (§9's whole point).
 *
 * Deliberately excludes `people` (the join that supplies a student's
 * actual name) — out of scope for this proof-of-pattern slice. A real
 * StudentRepo consumer will need a PersonRepo alongside this one before
 * it's useful for anything beyond identity bookkeeping.
 */
import type { StudentRecord, NewStudentInput, ListOptions } from './types';

export interface StudentRepo {
  findById(schoolId: number, id: number): Promise<StudentRecord | null>;
  findByAdmissionNo(schoolId: number, admissionNo: string): Promise<StudentRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<StudentRecord[]>;
  create(input: NewStudentInput): Promise<StudentRecord>;
  update(schoolId: number, id: number, patch: Partial<NewStudentInput>): Promise<StudentRecord>;
  softDelete(schoolId: number, id: number): Promise<void>;
}
