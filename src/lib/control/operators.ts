/**
 * Control Center operators — who may change whose access, and how.
 *
 * Rules (enforced here, not just in the UI):
 *   • Nobody changes their OWN role, permissions, scope, expiry or status —
 *     no self-escalation and no accidental self-lockout.
 *   • Only a super admin may create, change or remove a super admin.
 *   • A non-super-admin may only grant permissions they hold themselves, and
 *     may not widen someone's school scope beyond their own.
 *   • The last active super admin can never be suspended, demoted or removed.
 *   • Changes take effect on the operator's next request (the session reads
 *     the operator row every time); suspension and removal also end their
 *     sessions immediately.
 */
import { query } from '@/lib/control/db';
import { ensureControlSchema, hashPassword, revokeAllControlSessions, toControlUser, type ControlUser } from '@/lib/control/auth';
import { permissionsFor, sanitizePermissions, ALL_PERMISSIONS } from '@/lib/control/permissions';

export const OPERATOR_ROLES = ['XHENVOLT_SUPER_ADMIN', 'XHENVOLT_OPERATOR', 'XHENVOLT_VIEWER'] as const;
export const OPERATOR_STATUSES = ['active', 'suspended'] as const;

const isSuper = (u: { role?: string | null }) => u.role === 'XHENVOLT_SUPER_ADMIN';

export interface OperatorRow {
  id: number; name: string; email: string; role: string; status: string;
  permissions: string[] | null; effective_permissions: string[];
  school_scope: number[] | null; access_expires_at: string | null; notes: string | null;
  created_at: string | null; created_by: number | null; created_by_name: string | null;
  last_login: string | null; last_activity: string | null; active_sessions: number;
  totp_enabled: boolean; expired: boolean;
}

export async function listOperators(): Promise<OperatorRow[]> {
  await ensureControlSchema();
  const rows = (await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.permissions, u.school_scope, u.access_expires_at, u.notes,
            u.created_at, u.created_by, c.name AS created_by_name, u.last_login, u.totp_enabled,
            (u.access_expires_at IS NOT NULL AND u.access_expires_at <= NOW()) AS expired,
            (SELECT COUNT(*) FROM control_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > NOW()) AS active_sessions,
            (SELECT MAX(s.last_activity_at) FROM control_sessions s WHERE s.user_id = u.id) AS last_activity
       FROM control_users u LEFT JOIN control_users c ON c.id = u.created_by
      ORDER BY (u.role = 'XHENVOLT_SUPER_ADMIN') DESC, u.name ASC`, [],
  )) as any[];
  return rows.map((r) => {
    const u = toControlUser(r);
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
      permissions: u.permissions ?? null, effective_permissions: permissionsFor(u),
      school_scope: u.schoolScope ?? null, access_expires_at: u.accessExpiresAt ?? null, notes: r.notes ?? null,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      created_by: r.created_by != null ? Number(r.created_by) : null, created_by_name: r.created_by_name ?? null,
      last_login: r.last_login ? new Date(r.last_login).toISOString() : null,
      last_activity: r.last_activity ? new Date(r.last_activity).toISOString() : null,
      active_sessions: Number(r.active_sessions || 0),
      totp_enabled: Number(r.totp_enabled) === 1, expired: Number(r.expired) === 1,
    };
  });
}

export interface OperatorPatch {
  name?: string; role?: string; permissions?: string[]; school_scope?: number[] | null;
  access_expires_at?: string | null; status?: string; notes?: string | null; password?: string;
  revoke_sessions?: boolean;
}

type Result = { ok: true; changes: Record<string, unknown> } | { ok: false; status: number; reason: string };

async function activeSuperAdmins(): Promise<number> {
  const r = (await query(`SELECT COUNT(*) n FROM control_users WHERE role = 'XHENVOLT_SUPER_ADMIN' AND status = 'active'`, [])) as any[];
  return Number(r[0]?.n || 0);
}

/** Validate an expiry: null clears it; otherwise a future date. */
function parseExpiry(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v == null || v === '') return { ok: true, value: null };
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return { ok: false };
  return { ok: true, value: d.toISOString().slice(0, 19).replace('T', ' ') };
}

/** Grantable by this actor: super admin → anything; otherwise only what they hold. */
function checkGrant(actor: ControlUser, perms: string[]): string[] {
  if (isSuper(actor)) return [];
  const mine = new Set(permissionsFor(actor));
  return perms.filter((p) => !mine.has(p));
}

function checkScope(actor: ControlUser, scope: number[] | null): boolean {
  if (isSuper(actor) || !actor.schoolScope) return true;
  return scope != null && scope.every((id) => actor.schoolScope!.includes(id));
}

export async function createOperator(actor: ControlUser, b: any): Promise<{ ok: true; id: number } | { ok: false; status: number; reason: string }> {
  await ensureControlSchema();
  const role = OPERATOR_ROLES.includes(b?.role) ? b.role : 'XHENVOLT_OPERATOR';
  if (role === 'XHENVOLT_SUPER_ADMIN' && !isSuper(actor)) return { ok: false, status: 403, reason: 'Only a super admin can create another super admin' };
  const perms = role === 'XHENVOLT_SUPER_ADMIN' ? null : sanitizePermissions(b?.permissions ?? []);
  if (perms) {
    const extra = checkGrant(actor, perms);
    if (extra.length) return { ok: false, status: 403, reason: `You cannot grant permissions you do not hold: ${extra.join(', ')}` };
  }
  const scope = Array.isArray(b?.school_scope) ? b.school_scope.map(Number).filter((n: number) => n > 0) : null;
  if (!checkScope(actor, scope)) return { ok: false, status: 403, reason: 'You can only give access to schools you can see yourself' };
  const exp = parseExpiry(b?.access_expires_at);
  if (!exp.ok) return { ok: false, status: 400, reason: 'Access expiry must be a future date' };

  const name = String(b?.name || '').trim(); const email = String(b?.email || '').toLowerCase().trim(); const password = String(b?.password || '');
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, status: 400, reason: 'Valid name and email are required' };
  if (password.length < 10) return { ok: false, status: 400, reason: 'Password must be at least 10 characters' };
  try {
    const res = (await query(
      `INSERT INTO control_users (name, email, password_hash, role, created_by, permissions, school_scope, access_expires_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, await hashPassword(password), role, actor.id, perms ? JSON.stringify(perms) : null,
        scope ? JSON.stringify(scope) : null, exp.value, b?.notes ? String(b.notes).slice(0, 500) : null],
    )) as unknown as { insertId: number };
    return { ok: true, id: Number(res.insertId) };
  } catch (e: any) {
    return { ok: false, status: 400, reason: /Duplicate/.test(e?.message) ? 'Email already registered' : 'Failed to create operator' };
  }
}

export async function updateOperator(actor: ControlUser, id: number, b: OperatorPatch): Promise<Result> {
  await ensureControlSchema();
  const row = ((await query(`SELECT * FROM control_users WHERE id = ? LIMIT 1`, [id])) as any[])[0];
  if (!row) return { ok: false, status: 404, reason: 'Operator not found' };
  const target = toControlUser(row);
  const self = target.id === actor.id;
  if (isSuper(target) && !isSuper(actor)) return { ok: false, status: 403, reason: 'Only a super admin can change a super admin' };

  const sets: string[] = []; const params: unknown[] = []; const changes: Record<string, unknown> = {};
  const accessFields = ['role', 'permissions', 'school_scope', 'access_expires_at', 'status'] as const;
  if (self && accessFields.some((k) => b[k] !== undefined)) return { ok: false, status: 403, reason: 'You cannot change your own access — ask another super admin' };

  if (b.name !== undefined) {
    const name = String(b.name).trim(); if (!name) return { ok: false, status: 400, reason: 'Name is required' };
    sets.push('name = ?'); params.push(name); changes.name = { from: target.name, to: name };
  }
  if (b.notes !== undefined) { sets.push('notes = ?'); params.push(b.notes ? String(b.notes).slice(0, 500) : null); changes.notes = true; }

  let newRole = target.role as string;
  if (b.role !== undefined) {
    if (!OPERATOR_ROLES.includes(b.role as any)) return { ok: false, status: 400, reason: 'Unknown role' };
    if (b.role === 'XHENVOLT_SUPER_ADMIN' && !isSuper(actor)) return { ok: false, status: 403, reason: 'Only a super admin can make someone a super admin' };
    if (isSuper(target) && b.role !== 'XHENVOLT_SUPER_ADMIN' && target.status === 'active' && (await activeSuperAdmins()) <= 1) {
      return { ok: false, status: 409, reason: 'This is the last super admin — make someone else a super admin first' };
    }
    newRole = b.role; sets.push('role = ?'); params.push(b.role); changes.role = { from: target.role, to: b.role };
  }
  if (b.permissions !== undefined) {
    const perms = sanitizePermissions(b.permissions);
    const before = permissionsFor(target);
    // Only NEWLY granted permissions need the actor to hold them; keeping existing ones is fine.
    const extra = checkGrant(actor, perms.filter((p) => !before.includes(p)));
    if (extra.length) return { ok: false, status: 403, reason: `You cannot grant permissions you do not hold: ${extra.join(', ')}` };
    sets.push('permissions = ?'); params.push(JSON.stringify(perms));
    changes.permissions = { added: perms.filter((p) => !before.includes(p)), removed: before.filter((p) => !perms.includes(p) && ALL_PERMISSIONS.includes(p)) };
  }
  if (b.school_scope !== undefined) {
    const scope = Array.isArray(b.school_scope) ? [...new Set(b.school_scope.map(Number).filter((n) => n > 0))] : null;
    if (!checkScope(actor, scope)) return { ok: false, status: 403, reason: 'You can only give access to schools you can see yourself' };
    sets.push('school_scope = ?'); params.push(scope ? JSON.stringify(scope) : null);
    changes.school_scope = { from: target.schoolScope ?? 'all', to: scope ?? 'all' };
  }
  if (b.access_expires_at !== undefined) {
    const exp = parseExpiry(b.access_expires_at);
    if (!exp.ok) return { ok: false, status: 400, reason: 'Access expiry must be a future date' };
    sets.push('access_expires_at = ?'); params.push(exp.value); changes.access_expires_at = exp.value ?? 'never';
  }
  let endSessions = !!b.revoke_sessions;
  if (b.status !== undefined) {
    if (!OPERATOR_STATUSES.includes(b.status as any)) return { ok: false, status: 400, reason: 'Unknown status' };
    if (b.status !== 'active' && isSuper(target) && (await activeSuperAdmins()) <= 1) {
      return { ok: false, status: 409, reason: 'This is the last super admin and cannot be suspended' };
    }
    sets.push('status = ?'); params.push(b.status); changes.status = { from: target.status, to: b.status };
    if (b.status !== 'active') endSessions = true;
  }
  if (b.password !== undefined) {
    if (self) return { ok: false, status: 403, reason: 'Change your own password from your account settings' };
    if (String(b.password).length < 10) return { ok: false, status: 400, reason: 'Password must be at least 10 characters' };
    sets.push('password_hash = ?'); params.push(await hashPassword(String(b.password))); changes.password_reset = true;
    endSessions = true;
  }
  if (!sets.length && !endSessions) return { ok: false, status: 400, reason: 'Nothing to change' };
  if (sets.length) {
    sets.push('updated_at = NOW()');
    await query(`UPDATE control_users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  }
  if (endSessions && !self) changes.sessions_ended = await revokeAllControlSessions(id);
  void newRole;
  return { ok: true, changes };
}

export async function deleteOperator(actor: ControlUser, id: number): Promise<Result> {
  await ensureControlSchema();
  if (id === actor.id) return { ok: false, status: 403, reason: 'You cannot remove yourself' };
  const row = ((await query(`SELECT * FROM control_users WHERE id = ? LIMIT 1`, [id])) as any[])[0];
  if (!row) return { ok: false, status: 404, reason: 'Operator not found' };
  const target = toControlUser(row);
  if (isSuper(target) && !isSuper(actor)) return { ok: false, status: 403, reason: 'Only a super admin can remove a super admin' };
  if (isSuper(target) && target.status === 'active' && (await activeSuperAdmins()) <= 1) return { ok: false, status: 409, reason: 'The last super admin cannot be removed' };
  const ended = await revokeAllControlSessions(id);
  await query(`DELETE FROM control_users WHERE id = ?`, [id]);
  return { ok: true, changes: { removed: { name: target.name, email: target.email, role: target.role }, sessions_ended: ended } };
}
