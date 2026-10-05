/**
 * DRAIS — Server-Side RBAC Permission Checker  (src/lib/rbac.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 * Checks whether a user possesses a specific permission via their assigned roles.
 * Permissions flow:  user → user_roles → roles → role_permissions → permissions
 *
 * Usage:
 *   const can = await userCan(session.userId, session.schoolId, 'academics.results.update');
 *   if (!can) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 *
 * For admin-level checks, prefer using `isSuperAdmin` from SessionInfo first
 * (super_admin bypasses all permission gates).
 */
import { query } from '@/lib/db';
import { getDbMode } from '@/lib/db/db-mode';
import { NextResponse } from 'next/server';

/**
 * local-sqlite branch — Phase 7 sub-effort 36. `query()` (src/lib/db.ts)
 * throws a loud, deliberate error in this mode (see pools.ts's
 * assertMysqlMode) rather than silently talking to the wrong database —
 * every function below that used to call `query()` directly would crash
 * offline for any NON-super-admin user (a super-admin session already
 * short-circuits before reaching these, via requirePermission/
 * checkPermission's own `if (isSuperAdmin) return`, which is why this gap
 * went unnoticed through every prior sub-effort's own superadmin@albayan
 * verification account). Fixed once, centrally, here — not per-route —
 * since every future route gated by requirePermission/checkPermission/
 * checkAnyPermission depends on this same file. Same role→permission
 * schema, same wildcard/super-admin semantics, translated to a direct
 * local-sqlite query instead of going through query()/getConnection().
 */
async function offlineDb() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission check — single
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a user has a specific permission code (e.g. 'academics.results.update').
 * Super-admin check is NOT performed here — caller is responsible.
 */
export async function userCan(
  userId:   number,
  schoolId: number,
  code:     string,
): Promise<boolean> {
  if (getDbMode() === 'local-sqlite') {
    const db = await offlineDb();
    const superRow = db.prepare(
      `SELECT 1
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id   = ?
          AND (ur.school_id = ? OR ur.school_id IS NULL)
          AND ur.is_active  = 1
          AND r.is_active   = 1
          AND (
                r.is_super_admin = 1
             OR LOWER(r.slug) = 'super_admin'
             OR LOWER(TRIM(r.name)) IN ('super admin', 'superadmin')
          )
        LIMIT 1`
    ).get(userId, schoolId);
    if (superRow) return true;

    const { expandPermissionChain } = await import('./rbac/catalog');
    const chain = expandPermissionChain(code);
    const row = db.prepare(
      `SELECT 1
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p       ON rp.permission_id = p.id
       WHERE ur.user_id   = ?
         AND (ur.school_id = ? OR ur.school_id IS NULL)
         AND ur.is_active = 1
         AND p.is_active  = 1
         AND p.code IN (${chain.map(() => '?').join(',')})
       LIMIT 1`
    ).get(userId, schoolId, ...chain);
    return !!row;
  }

  // Defense in depth — if the user holds ANY role that is recognised as
  // super-admin (flag OR slug OR canonical name), they pass every
  // permission check without a permissions join. Mirrors the session
  // query in src/lib/auth.ts so callers cannot accidentally lock out
  // a super-admin by forgetting to pass isSuperAdmin=true.
  const superRows = await query(
    `SELECT 1
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id   = ?
        AND (ur.school_id = ? OR ur.school_id IS NULL)
        AND ur.is_active  = TRUE
        AND r.is_active   = TRUE
        AND (
              r.is_super_admin = TRUE
           OR LOWER(r.slug) = 'super_admin'
           OR LOWER(TRIM(r.name)) IN ('super admin', 'superadmin')
        )
      LIMIT 1`,
    [userId, schoolId],
  );
  if (superRows.length > 0) return true;

  // Wildcard-aware check. The user passes if they hold ANY of:
  //   - the exact requested code, OR
  //   - any prefix wildcard (e.g. academics.theology.* grants academics.theology.view), OR
  //   - the universal '*' grant.
  // Implemented via expandPermissionChain from the RBAC catalog so the
  // semantics stay in lock-step with the new authorize() helper.
  const { expandPermissionChain } = await import('./rbac/catalog');
  const chain = expandPermissionChain(code);
  const rows = await query(
    `SELECT 1
     FROM user_roles ur
     JOIN role_permissions rp ON ur.role_id = rp.role_id
     JOIN permissions p       ON rp.permission_id = p.id
     WHERE ur.user_id   = ?
       AND (ur.school_id = ? OR ur.school_id IS NULL)
       AND ur.is_active = TRUE
       AND p.is_active  = TRUE
       AND p.code IN (${chain.map(() => '?').join(',')})
     LIMIT 1`,
    [userId, schoolId, ...chain],
  );
  return rows.length > 0;
}

/**
 * Check multiple permission codes at once.
 * Returns a map of code → boolean.
 */
export async function userCanMany(
  userId:   number,
  schoolId: number,
  codes:    string[],
): Promise<Record<string, boolean>> {
  if (!codes.length) return {};

  if (getDbMode() === 'local-sqlite') {
    const db = await offlineDb();
    const rows = db.prepare(
      `SELECT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p       ON rp.permission_id = p.id
       WHERE ur.user_id   = ?
         AND ur.school_id = ?
         AND ur.is_active = 1
         AND p.code       IN (${codes.map(() => '?').join(',')})
         AND p.is_active  = 1`
    ).all(userId, schoolId, ...codes) as any[];
    const granted = new Set(rows.map((r: any) => r.code));
    return Object.fromEntries(codes.map(c => [c, granted.has(c)]));
  }

  const rows = await query(
    `SELECT p.code
     FROM user_roles ur
     JOIN role_permissions rp ON ur.role_id = rp.role_id
     JOIN permissions p       ON rp.permission_id = p.id
     WHERE ur.user_id   = ?
       AND ur.school_id = ?
       AND ur.is_active = TRUE
       AND p.code       IN (${codes.map(() => '?').join(',')})
       AND p.is_active  = TRUE`,
    [userId, schoolId, ...codes],
  );

  const granted = new Set(rows.map((r: any) => r.code));
  return Object.fromEntries(codes.map(c => [c, granted.has(c)]));
}

/**
 * Get all permissions for a user in a school.
 * Returns an array of permission codes.
 */
export async function getUserPermissions(
  userId:   number,
  schoolId: number,
): Promise<string[]> {
  if (getDbMode() === 'local-sqlite') {
    const db = await offlineDb();
    const rows = db.prepare(
      `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p       ON rp.permission_id = p.id
       WHERE ur.user_id   = ?
         AND ur.school_id = ?
         AND ur.is_active = 1
         AND p.is_active  = 1`
    ).all(userId, schoolId) as any[];
    return rows.map((r: any) => r.code);
  }

  const rows = await query(
    `SELECT DISTINCT p.code
     FROM user_roles ur
     JOIN role_permissions rp ON ur.role_id = rp.role_id
     JOIN permissions p       ON rp.permission_id = p.id
     WHERE ur.user_id   = ?
       AND ur.school_id = ?
       AND ur.is_active = TRUE
       AND p.is_active  = TRUE`,
    [userId, schoolId],
  );
  return rows.map((r: any) => r.code);
}

/**
 * Get all roles for a user in a school.
 * Returns array of { id, name, slug }.
 */
export async function getUserRoles(
  userId:   number,
  schoolId: number,
): Promise<Array<{ id: number; name: string; slug: string }>> {
  if (getDbMode() === 'local-sqlite') {
    const db = await offlineDb();
    return db.prepare(
      `SELECT r.id, r.name, r.slug
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id   = ?
         AND ur.school_id = ?
         AND ur.is_active = 1
         AND r.is_active  = 1`
    ).all(userId, schoolId) as any[];
  }

  const rows = await query(
    `SELECT r.id, r.name, r.slug
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id   = ?
       AND ur.school_id = ?
       AND ur.is_active = TRUE
       AND r.is_active  = TRUE`,
    [userId, schoolId],
  );
  return rows as any[];
}

/**
 * Check if user has a specific role (by slug).
 */
export async function userHasRole(
  userId:   number,
  schoolId: number,
  slug:     string,
): Promise<boolean> {
  if (getDbMode() === 'local-sqlite') {
    const db = await offlineDb();
    const row = db.prepare(
      `SELECT 1
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id   = ?
         AND ur.school_id = ?
         AND ur.is_active = 1
         AND r.slug       = ?
         AND r.is_active  = 1
       LIMIT 1`
    ).get(userId, schoolId, slug);
    return !!row;
  }

  const rows = await query(
    `SELECT 1
     FROM user_roles ur
     JOIN roles r ON ur.role_id = r.id
     WHERE ur.user_id   = ?
       AND ur.school_id = ?
       AND ur.is_active = TRUE
       AND r.slug       = ?
       AND r.is_active  = TRUE
     LIMIT 1`,
    [userId, schoolId, slug],
  );
  return rows.length > 0;
}

/**
 * Require a permission — throws a structured error if not granted.
 * Pass isSuperAdmin=true to skip the DB check.
 */
export async function requirePermission(
  userId:       number,
  schoolId:     number,
  code:         string,
  isSuperAdmin: boolean = false,
): Promise<void> {
  if (isSuperAdmin) return;
  const can = await userCan(userId, schoolId, code);
  if (!can) {
    const err: any = new Error(`Forbidden: missing permission '${code}'`);
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }
}

/**
 * Return-based permission check — returns a 403 NextResponse on failure, or null on success.
 * Use when you want to avoid try/catch:
 *   const denied = await checkPermission(userId, schoolId, 'staff.read', isSuperAdmin);
 *   if (denied) return denied;
 */
export async function checkPermission(
  userId:       number,
  schoolId:     number,
  code:         string,
  isSuperAdmin: boolean = false,
): Promise<NextResponse | null> {
  if (isSuperAdmin) return null;
  const can = await userCan(userId, schoolId, code);
  if (!can) {
    return NextResponse.json(
      { error: `Forbidden: missing permission '${code}'`, code: 'FORBIDDEN' },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Return-based "any of these permissions" check — 403 NextResponse, or null to proceed.
 *
 *   const denied = await checkAnyPermission(uid, sid, ['roles.manage', 'roles.role.create'], isSA);
 *   if (denied) return denied;
 *
 * WHY THIS EXISTS
 * ---------------
 * `userCan` expands a code through `expandPermissionChain`, but that chain only
 * ever widens to WILDCARDS — `roles.role.create` → `roles.role.*` → `roles.*` → `*`.
 * Measured against production: there are ZERO wildcard rows in `permissions`, so
 * the expansion currently matches nothing extra.
 *
 * That matters because the granular codes and the codes roles actually hold are
 * two different vocabularies. As of this commit:
 *
 *     roles.role.create / .update / .archive      granted to 0 roles
 *     roles.permission.sync                        granted to 0 roles
 *     staff.employment|qualifications|specializations.manage   0 roles
 *     departments.department.create / .archive     granted to 0 roles
 *     roles.manage                                 granted to 1 role  (3 users)
 *     departments.manage                           granted to 6 roles (4 users)
 *
 * Gating a route on the granular code alone would 403 every legitimate
 * non-super-admin holding the older coarse code. Accepting EITHER lets the
 * finer-grained vocabulary be adopted without a migration and without an
 * outage — and without inventing a second permission system, which is why this
 * lives in rbac.ts beside checkPermission rather than in a new module.
 *
 * Super-admins short-circuit, consistent with every other check here.
 */
export async function checkAnyPermission(
  userId:       number,
  schoolId:     number,
  codes:        string[],
  isSuperAdmin: boolean = false,
): Promise<NextResponse | null> {
  if (isSuperAdmin) return null;
  for (const code of codes) {
    if (await userCan(userId, schoolId, code)) return null;
  }
  return NextResponse.json(
    { error: `Forbidden: missing permission '${codes[0]}'`, code: 'FORBIDDEN' },
    { status: 403 },
  );
}

/**
 * Wrap an async route handler to catch RBAC/structured errors
 * and return proper HTTP status codes instead of 500.
 */
export function withErrorHandling(
  handler: (...args: any[]) => Promise<NextResponse>,
) {
  return async (...args: any[]): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err: any) {
      const status = err?.statusCode || 500;
      const code   = err?.code || 'INTERNAL_ERROR';
      const message = status === 500
        ? 'Internal server error'
        : err?.message || 'An error occurred';
      return NextResponse.json({ error: message, code }, { status });
    }
  };
}
