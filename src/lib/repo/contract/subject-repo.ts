/**
 * @drais/repo-contract — SubjectRepo interface.
 * Same shape as ClassRepo — school_id is NOT NULL on the real table (no
 * nullable-school_id split needed), and subjects carries the same richer
 * deleted_by/delete_reason/restored_at/restored_by audit trail.
 */
import type { SubjectRecord, NewSubjectInput, SoftDeleteOptions, ListOptions } from './types';

export interface SubjectRepo {
  findById(schoolId: number, id: number): Promise<SubjectRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<SubjectRecord[]>;
  create(input: NewSubjectInput): Promise<SubjectRecord>;
  update(schoolId: number, id: number, patch: Partial<NewSubjectInput>): Promise<SubjectRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<SubjectRecord>;
}
