/**
 * RBAC permission catalog sync engine.
 *
 * Reconciles `permissions` table with the declarative catalog in
 * `src/lib/rbac/catalog.ts`. Safe to run repeatedly — idempotent.
 *
 * Rules:
 *   * Catalog present, DB absent → INSERT (is_active=1)
 *   * Catalog present, DB inactive → UPDATE to is_active=1 + refresh metadata
 *   * Catalog present, DB active → UPDATE module/resource/action/description
 *     in place if they drift; otherwise no-op
 *   * Catalog absent, DB active → UPDATE is_active=0 (orphan; preserved for
 *     audit). role_permissions rows are NEVER touched.
 *   * Catalog absent, DB inactive → no-op
 *
 * Returns a structured diff for the admin UI.
 */
import { query } from '@/lib/db';
import { ALL_PERMISSION_CODES, PERMISSIONS } from './catalog';

export interface SyncReport {
  inserted:  string[];
  updated:   string[];
  activated: string[];
  orphaned:  string[];
  unchanged: number;
}

interface DbRow {
  code:        string;
  module:      string | null;
  resource:    string | null;
  action:      string | null;
  description: string | null;
  is_active:   number;
}

export async function syncPermissionCatalog(): Promise<SyncReport> {
  const dbRows = (await query(
    `SELECT code, module, resource, action, description, is_active FROM permissions`,
    [],
  )) as DbRow[];
  const byCode = new Map(dbRows.map(r => [r.code, r]));

  const report: SyncReport = {
    inserted: [], updated: [], activated: [], orphaned: [], unchanged: 0,
  };

  // Pass 1 — additions / updates / reactivations
  for (const code of ALL_PERMISSION_CODES) {
    const d = PERMISSIONS[code];
    const existing = byCode.get(code);

    if (!existing) {
      await query(
        `INSERT INTO permissions (code, module, resource, action, description, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [code, d.module, d.resource, d.action, d.description],
      );
      report.inserted.push(code);
      continue;
    }

    const driftedMeta =
      existing.module !== d.module ||
      existing.resource !== d.resource ||
      existing.action !== d.action ||
      (existing.description ?? '') !== d.description;
    const wasInactive = existing.is_active !== 1;

    if (driftedMeta || wasInactive) {
      await query(
        `UPDATE permissions
            SET module = ?, resource = ?, action = ?, description = ?, is_active = 1
          WHERE code = ?`,
        [d.module, d.resource, d.action, d.description, code],
      );
      if (wasInactive) report.activated.push(code);
      else             report.updated.push(code);
    } else {
      report.unchanged++;
    }
  }

  // Pass 2 — orphans (in DB, not in catalog)
  const catalogSet = new Set(ALL_PERMISSION_CODES);
  for (const row of dbRows) {
    if (catalogSet.has(row.code)) continue;
    if (row.is_active === 0)      continue;  // already orphaned
    await query(
      `UPDATE permissions SET is_active = 0 WHERE code = ?`,
      [row.code],
    );
    report.orphaned.push(row.code);
  }

  return report;
}
