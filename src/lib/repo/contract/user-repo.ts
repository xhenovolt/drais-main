/**
 * @drais/repo-contract — UserRepo interface.
 * findByEmail exists because that's the real login lookup key
 * (src/app/api/auth/login/route.ts's actual WHERE clause) — findById alone
 * would not cover the one query offline login would actually need first.
 *
 * NOTED DESIGN DIFFERENCE, not an oversight: the real online login route
 * looks up by email GLOBALLY (`WHERE u.email = ? AND u.deleted_at IS
 * NULL`, no school_id at all) — it discovers which school a user belongs
 * to FROM the result, since one email can only ever belong to one user
 * platform-wide. findByEmail here still takes schoolId first, like every
 * other method in this repo layer, because a local SQLite install holds
 * exactly one school (§9) and always knows its own school_id upfront —
 * unlike the online multi-tenant case, a local install isn't discovering
 * "which school" from the login attempt, it already knows. Consistent
 * with this layer's tenant-isolation discipline everywhere else, at the
 * cost of not being a literal drop-in replacement for online's own query.
 */
import type { UserRecord, NewUserInput, SoftDeleteOptions, ListOptions } from './types';

export interface UserRepo {
  findById(schoolId: number, id: number): Promise<UserRecord | null>;
  findByEmail(schoolId: number, email: string): Promise<UserRecord | null>;
  listBySchool(schoolId: number, opts?: ListOptions): Promise<UserRecord[]>;
  create(input: NewUserInput): Promise<UserRecord>;
  update(schoolId: number, id: number, patch: Partial<NewUserInput>): Promise<UserRecord>;
  softDelete(schoolId: number, id: number, opts?: SoftDeleteOptions): Promise<void>;
  restore(schoolId: number, id: number, restoredBy?: number | null): Promise<UserRecord>;
}
