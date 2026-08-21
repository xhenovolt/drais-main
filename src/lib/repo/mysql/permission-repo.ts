/**
 * @drais/repo-mysql — PermissionRepo, MySQL/TiDB implementation.
 * Global platform catalog — no school_id column at all (confirmed live).
 */
import { query } from '@/lib/db';
import type { PermissionRepo } from '../contract/permission-repo';
import type { PermissionRecord } from '../contract/types';
import { toIso, toNum } from './util';

interface PermissionRow {
  id: number | string;
  code: string;
  module: string | null;
  resource: string | null;
  action: string | null;
  description: string | null;
  is_active: number | null;
  name: string | null;
  category: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

function toRecord(r: PermissionRow): PermissionRecord {
  return {
    id: toNum(r.id),
    code: r.code,
    module: r.module,
    resource: r.resource,
    action: r.action,
    description: r.description,
    isActive: r.is_active == null ? null : Boolean(r.is_active),
    name: r.name,
    category: r.category,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

const BASE_SELECT = `SELECT id, code, module, resource, action, description, is_active, name, category,
                             created_at, updated_at
                        FROM permissions`;

export function createMysqlPermissionRepo(): PermissionRepo {
  return {
    async findByCode(code) {
      const rows = (await query(`${BASE_SELECT} WHERE code = ? LIMIT 1`, [code])) as PermissionRow[];
      return rows.length ? toRecord(rows[0]) : null;
    },

    async listAll() {
      const rows = (await query(`${BASE_SELECT} ORDER BY module ASC, code ASC`, [])) as PermissionRow[];
      return rows.map(toRecord);
    },
  };
}
