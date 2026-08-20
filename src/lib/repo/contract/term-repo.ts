/**
 * @drais/repo-contract — TermRepo interface.
 * Same shape as SubjectRepo/ClassRepo. listByAcademicYear exists because
 * "which terms make up this academic year" is a real, distinct lookup a
 * report-card/term-picker UI needs, not just findById/listBySchool.
 */
import type { TermRecord, NewTermInput, SoftDeleteOptions, ListOptions } from './types';

export interface TermRepo {
  findById(schoolId: number, id: number): Promise<TermRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<TermRecord[]>;
  listByAcademicYear(schoolId: number, academicYearId: number): Promise<TermRecord[]>;
  create(input: NewTermInput): Promise<TermRecord>;
  update(schoolId: number, id: number, patch: Partial<NewTermInput>): Promise<TermRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<TermRecord>;
}
