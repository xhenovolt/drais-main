/**
 * Control Center request guard — one call per handler:
 *
 *   const g = await requireControl(req, 'schools.view');
 *   if (g.res) return g.res;
 *   const user = g.user;
 *
 * 401 when not signed in, 403 (naming the missing permission) when the operator
 * lacks it. Pass an array to accept ANY of several permissions.
 *
 * School scope: an operator limited to some schools (control_users.school_scope)
 * gets 404 for any other school's record, and lists are filtered with
 * `scopeClause`. A scoped operator never sees another school exists.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, type ControlUser } from '@/lib/control/auth';
import { controlCan, CONTROL_PERMISSIONS } from '@/lib/control/permissions';

export type GuardResult = { user: ControlUser; res?: undefined } | { user?: undefined; res: NextResponse };

export async function requireControl(req: NextRequest, permission?: string | string[]): Promise<GuardResult> {
  const user = await getControlSession(req);
  if (!user) return { res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const list = permission == null ? [] : Array.isArray(permission) ? permission : [permission];
  if (list.length && !list.some((p) => controlCan(user, p))) {
    const what = CONTROL_PERMISSIONS[list[0]] || list[0];
    return { res: NextResponse.json({ error: `You do not have permission for this: ${what.charAt(0).toLowerCase()}${what.slice(1)}`, permission: list[0] }, { status: 403 }) };
  }
  return { user };
}

/** True when the operator may see this school (no scope = every school). */
export function schoolInScope(user: ControlUser, schoolId: number | string | null | undefined): boolean {
  if (user.role === 'XHENVOLT_SUPER_ADMIN' || !user.schoolScope) return true;
  return schoolId != null && user.schoolScope.includes(Number(schoolId));
}

/** `AND <column> IN (…)` for a scoped operator, '' otherwise. */
export function scopeClause(user: ControlUser, column: string): { sql: string; params: number[] } {
  if (user.role === 'XHENVOLT_SUPER_ADMIN' || !user.schoolScope) return { sql: '', params: [] };
  if (!user.schoolScope.length) return { sql: ' AND 1 = 0', params: [] };
  return { sql: ` AND ${column} IN (${user.schoolScope.map(() => '?').join(',')})`, params: user.schoolScope };
}

/** Is this operator limited to some schools? Platform-wide figures are then withheld. */
export const isScoped = (user: ControlUser): boolean => user.role !== 'XHENVOLT_SUPER_ADMIN' && !!user.schoolScope;

export const outOfScope = () => NextResponse.json({ error: 'School not found' }, { status: 404 });

/** 403 for a missing permission, phrased from the catalog. */
export function denied(permission: string): NextResponse {
  const what = CONTROL_PERMISSIONS[permission] || permission;
  return NextResponse.json({ error: `You do not have permission for this: ${what.charAt(0).toLowerCase()}${what.slice(1)}`, permission }, { status: 403 });
}
