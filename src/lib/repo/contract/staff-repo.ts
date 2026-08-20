/**
 * @drais/repo-contract — StaffRepo interface.
 *
 * Unlike ClassRepo, both school_id and person_id are NOT NULL on the real
 * `staff` table — so findById can scope with a direct `WHERE school_id = ?`
 * (no join needed, no null-handling create()/findById() split like
 * classes needed). findByPersonId exists because "resolve the staff
 * record for this person" (report-card teacher names, the logged-in
 * user's own staff record) is a real, distinct lookup shape from
 * findById — person_id has no DB-level UNIQUE constraint on the real
 * table, so this returns the first non-deleted match, not a guaranteed
 * single row.
 *
 * softDelete/restore carry the same richer deleted_by/delete_reason/
 * restored_at/restored_by audit trail as classes/class_results
 * (docs/PHASE_1_CRUD_TRASH_ARCHITECTURE.md) — staff has it too.
 *
 * Deliberately excludes salary/bank_name/bank_account_no/nssf_no/tin_no
 * — see types.ts's header on this sub-effort for why.
 */
import type { StaffRecord, NewStaffInput, SoftDeleteOptions, ListOptions } from './types';

export interface StaffRepo {
  findById(schoolId: number, id: number): Promise<StaffRecord | null>;
  findByPersonId(schoolId: number, personId: number): Promise<StaffRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<StaffRecord[]>;
  create(input: NewStaffInput): Promise<StaffRecord>;
  update(schoolId: number, id: number, patch: Partial<NewStaffInput>): Promise<StaffRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<StaffRecord>;
}
