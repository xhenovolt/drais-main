/**
 * @drais/repo-contract — RolePermissionRepo interface.
 * A pure join — role_id+permission_id is the real key, no own `id` column
 * (confirmed live) — grant/revoke are the real operations, not
 * create/update/delete of a row with independent identity. Global, no
 * school_id (scoping happens via roles.school_id upstream of this).
 * listCodesByRole is what login's permission resolution actually needs
 * (src/app/api/auth/login/route.ts's role_permissions JOIN permissions
 * query) — returns the permission CODES directly, not raw grant rows,
 * since that's the shape every real caller wants.
 */
import type { RolePermissionGrant } from './types';

export interface RolePermissionRepo {
  listCodesByRole(roleId: number): Promise<string[]>;
  grant(roleId: number, permissionId: number): Promise<RolePermissionGrant>;
  revoke(roleId: number, permissionId: number): Promise<void>;
}
