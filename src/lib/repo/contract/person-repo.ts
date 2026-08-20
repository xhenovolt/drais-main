/**
 * @drais/repo-contract — PersonRepo interface.
 * `people` is SYNCABLE per §9 — the identity table students/staff both
 * point at for a real name. Deliberately narrow (find/create/update/
 * soft-delete), matching SchoolRepo/StudentRepo's shape.
 */
import type { PersonRecord, NewPersonInput } from './types';

export interface PersonRepo {
  findById(id: number): Promise<PersonRecord | null>;
  create(input: NewPersonInput): Promise<PersonRecord>;
  update(id: number, patch: Partial<NewPersonInput>): Promise<PersonRecord>;
  softDelete(id: number): Promise<void>;
}
