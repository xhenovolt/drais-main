/**
 * Centralised authorization engine.
 *
 * One function. Use this from every API route. Replaces ad-hoc combinations
 * of `requirePermission`, `userCan`, `checkPermission`, and inline session
 * checks. Backwards-compat shims in `src/lib/rbac.ts` continue to work but
 * now delegate here.
 *
 * Features:
 *   * Super-admin absolute bypass (recognises flag OR slug OR canonical name)
 *   * Wildcard / hierarchy expansion: `academics.theology.*` covers
 *     `academics.theology.view`, `academics.theology.manage`, etc.
 *     `*` is the universal grant (super-admin only).
 *   * School-scoped — every check honours the caller's school.
 *   * Structured result — never throws. Callers decide how to respond.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { expandPermissionChain } from './catalog';
import type { SessionInfo } from '@/lib/auth';

export interface AuthorizeResult {
  allowed: boolean;
  /** Code that actually granted access (could be a wildcard ancestor). */
  matchedCode?: string;
  /** When denied, the originally-requested code. */
  deniedCode?: string;
  /** Human-readable reason; safe to surface to UI. */
  reason?: string;
}

const ALLOW: AuthorizeResult = { allowed: true };

/**
 * Core authorization check.
 *
 * @param session  The authenticated session (from getSessionSchoolId)
 * @param code     The permission code being requested (catalog or wildcard)
 */
export async function authorize(
  session: SessionInfo | null,
  code: string,
): Promise<AuthorizeResult> {
  if (!session) {
    return { allowed: false, deniedCode: code, reason: 'Not authenticated' };
  }
  if (session.isSuperAdmin) {
    return { ...ALLOW, matchedCode: '*' };
  }

  // Build the chain: requested code + every wildcard ancestor + '*'
  const chain = expandPermissionChain(code);

  // One query — does the user hold any permission in the chain?
  // The query also honours school scope on user_roles.
  const rows = (await query(
    `SELECT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p       ON rp.permission_id = p.id
      WHERE ur.user_id   = ?
        AND (ur.school_id = ? OR ur.school_id IS NULL)
        AND ur.is_active  = TRUE
        AND p.is_active   = TRUE
        AND p.code IN (${chain.map(() => '?').join(',')})
      LIMIT 1`,
    [session.userId, session.schoolId, ...chain],
  )) as Array<{ code: string }>;

  if (rows.length > 0) {
    return { ...ALLOW, matchedCode: rows[0].code };
  }
  return {
    allowed:    false,
    deniedCode: code,
    reason:     `Missing permission '${code}'`,
  };
}

/**
 * Convenience: check + throw on failure. Mirrors the existing
 * `requirePermission` contract for backwards compatibility.
 */
export async function requireAuthorize(
  session: SessionInfo | null,
  code: string,
): Promise<void> {
  const r = await authorize(session, code);
  if (r.allowed) return;
  const err: Error & { statusCode?: number; code?: string } = new Error(r.reason ?? 'Forbidden');
  err.statusCode = session ? 403 : 401;
  err.code       = session ? 'FORBIDDEN' : 'UNAUTHENTICATED';
  throw err;
}

/**
 * Return-based variant. Yields a NextResponse on failure, null on success.
 */
export async function checkAuthorize(
  session: SessionInfo | null,
  code: string,
): Promise<NextResponse | null> {
  const r = await authorize(session, code);
  if (r.allowed) return null;
  const status = session ? 403 : 401;
  return NextResponse.json(
    { error: r.reason, code: session ? 'FORBIDDEN' : 'UNAUTHENTICATED', deniedCode: r.deniedCode },
    { status },
  );
}

/**
 * Batch check — returns the matched code per requested code, or null.
 * Useful for the admin UI's "effective permissions" preview.
 */
export async function authorizeMany(
  session: SessionInfo | null,
  codes: string[],
): Promise<Record<string, AuthorizeResult>> {
  const out: Record<string, AuthorizeResult> = {};
  if (!session) {
    for (const c of codes) out[c] = { allowed: false, deniedCode: c, reason: 'Not authenticated' };
    return out;
  }
  if (session.isSuperAdmin) {
    for (const c of codes) out[c] = { ...ALLOW, matchedCode: '*' };
    return out;
  }

  // Collect every code in any chain, query once
  const allChain = new Set<string>();
  for (const c of codes) for (const link of expandPermissionChain(c)) allChain.add(link);
  const chainArr = Array.from(allChain);

  const rows = (await query(
    `SELECT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p       ON rp.permission_id = p.id
      WHERE ur.user_id  = ?
        AND (ur.school_id = ? OR ur.school_id IS NULL)
        AND ur.is_active  = TRUE
        AND p.is_active   = TRUE
        AND p.code IN (${chainArr.map(() => '?').join(',')})`,
    [session.userId, session.schoolId, ...chainArr],
  )) as Array<{ code: string }>;

  const held = new Set(rows.map(r => r.code));
  for (const c of codes) {
    const match = expandPermissionChain(c).find(link => held.has(link));
    out[c] = match
      ? { ...ALLOW, matchedCode: match }
      : { allowed: false, deniedCode: c, reason: `Missing permission '${c}'` };
  }
  return out;
}
