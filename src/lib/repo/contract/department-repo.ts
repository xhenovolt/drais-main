/**
 * @drais/repo-contract — DepartmentRepo interface.
 * Same CRUD shape as ClassRepo/SubjectRepo — plain reference data, full
 * create/update/soft-delete/restore. See ./types.ts's header on
 * DepartmentRecord for why subject_groups has no repo in this layer.
 */
import type { DepartmentRecord, NewDepartmentInput, SoftDeleteOptions, ListOptions } from './types';

export interface DepartmentRepo {
  findById(schoolId: number, id: number): Promise<DepartmentRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<DepartmentRecord[]>;
  create(input: NewDepartmentInput): Promise<DepartmentRecord>;
  update(schoolId: number, id: number, patch: Partial<NewDepartmentInput>): Promise<DepartmentRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<DepartmentRecord>;
}
