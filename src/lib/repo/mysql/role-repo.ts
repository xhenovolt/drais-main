/**
 * @drais/repo-mysql — RoleRepo, MySQL/TiDB implementation.
 * school_id is NOT NULL on the real table — plain WHERE school_id = ?
 * scoping, no nullable-school_id split needed.
 */
import { query } from '@/lib/db';
import type { RoleRepo } from '../contract/role-repo';
import type { RoleRecord, NewRoleInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';
import { toIso, toIsoRequired, toNum, toNumOrNull } from './util';

interface RoleRow {
  id: number | string;
  school_id: number | string;
  name: string;
  slug: string | null;
  description: string | null;
  is_super_admin: number | null;
  is_active: number | null;
  is_system_role: number | null;
  permissions: unknown;
  hierarchy_level: number | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
  deleted_at: string | Date | null;
  deleted_by: number | string | null;
  delete_reason: string | null;
  restored_at: string | Date | null;
  restored_by: number | string | null;
}

function toBoolOrNull(v: number | null): boolean | null {
  return v == null ? null : Boolean(v);
}

function toRecord(r: RoleRow): RoleRecord {
  const createdAt = toIsoRequired(r.created_at);
  return {
    id: toNum(r.id),
    schoolId: toNum(r.school_id),
    name: r.name,
    slug: r.slug,
    description: r.description,
    isSuperAdmin: toBoolOrNull(r.is_super_admin),
    isActive: toBoolOrNull(r.is_active),
    isSystemRole: toBoolOrNull(r.is_system_role),
    permissions: r.permissions ?? null,
    hierarchyLevel: r.hierarchy_level,
    createdAt,
    updatedAt: toIsoRequired(r.updated_at, createdAt),
    deletedAt: toIso(r.deleted_at),
    deletedBy: toNumOrNull(r.deleted_by),
    deleteReason: r.delete_reason,
    restoredAt: toIso(r.restored_at),
    restoredBy: toNumOrNull(r.restored_by),
  };
}

const BASE_SELECT = `SELECT id, school_id, name, slug, description, is_super_admin, is_active,
                             is_system_role, permissions, hierarchy_level, created_at, updated_at,
                             deleted_at, deleted_by, delete_reason, restored_at, restored_by
                        FROM roles`;

async function findById(schoolId: number, id: number): Promise<RoleRecord | null> {
  const rows = (await query(`${BASE_SELECT} WHERE id = ? AND school_id = ? LIMIT 1`, [id, schoolId])) as RoleRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlRoleRepo(): RoleRepo {
  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const deletedClause = opts.includeDeleted ? '' : 'AND deleted_at IS NULL';
      const rows = (await query(
        `${BASE_SELECT} WHERE school_id = ? ${deletedClause} ORDER BY name ASC LIMIT ${limit}`,
        [schoolId],
      )) as RoleRow[];
      return rows.map(toRecord);
    },

    async create(input: NewRoleInput) {
      const res = (await query(
        `INSERT INTO roles (school_id, name, slug, description, is_super_admin, is_active, is_system_role, permissions, hierarchy_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.schoolId, input.name, input.slug ?? null, input.description ?? null,
          input.isSuperAdmin ?? null, input.isActive ?? null, input.isSystemRole ?? null,
          input.permissions ? JSON.stringify(input.permissions) : null, input.hierarchyLevel ?? null,
        ],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findById(input.schoolId, res.insertId);
      if (!created) throw new RepoError('Role vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findById(schoolId, id);
      if (!existing) throw new RepoError(`Role ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged: NewRoleInput = {
        schoolId: patch.schoolId ?? existing.schoolId,
        name: patch.name ?? existing.name,
        slug: patch.slug !== undefined ? patch.slug : existing.slug,
        description: patch.description !== undefined ? patch.description : existing.description,
        isSuperAdmin: patch.isSuperAdmin !== undefined ? patch.isSuperAdmin : existing.isSuperAdmin,
        isActive: patch.isActive !== undefined ? patch.isActive : existing.isActive,
        isSystemRole: patch.isSystemRole !== undefined ? patch.isSystemRole : existing.isSystemRole,
        permissions: patch.permissions !== undefined ? patch.permissions : existing.permissions,
        hierarchyLevel: patch.hierarchyLevel !== undefined ? patch.hierarchyLevel : existing.hierarchyLevel,
      };
      await query(
        `UPDATE roles SET school_id=?, name=?, slug=?, description=?, is_super_admin=?, is_active=?,
                is_system_role=?, permissions=?, hierarchy_level=?
          WHERE id = ? AND school_id = ?`,
        [
          merged.schoolId, merged.name, merged.slug ?? null, merged.description ?? null,
          merged.isSuperAdmin ?? null, merged.isActive ?? null, merged.isSystemRole ?? null,
          merged.permissions ? JSON.stringify(merged.permissions) : null, merged.hierarchyLevel ?? null,
          id, schoolId,
        ],
      );
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Role ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = (await query(
        `UPDATE roles SET deleted_at = UTC_TIMESTAMP(), deleted_by = ?, delete_reason = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [opts.deletedBy ?? null, opts.deleteReason ?? null, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Role ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = (await query(
        `UPDATE roles SET deleted_at = NULL, restored_at = UTC_TIMESTAMP(), restored_by = ?
          WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`,
        [restoredBy, id, schoolId],
      )) as unknown as { affectedRows?: number };
      if (!res?.affectedRows) throw new RepoError(`Role ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Role ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
