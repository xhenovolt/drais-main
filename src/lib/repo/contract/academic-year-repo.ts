/**
 * @drais/repo-contract — AcademicYearRepo interface.
 * Same CRUD shape as SubjectRepo/ClassRepo. Note types.ts's header on
 * AcademicYearRecord — the real table has neither created_at nor
 * updated_at, unlike every other repo in this layer.
 */
import type { AcademicYearRecord, NewAcademicYearInput, SoftDeleteOptions, ListOptions } from './types';

export interface AcademicYearRepo {
  findById(schoolId: number, id: number): Promise<AcademicYearRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<AcademicYearRecord[]>;
  create(input: NewAcademicYearInput): Promise<AcademicYearRecord>;
  update(schoolId: number, id: number, patch: Partial<NewAcademicYearInput>): Promise<AcademicYearRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<AcademicYearRecord>;
}
