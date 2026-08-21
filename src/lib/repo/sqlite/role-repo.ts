/**
 * @drais/repo-sqlite — RoleRepo, SQLite implementation.
 * Mirrors mysql/role-repo.ts's contract exactly. permissions (JSON column
 * online) is stored as TEXT here, stringified/parsed at this boundary.
 */
import type { SqliteConnection } from './connection';
import type { RoleRepo } from '../contract/role-repo';
import type { RoleRecord, NewRoleInput, SoftDeleteOptions, ListOptions } from '../contract/types';
import { RepoError } from '../contract/types';

interface RoleRow {
  id: number;
  school_id: number;
  name: string;
  slug: string | null;
  description: string | null;
  is_super_admin: number | null;
  is_active: number | null;
  is_system_role: number | null;
  permissions: string | null;
  hierarchy_level: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  deleted_by: number | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: number | null;
}

const toBoolOrNull = (v: number | null) => (v == null ? null : Boolean(v));
const toBit = (v: boolean | null | undefined) => (v == null ? null : v ? 1 : 0);
function parseJson(v: string | null): unknown | null {
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return null; }
}

function toRecord(r: RoleRow): RoleRecord {
  return {
    id: r.id,
    schoolId: r.school_id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    isSuperAdmin: toBoolOrNull(r.is_super_admin),
    isActive: toBoolOrNull(r.is_active),
    isSystemRole: toBoolOrNull(r.is_system_role),
    permissions: parseJson(r.permissions),
    hierarchyLevel: r.hierarchy_level,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    deletedAt: r.deleted_at,
    deletedBy: r.deleted_by,
    deleteReason: r.delete_reason,
    restoredAt: r.restored_at,
    restoredBy: r.restored_by,
  };
}

const SELECT_COLS = `id, school_id, name, slug, description, is_super_admin, is_active, is_system_role,
                      permissions, hierarchy_level, created_at, updated_at, deleted_at, deleted_by,
                      delete_reason, restored_at, restored_by`;

const nowIso = () => new Date().toISOString();

export function createSqliteRoleRepo(db: SqliteConnection): RoleRepo {
  const findById = async (schoolId: number, id: number): Promise<RoleRecord | null> => {
    const row = db.prepare(`SELECT ${SELECT_COLS} FROM roles WHERE id = ? AND school_id = ?`)
      .get(id, schoolId) as RoleRow | undefined;
    return row ? toRecord(row) : null;
  };

  return {
    findById,

    async listBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
      const sql = opts.includeDeleted
        ? `SELECT ${SELECT_COLS} FROM roles WHERE school_id = ? ORDER BY name ASC LIMIT ?`
        : `SELECT ${SELECT_COLS} FROM roles WHERE school_id = ? AND deleted_at IS NULL ORDER BY name ASC LIMIT ?`;
      const rows = db.prepare(sql).all(schoolId, limit) as RoleRow[];
      return rows.map(toRecord);
    },

    async create(input: NewRoleInput) {
      const res = db.prepare(
        `INSERT INTO roles (school_id, name, slug, description, is_super_admin, is_active, is_system_role, permissions, hierarchy_level)
         VALUES (@schoolId, @name, @slug, @description, @isSuperAdmin, @isActive, @isSystemRole, @permissions, @hierarchyLevel)`,
      ).run({
        schoolId: input.schoolId, name: input.name, slug: input.slug ?? null, description: input.description ?? null,
        isSuperAdmin: toBit(input.isSuperAdmin), isActive: toBit(input.isActive), isSystemRole: toBit(input.isSystemRole),
        permissions: input.permissions != null ? JSON.stringify(input.permissions) : null,
        hierarchyLevel: input.hierarchyLevel ?? null,
      });
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM roles WHERE id = ?`)
        .get(Number(res.lastInsertRowid)) as RoleRow | undefined;
      if (!row) throw new RepoError('Role vanished immediately after insert', 'NOT_FOUND');
      return toRecord(row);
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
      db.prepare(
        `UPDATE roles SET school_id=@schoolId, name=@name, slug=@slug, description=@description,
                is_super_admin=@isSuperAdmin, is_active=@isActive, is_system_role=@isSystemRole,
                permissions=@permissions, hierarchy_level=@hierarchyLevel, updated_at=@updatedAt
          WHERE id=@id AND school_id=@schoolId`,
      ).run({
        id, schoolId: merged.schoolId, name: merged.name, slug: merged.slug ?? null, description: merged.description ?? null,
        isSuperAdmin: toBit(merged.isSuperAdmin), isActive: toBit(merged.isActive), isSystemRole: toBit(merged.isSystemRole),
        permissions: merged.permissions != null ? JSON.stringify(merged.permissions) : null,
        hierarchyLevel: merged.hierarchyLevel ?? null, updatedAt: nowIso(),
      });
      const updated = await findById(schoolId, id);
      if (!updated) throw new RepoError(`Role ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async softDelete(schoolId, id, opts: SoftDeleteOptions = {}) {
      const res = db.prepare(
        `UPDATE roles SET deleted_at = @now, deleted_by = @deletedBy, delete_reason = @deleteReason, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NULL`,
      ).run({ id, schoolId, now: nowIso(), deletedBy: opts.deletedBy ?? null, deleteReason: opts.deleteReason ?? null });
      if (!res.changes) throw new RepoError(`Role ${id} not found in school ${schoolId} or already deleted`, 'NOT_FOUND');
    },

    async restore(schoolId, id, restoredBy = null) {
      const res = db.prepare(
        `UPDATE roles SET deleted_at = NULL, restored_at = @now, restored_by = @restoredBy, updated_at = @now
          WHERE id = @id AND school_id = @schoolId AND deleted_at IS NOT NULL`,
      ).run({ id, schoolId, now: nowIso(), restoredBy });
      if (!res.changes) throw new RepoError(`Role ${id} not found in school ${schoolId} or not deleted`, 'NOT_FOUND');
      const restored = await findById(schoolId, id);
      if (!restored) throw new RepoError(`Role ${id} vanished after restore`, 'NOT_FOUND');
      return restored;
    },
  };
}
