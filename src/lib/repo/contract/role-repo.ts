/**
 * @drais/repo-contract — RoleRepo interface. Same CRUD shape as
 * ClassRepo/SubjectRepo — school_id is NOT NULL on the real table.
 */
import type { RoleRecord, NewRoleInput, SoftDeleteOptions, ListOptions } from './types';

export interface RoleRepo {
  findById(schoolId: number, id: number): Promise<RoleRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<RoleRecord[]>;
  create(input: NewRoleInput): Promise<RoleRecord>;
  update(schoolId: number, id: number, patch: Partial<NewRoleInput>): Promise<RoleRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<RoleRecord>;
}
