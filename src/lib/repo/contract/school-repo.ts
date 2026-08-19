/**
 * @drais/repo-contract — SchoolRepo interface.
 * See ./types.ts and docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §8.
 *
 * `schools` is CONFIGURATION per the local data contract (§9): low-frequency
 * writes, admin-only, server-authoritative once a local install is
 * provisioned. This interface is deliberately narrow — enough to prove the
 * MySQL/SQLite parity pattern, not a full port of every school-settings
 * route.
 */
import type { SchoolRecord, NewSchoolInput } from './types';

export interface SchoolRepo {
  findById(id: number): Promise<SchoolRecord | null>;
  create(input: NewSchoolInput): Promise<SchoolRecord>;
  update(id: number, patch: Partial<NewSchoolInput>): Promise<SchoolRecord>;
  softDelete(id: number): Promise<void>;
}
