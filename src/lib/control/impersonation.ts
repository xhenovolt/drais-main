/**
 * Control-plane impersonation — "operate as a school without its password."
 *
 * An XHENVOLT_SUPER_ADMIN, authenticated in the isolated control domain, can
 * enter any school and use its ENTIRE app (all routes / modules / data) by
 * minting a real, short-lived school session bound to that school's highest-
 * privilege user — flagged as an impersonation and fully audited. School
 * login and existing sessions are untouched.
 *
 * Safety rails:
 *   • only the control super-admin can start it (enforced in the API);
 *   • the session carries `impersonated_by_control_user` so every action is
 *     traceable to the Xhenvolt operator, and a visible banner shows it;
 *   • 2-hour expiry; a clean Exit ends the session and returns to /control;
 *   • start/end are written to control_audit_logs.
 */
import { query } from '@/lib/db';
import { randomBytes } from 'node:crypto';
import { controlAudit } from '@/lib/control/auth';

let ensured: Promise<void> | null = null;
async function ensureImpersonationColumn(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try { await query(`ALTER TABLE sessions ADD COLUMN impersonated_by_control_user BIGINT DEFAULT NULL`, []); }
    catch { /* exists */ }
  })();
  return ensured;
}

const IMP_HOURS = 2;

/** Pick the school's highest-privilege active user to operate as. */
async function pickTargetUser(schoolId: number): Promise<{ id: number; name: string } | null> {
  const rows = (await query(
    `SELECT u.id,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username, u.email) AS name,
            MAX(r.name = 'super_admin') AS is_super,
            MAX(r.name IN ('super_admin','admin')) AS is_admin
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.school_id = ? AND (u.is_active = 1 OR u.is_active IS NULL) AND u.deleted_at IS NULL
      GROUP BY u.id, name
      ORDER BY is_super DESC, is_admin DESC, u.id ASC
      LIMIT 1`,
    [schoolId],
  )) as any[];
  return rows[0] ? { id: Number(rows[0].id), name: rows[0].name } : null;
}

export interface ImpersonationStart { ok: boolean; reason?: string; token?: string; targetUser?: string; schoolName?: string; }

export async function startImpersonation(args: {
  controlUserId: number; controlUserName: string; schoolId: number; ip?: string | null; userAgent?: string | null;
}): Promise<ImpersonationStart> {
  await ensureImpersonationColumn();
  const schoolRows = (await query(`SELECT name FROM schools WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [args.schoolId])) as any[];
  if (!schoolRows[0]) return { ok: false, reason: 'School not found' };

  const target = await pickTargetUser(args.schoolId);
  if (!target) return { ok: false, reason: 'This school has no active user to operate as — create a school admin first.' };

  const token = randomBytes(48).toString('hex');
  await query(
    `INSERT INTO sessions
       (user_id, school_id, session_token, expires_at, ip_address, user_agent, last_activity_at, is_active, impersonated_by_control_user)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), ?, ?, NOW(), TRUE, ?)`,
    [target.id, args.schoolId, token, IMP_HOURS, args.ip ?? null, (args.userAgent || '').slice(0, 250) || null, args.controlUserId],
  );
  await controlAudit(args.controlUserId, 'impersonation_started', `schools:${args.schoolId}`,
    { school: schoolRows[0].name, operating_as_user: target.id, operating_as: target.name }, args.ip);

  return { ok: true, token, targetUser: target.name, schoolName: schoolRows[0].name };
}

/** Whether the CURRENT school session token is a control impersonation. */
export async function impersonationStatus(sessionToken: string | undefined): Promise<{ impersonating: boolean; school?: string; operating_as?: string; by_control_user?: number } | null> {
  if (!sessionToken) return { impersonating: false };
  await ensureImpersonationColumn();
  const rows = (await query(
    `SELECT s.impersonated_by_control_user, sch.name AS school,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username, u.email) AS operating_as
       FROM sessions s
       LEFT JOIN schools sch ON sch.id = s.school_id
       LEFT JOIN users u ON u.id = s.user_id
      WHERE s.session_token = ? AND s.is_active = TRUE AND s.expires_at > NOW() LIMIT 1`,
    [sessionToken],
  )) as any[];
  const r = rows[0];
  if (!r || r.impersonated_by_control_user == null) return { impersonating: false };
  return { impersonating: true, school: r.school, operating_as: r.operating_as, by_control_user: Number(r.impersonated_by_control_user) };
}

export async function endImpersonation(sessionToken: string | undefined, ip?: string | null): Promise<void> {
  if (!sessionToken) return;
  await ensureImpersonationColumn();
  const rows = (await query(
    `SELECT school_id, impersonated_by_control_user FROM sessions WHERE session_token = ? LIMIT 1`, [sessionToken],
  )) as any[];
  const r = rows[0];
  await query(`UPDATE sessions SET is_active = FALSE, logout_time = NOW() WHERE session_token = ?`, [sessionToken]).catch(() => {});
  if (r?.impersonated_by_control_user != null) {
    await controlAudit(Number(r.impersonated_by_control_user), 'impersonation_ended', `schools:${r.school_id}`, null, ip);
  }
}
