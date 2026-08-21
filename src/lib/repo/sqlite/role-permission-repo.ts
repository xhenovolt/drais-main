/**
 * @drais/repo-sqlite — RolePermissionRepo, SQLite implementation.
 * Unlike the mysql side, the local schema DOES have a real
 * UNIQUE(role_id, permission_id) constraint (schema.ts's deliberate
 * addition — see its header) — INSERT OR IGNORE gives real idempotency
 * here without needing the mysql side's WHERE NOT EXISTS workaround.
 */
import type { SqliteConnection } from './connection';
import type { RolePermissionRepo } from '../contract/role-permission-repo';
import type { RolePermissionGrant } from '../contract/types';
import { RepoError } from '../contract/types';

export function createSqliteRolePermissionRepo(db: SqliteConnection): RolePermissionRepo {
  return {
    async listCodesByRole(roleId) {
      const rows = db.prepare(
        `SELECT p.code FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?`,
      ).all(roleId) as { code: string }[];
      return rows.map((r) => r.code);
    },

    async grant(roleId, permissionId) {
      db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`).run(roleId, permissionId);
      const row = db.prepare(
        `SELECT role_id, permission_id, created_at FROM role_permissions WHERE role_id = ? AND permission_id = ?`,
      ).get(roleId, permissionId) as { role_id: number; permission_id: number; created_at: string | null } | undefined;
      if (!row) throw new RepoError('Role-permission grant vanished immediately after insert', 'NOT_FOUND');
      const grant: RolePermissionGrant = { roleId: row.role_id, permissionId: row.permission_id, createdAt: row.created_at };
      return grant;
    },

    async revoke(roleId, permissionId) {
      const res = db.prepare(`DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?`).run(roleId, permissionId);
      if (!res.changes) throw new RepoError(`No grant of permission ${permissionId} to role ${roleId} to revoke`, 'NOT_FOUND');
    },
  };
}
