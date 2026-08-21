/**
 * @drais/repo-mysql — RolePermissionRepo, MySQL/TiDB implementation.
 * Pure join, no own id column (confirmed live) — role_id+permission_id
 * is the real key CONCEPTUALLY, but a live information_schema.STATISTICS
 * check found the real table has NO index or primary key at all, not even
 * an implicit one — so `ON DUPLICATE KEY UPDATE` would never fire (there's
 * no key to violate) and would silently insert a duplicate row on a
 * second grant() of the same pair. grant() below does an explicit
 * `WHERE NOT EXISTS` guard instead, real idempotency without assuming a
 * constraint the source schema doesn't actually have. Also means: if any
 * duplicate (role_id, permission_id) rows already exist in production,
 * a future provisioning pass copying this table needs to expect that,
 * not assume the pair is naturally unique. listCodesByRole mirrors the
 * actual JOIN src/app/api/auth/login/route.ts already runs
 * (role_permissions JOIN permissions), returning codes directly rather
 * than raw grant rows.
 */
import { query } from '@/lib/db';
import type { RolePermissionRepo } from '../contract/role-permission-repo';
import type { RolePermissionGrant } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso } from './util';

export function createMysqlRolePermissionRepo(): RolePermissionRepo {
  return {
    async listCodesByRole(roleId) {
      const rows = (await query(
        `SELECT p.code
           FROM role_permissions rp
           JOIN permissions p ON rp.permission_id = p.id
          WHERE rp.role_id = ?`,
        [roleId],
      )) as { code: string }[];
      return rows.map((r) => r.code);
    },

    async grant(roleId, permissionId) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT ?, ? WHERE NOT EXISTS (
           SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?
         )`, // real idempotency — see this file's header on why ON DUPLICATE KEY can't be used here
        [roleId, permissionId, roleId, permissionId],
      );
      const rows = (await query(
        `SELECT role_id, permission_id, created_at FROM role_permissions WHERE role_id = ? AND permission_id = ? LIMIT 1`,
        [roleId, permissionId],
      )) as { role_id: number | string; permission_id: number | string; created_at: string | Date | null }[];
      if (!rows.length) throw new RepoError('Role-permission grant vanished immediately after insert', 'NOT_FOUND');
      const r = rows[0];
      const grant: RolePermissionGrant = { roleId: Number(r.role_id), permissionId: Number(r.permission_id), createdAt: toIso(r.created_at) };
      return grant;
    },

    async revoke(roleId, permissionId) {
      const res = (await query(
        `DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?`,
        [roleId, permissionId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`No grant of permission ${permissionId} to role ${roleId} to revoke`, 'NOT_FOUND');
    },
  };
}
