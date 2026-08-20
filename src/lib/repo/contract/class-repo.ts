/**
 * @drais/repo-contract — ClassRepo interface.
 * `classes` is CONFIGURATION/READ_ONLY_REFERENCE-leaning per §9, but kept
 * as a real repo (not a bare read-only lookup) because it's also the
 * tenant-isolation anchor class_results scopes through — see types.ts's
 * header on this sub-effort. softDelete/restore carry the richer
 * deleted_by/delete_reason/restored_at/restored_by audit trail this
 * table actually has (docs/PHASE_1_CRUD_TRASH_ARCHITECTURE.md), not the
 * simpler deleted_at-only shape used elsewhere in this repo layer.
 */
import type { ClassRecord, NewClassInput, SoftDeleteOptions, ListOptions } from './types';

export interface ClassRepo {
  findById(schoolId: number, id: number): Promise<ClassRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<ClassRecord[]>;
  create(input: NewClassInput): Promise<ClassRecord>;
  update(schoolId: number, id: number, patch: Partial<NewClassInput>): Promise<ClassRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<ClassRecord>;
}
