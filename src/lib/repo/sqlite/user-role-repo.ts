/**
 * @drais/repo-sqlite — UserRoleRepo, SQLite implementation.
 * Mirrors mysql/user-role-repo.ts's contract exactly.
 */
import type { SqliteConnection } from './connection';
import type { UserRoleRepo } from '../contract/user-role-repo';
import type { UserRoleRecord, NewUserRoleInput } from '../contract/types';
import { RepoError } from '../contract/types';

interface UserRoleRow {
  id: number;
  user_id: number;
  role_id: number;
  is_active: number | null;
  assigned_by: number | null;
  assigned_at: string | null;
  school_id: number | null;
}

function toRecord(r: UserRoleRow): UserRoleRecord {
  return {
    id: r.id,
    userId: r.user_id,
    roleId: r.role_id,
    isActive: r.is_active == null ? null : Boolean(r.is_active),
    assignedBy: r.assigned_by,
    assignedAt: r.assigned_at,
    schoolId: r.school_id,
  };
}

const SELECT_COLS = `id, user_id, role_id, is_active, assigned_by, assigned_at, school_id`;

export function createSqliteUserRoleRepo(db: SqliteConnection): UserRoleRepo {
  return {
    async listByUser(schoolId, userId) {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM user_roles WHERE user_id = ? AND school_id = ? AND is_active = 1`,
      ).all(userId, schoolId) as UserRoleRow[];
      return rows.map(toRecord);
    },

    async listByRole(schoolId, roleId) {
      const rows = db.prepare(
        `SELECT ${SELECT_COLS} FROM user_roles WHERE role_id = ? AND school_id = ? AND is_active = 1`,
      ).all(roleId, schoolId) as UserRoleRow[];
      return rows.map(toRecord);
    },

    async assign(input: NewUserRoleInput) {
      const res = db.prepare(
        `INSERT INTO user_roles (user_id, role_id, is_active, assigned_by, school_id)
         VALUES (@userId, @roleId, @isActive, @assignedBy, @schoolId)`,
      ).run({
        userId: input.userId, roleId: input.roleId,
        isActive: input.isActive === undefined ? 1 : (input.isActive ? 1 : 0),
        assignedBy: input.assignedBy ?? null, schoolId: input.schoolId ?? null,
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM user_roles WHERE id = ?`)
        .get(Number(res.lastInsertRowid)) as UserRoleRow | undefined;
      if (!row) throw new RepoError('User-role assignment vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
    },

    async revoke(userId, roleId) {
      const res = db.prepare(
        `UPDATE user_roles SET is_active = 0 WHERE user_id = ? AND role_id = ? AND is_active = 1`,
      ).run(userId, roleId);
      if (!res.changes) throw new RepoError(`No active assignment of role ${roleId} to user ${userId} to revoke`, 'NOT_FOUND');
    },
  };
}
