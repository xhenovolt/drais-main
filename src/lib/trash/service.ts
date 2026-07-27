/**
 * Phase 1 — Trash management service.
 *
 * Reusable archive / restore / purge / list / dependencies engine over
 * the entity registry. Every destructive admin action in DRAIS should
 * route through these five functions so soft-delete, audit logging,
 * permission gates and dependency analysis are uniform.
 *
 * Source academic data is NEVER hard-deleted by `archiveEntity` — only
 * `deleted_at` flips. `purgeEntity` is the only path that physically
 * removes rows and it requires super-admin + explicit confirmation +
 * a non-blocking dependency check.
 */
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import {
  suspendEnrollmentsForRole,
  reactivateEnrollmentsForRole,
} from '@/lib/biometric/enrollment-service';
import {
  getEntityDescriptor,
  listEntityDescriptors,
  type DependencyRule,
  type EntityDescriptor,
} from './registry';

export interface TrashContext {
  schoolId:   number;
  userId:     number;
  ip?:        string | null;
  userAgent?: string | null;
}

export interface ArchiveArgs extends TrashContext {
  entity: string;
  id:     number;
  reason?: string | null;
}

export interface RestoreArgs extends TrashContext {
  entity: string;
  id:     number;
}

export interface PurgeArgs extends TrashContext {
  entity:       string;
  id:           number;
  confirmation: boolean;
}

export interface ListArgs {
  schoolId: number;
  entity?:  string;
  search?:  string;
  page?:    number;
  limit?:   number;
}

export interface DependenciesArgs {
  schoolId: number;
  entity:   string;
  id:       number;
}

export interface TrashRow {
  entity:           string;
  entityLabel:      string;
  id:               number;
  label:            string;
  subtitle:         string | null;
  deletedAt:        string;
  deletedBy:        number | null;
  deletedByName:    string | null;
  deleteReason:     string | null;
  restoredBefore:   boolean;
}

export interface DependencyReport {
  label:    string;
  count:    number;
  blocking: boolean;
}

/**
 * Domain error class. The API layer maps this to a structured 4xx JSON
 * response so callers never see a stack trace.
 */
export class TrashError extends Error {
  readonly statusCode: number;
  readonly code:       string;
  readonly detail:     Record<string, unknown> | null;

  constructor(code: string, message: string, statusCode = 400, detail: Record<string, unknown> | null = null) {
    super(message);
    this.name       = 'TrashError';
    this.code       = code;
    this.statusCode = statusCode;
    this.detail     = detail;
  }
}

function descriptorOrThrow(entity: string): EntityDescriptor {
  const d = getEntityDescriptor(entity);
  if (!d) {
    throw new TrashError('UNKNOWN_ENTITY', `Unknown entity code: ${entity}`, 400);
  }
  return d;
}

function toIso(v: string | Date | null): string | null {
  return v === null || v === undefined
    ? null
    : (typeof v === 'string' ? v : new Date(v).toISOString());
}

/**
 * Soft-delete the row. Idempotent against double-archive (the WHERE
 * deleted_at IS NULL guard means a second call returns 0 affectedRows
 * and we raise ALREADY_ARCHIVED).
 */
export async function archiveEntity(args: ArchiveArgs): Promise<{ id: number }> {
  const d = descriptorOrThrow(args.entity);
  const schoolFilter = d.schoolIdColumn ? `AND ${d.schoolIdColumn} = ?` : '';
  const schoolParams = d.schoolIdColumn ? [args.schoolId] : [];

  // Snapshot the pre-state for the audit log.
  const before = await fetchRow(d, args.id, args.schoolId);
  if (!before) {
    throw new TrashError('NOT_FOUND', `${d.label} not found`, 404);
  }
  if (before.deleted_at !== null) {
    throw new TrashError('ALREADY_ARCHIVED', `${d.label} is already archived`, 409);
  }

  const result = await query(
    `UPDATE \`${d.tableName}\`
        SET deleted_at    = NOW(),
            deleted_by    = ?,
            delete_reason = ?
      WHERE ${d.primaryKey} = ?
        ${schoolFilter}
        AND deleted_at IS NULL`,
    [args.userId, args.reason ?? null, args.id, ...schoolParams],
  ) as { affectedRows?: number };

  if (Number(result?.affectedRows ?? 0) === 0) {
    throw new TrashError('NOT_FOUND', `${d.label} not found`, 404);
  }

  const after = await fetchRow(d, args.id, args.schoolId);
  await logAudit({
    schoolId:   args.schoolId,
    userId:     args.userId,
    action:     `ARCHIVED_${d.code.toUpperCase()}`,
    entityType: d.code,
    entityId:   args.id,
    details:    { reason: args.reason ?? null, before, after },
    ip:         args.ip ?? null,
    userAgent:  args.userAgent ?? null,
  });

  // Biometric identity safety: a soft-deleted learner/staff must stop
  // being recognised on devices. Suspend (not revoke) their canonical
  // enrollments so a later restore can cleanly reactivate. Best-effort —
  // never let this block the archive itself.
  if (d.code === 'student' || d.code === 'staff') {
    try {
      await suspendEnrollmentsForRole(
        args.schoolId, d.code, args.id, 'person_archived', args.userId,
      );
    } catch (err) {
      console.warn('[trash] biometric suspend on archive failed (non-fatal):', err);
    }
  }

  return { id: args.id };
}

/**
 * Un-archive a row. Sets restored_at / restored_by; clears deleted_at.
 * Idempotent against double-restore (WHERE deleted_at IS NOT NULL).
 */
export async function restoreEntity(args: RestoreArgs): Promise<{ id: number }> {
  const d = descriptorOrThrow(args.entity);
  const schoolFilter = d.schoolIdColumn ? `AND ${d.schoolIdColumn} = ?` : '';
  const schoolParams = d.schoolIdColumn ? [args.schoolId] : [];

  const before = await fetchRow(d, args.id, args.schoolId);
  if (!before) {
    throw new TrashError('NOT_FOUND', `${d.label} not found`, 404);
  }
  if (before.deleted_at === null) {
    throw new TrashError('NOT_ARCHIVED', `${d.label} is not archived`, 409);
  }

  const result = await query(
    `UPDATE \`${d.tableName}\`
        SET deleted_at  = NULL,
            restored_at = NOW(),
            restored_by = ?
      WHERE ${d.primaryKey} = ?
        ${schoolFilter}
        AND deleted_at IS NOT NULL`,
    [args.userId, args.id, ...schoolParams],
  ) as { affectedRows?: number };

  if (Number(result?.affectedRows ?? 0) === 0) {
    throw new TrashError('NOT_FOUND', `${d.label} not found`, 404);
  }

  const after = await fetchRow(d, args.id, args.schoolId);
  await logAudit({
    schoolId:   args.schoolId,
    userId:     args.userId,
    action:     `RESTORED_${d.code.toUpperCase()}`,
    entityType: d.code,
    entityId:   args.id,
    details:    { before, after },
    ip:         args.ip ?? null,
    userAgent:  args.userAgent ?? null,
  });

  // Mirror of the archive hook: revive enrollments that were suspended
  // purely because this person was archived. Operator revokes and
  // reassignments are left untouched (different reason marker).
  if (d.code === 'student' || d.code === 'staff') {
    try {
      await reactivateEnrollmentsForRole(args.schoolId, d.code, args.id, args.userId);
    } catch (err) {
      console.warn('[trash] biometric reactivate on restore failed (non-fatal):', err);
    }
  }

  return { id: args.id };
}

/**
 * Permanently delete a row. Requires confirmation AND a dependency check
 * that no blocking references exist. Caller must enforce super-admin.
 */
export async function purgeEntity(args: PurgeArgs): Promise<{ id: number }> {
  const d = descriptorOrThrow(args.entity);

  if (args.confirmation !== true) {
    throw new TrashError(
      'CONFIRMATION_REQUIRED',
      'Permanent delete requires explicit confirmation',
      400,
    );
  }

  const before = await fetchRow(d, args.id, args.schoolId);
  if (!before) {
    throw new TrashError('NOT_FOUND', `${d.label} not found`, 404);
  }

  // Block purge while any blocking dependency has live (non-archived) rows.
  const deps = await getDependencies({
    schoolId: args.schoolId,
    entity:   args.entity,
    id:       args.id,
  });
  const blockers = deps.filter(dep => dep.blocking && dep.count > 0);
  if (blockers.length > 0) {
    throw new TrashError(
      'DEPENDENCIES_PRESENT',
      `Cannot purge: ${blockers.map(b => `${b.count} ${b.label}`).join(', ')} still reference this row`,
      409,
      { dependencies: deps },
    );
  }

  const schoolFilter = d.schoolIdColumn ? `AND ${d.schoolIdColumn} = ?` : '';
  const schoolParams = d.schoolIdColumn ? [args.schoolId] : [];

  const result = await query(
    `DELETE FROM \`${d.tableName}\`
      WHERE ${d.primaryKey} = ? ${schoolFilter}`,
    [args.id, ...schoolParams],
  ) as { affectedRows?: number };

  if (Number(result?.affectedRows ?? 0) === 0) {
    throw new TrashError('NOT_FOUND', `${d.label} not found`, 404);
  }

  await logAudit({
    schoolId:   args.schoolId,
    userId:     args.userId,
    action:     `PURGED_${d.code.toUpperCase()}`,
    entityType: d.code,
    entityId:   args.id,
    details:    { before, dependencies: deps },
    ip:         args.ip ?? null,
    userAgent:  args.userAgent ?? null,
  });

  return { id: args.id };
}

/**
 * Cross-entity archived-items list. If `entity` is supplied, restrict to
 * one type; otherwise union across every descriptor.
 *
 * Joins to users so the trash UI can show "archived by Jane Doe" without
 * a second round-trip.
 */
export async function listTrash(args: ListArgs): Promise<{
  items:     TrashRow[];
  total:     number;
  page:      number;
  limit:     number;
}> {
  const page  = Math.max(1, args.page ?? 1);
  const limit = Math.min(200, Math.max(1, args.limit ?? 50));
  const offset = (page - 1) * limit;

  const descriptors = args.entity
    ? [descriptorOrThrow(args.entity)]
    : listEntityDescriptors();

  const items: TrashRow[] = [];
  let total = 0;

  for (const d of descriptors) {
   try {
    const schoolFilter = d.schoolIdColumn
      ? `AND e.${d.schoolIdColumn} = ?`
      : '';
    const schoolParams = d.schoolIdColumn ? [args.schoolId] : [];
    let searchClause = '';
    const searchParams: unknown[] = [];
    if (args.search && d.searchPredicate) {
      const p = d.searchPredicate(args.search);
      searchClause = `AND ${p.sql}`;
      searchParams.push(...p.params);
    }

    const params = [...schoolParams, ...searchParams];

    // Count
    const countRows = await query(
      `SELECT COUNT(*) AS n
         FROM \`${d.tableName}\` e
         ${d.displayJoins ?? ''}
        WHERE e.deleted_at IS NOT NULL
          ${schoolFilter}
          ${searchClause}`,
      params,
    ) as Array<{ n: number }>;
    total += Number(countRows[0]?.n ?? 0);

    // Page rows
    const rows = await query(
      `SELECT ${d.displaySelect}
         FROM \`${d.tableName}\` e
         ${d.displayJoins ?? ''}
        WHERE e.deleted_at IS NOT NULL
          ${schoolFilter}
          ${searchClause}
        ORDER BY e.deleted_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    ) as Array<{
      id:            number;
      label:         string | null;
      subtitle:      string | null;
      deleted_at:    string | Date;
      deleted_by:    number | null;
      delete_reason: string | null;
      restored_at:   string | Date | null;
    }>;

    // Resolve "deleted_by" → display name in one extra query (small set).
    const userIds = Array.from(new Set(rows.map(r => r.deleted_by).filter((x): x is number => x !== null)));
    let nameById: Record<number, string> = {};
    if (userIds.length > 0) {
      const userRows = await query(
        `SELECT u.id, CONCAT_WS(' ', u.first_name, u.last_name) AS name
           FROM users u
          WHERE u.id IN (${userIds.map(() => '?').join(',')})`,
        userIds,
      ) as Array<{ id: number; name: string | null }>;
      nameById = Object.fromEntries(userRows.map(r => [r.id, r.name ?? `user #${r.id}`]));
    }

    for (const r of rows) {
      items.push({
        entity:         d.code,
        entityLabel:    d.label,
        id:             r.id,
        label:          r.label ?? `${d.label} #${r.id}`,
        subtitle:       r.subtitle,
        deletedAt:      toIso(r.deleted_at) ?? '',
        deletedBy:      r.deleted_by,
        deletedByName:  r.deleted_by !== null ? (nameById[r.deleted_by] ?? null) : null,
        deleteReason:   r.delete_reason,
        restoredBefore: r.restored_at !== null,
      });
    }
   } catch (err) {
    // RESILIENCE: a single misconfigured descriptor (e.g. a bad column) must
    // NEVER 500 the whole Trash — that once made the entire /admin/trash page
    // appear empty/broken. Skip the offending entity, keep the rest usable.
    console.error(`[trash] listTrash skipped entity '${d.code}':`, (err as Error)?.message);
   }
  }

  // Sort cross-entity by deletedAt desc for the unified view.
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return { items, total, page, limit };
}

/**
 * Dependency preview. Counts non-archived rows in each referencing table.
 * Used by the purge confirmation modal and as a hard gate inside purgeEntity.
 */
export async function getDependencies(args: DependenciesArgs): Promise<DependencyReport[]> {
  const d = descriptorOrThrow(args.entity);
  const reports: DependencyReport[] = [];
  for (const dep of d.dependencies) {
    const rows = await query(
      `SELECT COUNT(*) AS n
         FROM \`${dep.tableName}\`
        WHERE ${dep.fkColumn} = ?
          AND (deleted_at IS NULL OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name   = '${dep.tableName}'
               AND column_name  = 'deleted_at'
          ))`,
      [args.id],
    ).catch(async () => {
      // Some referencing tables lack deleted_at — fall back to raw count.
      return await query(
        `SELECT COUNT(*) AS n FROM \`${dep.tableName}\` WHERE ${dep.fkColumn} = ?`,
        [args.id],
      );
    }) as Array<{ n: number }>;
    reports.push({
      label:    dep.label,
      count:    Number(rows[0]?.n ?? 0),
      blocking: dep.blocking ?? false,
    });
  }
  return reports;
}

/** Internal helper — fetch the raw row by primary key for audit snapshots. */
async function fetchRow(
  d: EntityDescriptor,
  id: number,
  schoolId: number,
): Promise<Record<string, unknown> | null> {
  const schoolFilter = d.schoolIdColumn ? `AND ${d.schoolIdColumn} = ?` : '';
  const schoolParams = d.schoolIdColumn ? [schoolId] : [];
  const rows = await query(
    `SELECT * FROM \`${d.tableName}\`
      WHERE ${d.primaryKey} = ? ${schoolFilter}
      LIMIT 1`,
    [id, ...schoolParams],
  ) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

/**
 * Permission code lookup so API routes can call `requirePermission`
 * with the right code per entity / per action.
 */
export function getPermissionForAction(
  entity: string,
  action: 'archive' | 'restore' | 'purge',
): string {
  const d = descriptorOrThrow(entity);
  return d.permissions[action];
}
