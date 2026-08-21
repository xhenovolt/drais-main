/**
 * @drais/repo-contract — UserRoleRepo interface.
 * The real table has no soft-delete audit trail — just is_active — and the
 * meaningful operations are assign/revoke/list, not the usual CRUD shape.
 * listByUser is what login's role/permission resolution actually needs
 * first (src/app/api/auth/login/route.ts's `WHERE ur.user_id = ?` query).
 */
import type { UserRoleRecord, NewUserRoleInput } from './types';

export interface UserRoleRepo {
  listByUser(schoolId: number, userId: number): Promise<UserRoleRecord[]>;
  listByRole(schoolId: number, roleId: number): Promise<UserRoleRecord[]>;
  assign(input: NewUserRoleInput): Promise<UserRoleRecord>;
  revoke(userId: number, roleId: number): Promise<void>;
}
