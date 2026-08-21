/**
 * @drais/repo-contract — PermissionRepo interface.
 * Global platform catalog — no school_id parameter anywhere here, unlike
 * every other repo in this layer; confirmed live that the real table has
 * no school_id column at all.
 */
import type { PermissionRecord } from './types';

export interface PermissionRepo {
  findByCode(code: string): Promise<PermissionRecord | null>;
  listAll(): Promise<PermissionRecord[]>;
}
