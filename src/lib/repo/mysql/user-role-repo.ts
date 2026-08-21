/**
 * @drais/repo-mysql — UserRoleRepo, MySQL/TiDB implementation.
 * No soft-delete audit trail on the real table — just is_active.
 */
import { query } from '@/lib/db';
import type { UserRoleRepo } from '../contract/user-role-repo';
import type { UserRoleRecord, NewUserRoleInput } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toNum, toNumOrNull } from './util';

interface UserRoleRow {
  id: number | string;
  user_id: number | string;
  role_id: number | string;
  is_active: number | null;
  assigned_by: number | string | null;
  assigned_at: string | Date | null;
  school_id: number | string | null;
}

function toRecord(r: UserRoleRow): UserRoleRecord {
  return {
    id: toNum(r.id),
    userId: toNum(r.user_id),
    roleId: toNum(r.role_id),
    isActive: r.is_active == null ? null : Boolean(r.is_active),
    assignedBy: toNumOrNull(r.assigned_by),
    assignedAt: toIso(r.assigned_at),
    schoolId: toNumOrNull(r.school_id),
  };
}

const BASE_SELECT = `SELECT id, user_id, role_id, is_active, assigned_by, assigned_at, school_id FROM user_roles`;

export function createMysqlUserRoleRepo(): UserRoleRepo {
  return {
    async listByUser(schoolId, userId) {
      const rows = (await query(
        `${BASE_SELECT} WHERE user_id = ? AND school_id = ? AND is_active = TRUE`,
        [userId, schoolId],
      )) as UserRoleRow[];
      return rows.map(toRecord);
    },

    async listByRole(schoolId, roleId) {
      const rows = (await query(
        `${BASE_SELECT} WHERE role_id = ? AND school_id = ? AND is_active = TRUE`,
        [roleId, schoolId],
      )) as UserRoleRow[];
      return rows.map(toRecord);
    },

    async assign(input: NewUserRoleInput) {
      const res = (await query(
        `INSERT INTO user_roles (user_id, role_id, is_active, assigned_by, school_id)
         VALUES (?, ?, ?, ?, ?)`,
        [input.userId, input.roleId, input.isActive ?? true, input.assignedBy ?? null, input.schoolId ?? null],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const rows = (await query(`${BASE_SELECT} WHERE id = ? LIMIT 1`, [res.insertId])) as UserRoleRow[];
      if (!rows.length) throw new RepoError('User-role assignment vanished immediately after insert', 'NOT_FOUND');
      return toRecord(rows[0]);
    },

    async revoke(userId, roleId) {
      const res = (await query(
        `UPDATE user_roles SET is_active = FALSE WHERE user_id = ? AND role_id = ? AND is_active = TRUE`,
        [userId, roleId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`No active assignment of role ${roleId} to user ${userId} to revoke`, 'NOT_FOUND');
    },
  };
}
