/**
 * @drais/repo-sqlite — PermissionRepo, SQLite implementation.
 * Global — no school_id parameter, matching the mysql implementation.
 */
import type { SqliteConnection } from './connection';
import type { PermissionRepo } from '../contract/permission-repo';
import type { PermissionRecord } from '../contract/types';

interface PermissionRow {
  id: number;
  code: string;
  module: string | null;
  resource: string | null;
  action: string | null;
  description: string | null;
  is_active: number | null;
  name: string | null;
  category: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function toRecord(r: PermissionRow): PermissionRecord {
  return {
    id: r.id,
    code: r.code,
    module: r.module,
    resource: r.resource,
    action: r.action,
    description: r.description,
    isActive: r.is_active == null ? null : Boolean(r.is_active),
    name: r.name,
    category: r.category,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_COLS = `id, code, module, resource, action, description, is_active, name, category, created_at, updated_at`;

export function createSqlitePermissionRepo(db: SqliteConnection): PermissionRepo {
  return {
    async findByCode(code) {
      const row = db.prepare(`SELECT ${SELECT_COLS} FROM permissions WHERE code = ?`).get(code) as PermissionRow | undefined;
      return row ? toRecord(row) : null;
    },

    async listAll() {
      const rows = db.prepare(`SELECT ${SELECT_COLS} FROM permissions ORDER BY module ASC, code ASC`).all() as PermissionRow[];
      return rows.map(toRecord);
    },
  };
}
