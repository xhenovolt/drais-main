/**
 * DRAIS Control Center — ISOLATED authentication (Xhenvolt security domain).
 *
 * A completely separate boundary from school auth: its own tables
 * (control_users / control_sessions / control_audit_logs), its own cookie
 * (drais_control), its own password hashing (node scrypt — no shared code
 * paths with school login). Nothing here reads or writes `users`,
 * `sessions` or any school-auth table, so mistakes in the Control Center
 * can never break school login.
 *
 * Session tokens: 48 random bytes (hex) in the cookie; only the SHA-256 of
 * the token is stored, so a database leak does not leak usable sessions.
 */
import { query } from '@/lib/db';
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextRequest } from 'next/server';
import { throttleDecision, recentFailures, recordLoginAttempt, clearFailures } from '@/lib/control/login-guard';
import { generateTotpSecret, verifyTotp, otpauthUrl, generateRecoveryCodes, hashRecovery } from '@/lib/control/totp';

const scrypt = promisify(_scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export const CONTROL_COOKIE = 'drais_control';
const SESSION_HOURS = 12;

export type ControlRole = 'XHENVOLT_SUPER_ADMIN' | 'XHENVOLT_OPERATOR' | 'XHENVOLT_VIEWER';

export interface ControlUser {
  id: number; name: string; email: string; role: ControlRole; status: string;
}

/* ── schema (runtime ensure, promise-gated — additive only) ───────────── */
let ensured: Promise<void> | null = null;
export function ensureControlSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS control_users (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         name VARCHAR(120) NOT NULL,
         email VARCHAR(190) NOT NULL,
         password_hash VARCHAR(255) NOT NULL,
         role VARCHAR(40) NOT NULL DEFAULT 'XHENVOLT_OPERATOR',
         status VARCHAR(16) NOT NULL DEFAULT 'active',
         created_by BIGINT DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         last_login TIMESTAMP NULL DEFAULT NULL,
         UNIQUE KEY uk_control_email (email)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    await query(
      `CREATE TABLE IF NOT EXISTS control_sessions (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         user_id BIGINT NOT NULL,
         token_hash CHAR(64) NOT NULL,
         ip VARCHAR(64) DEFAULT NULL,
         user_agent VARCHAR(255) DEFAULT NULL,
         expires_at DATETIME NOT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uk_control_token (token_hash),
         KEY idx_user (user_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    // Optional 2FA columns (additive; opt-in per operator).
    for (const ddl of [
      `ADD COLUMN totp_secret VARCHAR(64) DEFAULT NULL`,
      `ADD COLUMN totp_enabled TINYINT NOT NULL DEFAULT 0`,
      `ADD COLUMN totp_recovery JSON`,
    ]) { await query(`ALTER TABLE control_users ${ddl}`, []).catch(() => {}); }
    await query(
      `CREATE TABLE IF NOT EXISTS control_audit_logs (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         user_id BIGINT DEFAULT NULL,
         action VARCHAR(80) NOT NULL,
         resource VARCHAR(190) DEFAULT NULL,
         metadata TEXT,
         ip VARCHAR(64) DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         KEY idx_created (created_at),
         KEY idx_user (user_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
  })();
  return ensured;
}

/* ── password hashing (pure, exported for tests) ──────────────────────── */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** PURE role gate: who may manage Control Center users / features. */
export function canManage(role: string | null | undefined): boolean {
  return role === 'XHENVOLT_SUPER_ADMIN';
}

/* ── lifecycle ────────────────────────────────────────────────────────── */

export async function hasAnyControlUser(): Promise<boolean> {
  await ensureControlSchema();
  const r = (await query(`SELECT 1 FROM control_users LIMIT 1`, [])) as any[];
  return r.length > 0;
}

export async function createControlUser(args: {
  name: string; email: string; password: string; role: ControlRole; createdBy?: number | null;
}): Promise<{ ok: boolean; id?: number; reason?: string }> {
  await ensureControlSchema();
  if (!args.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email)) return { ok: false, reason: 'Valid name and email are required' };
  if ((args.password || '').length < 10) return { ok: false, reason: 'Password must be at least 10 characters' };
  const hash = await hashPassword(args.password);
  try {
    const res = (await query(
      `INSERT INTO control_users (name, email, password_hash, role, created_by) VALUES (?, ?, ?, ?, ?)`,
      [args.name.trim(), args.email.toLowerCase().trim(), hash, args.role, args.createdBy ?? null],
    )) as unknown as { insertId: number };
    return { ok: true, id: res.insertId };
  } catch (e: any) {
    return { ok: false, reason: /Duplicate/.test(e?.message) ? 'Email already registered' : 'Failed to create user' };
  }
}

export async function loginControl(
  email: string, password: string, ip?: string | null, userAgent?: string | null, totp?: string,
): Promise<{ ok: boolean; token?: string; user?: ControlUser; reason?: string; retryAfterSec?: number; needs2fa?: boolean }> {
  await ensureControlSchema();
  const normEmail = String(email || '').toLowerCase().trim();

  // Brute-force guard (E-1): block once too many recent failures pile up.
  const { failures, secondsSinceLast } = await recentFailures(normEmail);
  const gate = throttleDecision(failures, secondsSinceLast);
  if (gate.blocked) {
    await controlAudit(null, 'login_throttled', 'session', { email: normEmail, failures }, ip ?? null);
    return { ok: false, reason: `Too many attempts. Try again in ${gate.retryAfterSec}s.`, retryAfterSec: gate.retryAfterSec };
  }

  const rows = (await query(
    `SELECT id, name, email, password_hash, role, status, totp_secret, totp_enabled, totp_recovery
       FROM control_users WHERE email = ? LIMIT 1`,
    [normEmail],
  )) as any[];
  const u = rows[0];
  // Constant-shape failure: verify against a dummy hash when no user found.
  const ok = u ? await verifyPassword(password, u.password_hash) : (await verifyPassword(password, 'scrypt$00$00'), false);
  if (!u || !ok || u.status !== 'active') {
    await recordLoginAttempt(normEmail, ip ?? null, false);
    return u && u.status !== 'active' && ok
      ? { ok: false, reason: 'Account is disabled' }
      : { ok: false, reason: 'Invalid email or password' };
  }

  // Optional second factor (E-2): only enforced when the operator opted in.
  if (Number(u.totp_enabled) === 1) {
    const code = String(totp || '').trim();
    if (!code) return { ok: false, needs2fa: true, reason: 'Enter your authenticator code' };
    let passed = verifyTotp(u.totp_secret, code);
    if (!passed) {
      // Fall back to a one-time recovery code (consumed on use).
      const recovery: string[] = (() => { try { return typeof u.totp_recovery === 'object' && u.totp_recovery ? u.totp_recovery : JSON.parse(u.totp_recovery || '[]'); } catch { return []; } })();
      const h = hashRecovery(code);
      if (recovery.includes(h)) {
        passed = true;
        await query(`UPDATE control_users SET totp_recovery = ? WHERE id = ?`, [JSON.stringify(recovery.filter((x) => x !== h)), u.id]).catch(() => {});
        await controlAudit(u.id, 'twofactor_recovery_used', 'control_users', null, ip ?? null);
      }
    }
    if (!passed) {
      await recordLoginAttempt(normEmail, ip ?? null, false);
      return { ok: false, needs2fa: true, reason: 'Invalid authenticator code' };
    }
  }

  const token = randomBytes(48).toString('hex');
  await query(
    `INSERT INTO control_sessions (user_id, token_hash, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [u.id, hashToken(token), ip ?? null, (userAgent || '').slice(0, 250) || null, SESSION_HOURS],
  );
  await query(`UPDATE control_users SET last_login = NOW() WHERE id = ?`, [u.id]);
  await recordLoginAttempt(normEmail, ip ?? null, true);
  await clearFailures(normEmail); // reset the counter on a good login
  await controlAudit(u.id, 'login', 'session', null, ip);
  return { ok: true, token, user: { id: Number(u.id), name: u.name, email: u.email, role: u.role, status: u.status } };
}

/* ── optional 2FA (opt-in per operator) ───────────────────────────────── */

export async function getTotpStatus(userId: number): Promise<{ enabled: boolean }> {
  await ensureControlSchema();
  const r = (await query(`SELECT totp_enabled FROM control_users WHERE id = ? LIMIT 1`, [userId]).catch(() => [])) as any[];
  return { enabled: Number(r[0]?.totp_enabled) === 1 };
}

/** Step 1: generate + store a pending secret; return it + the otpauth URI. */
export async function beginTotpEnrollment(userId: number, email: string): Promise<{ secret: string; otpauth: string }> {
  await ensureControlSchema();
  const secret = generateTotpSecret();
  // Store as pending (secret set, still disabled) until a code confirms it.
  await query(`UPDATE control_users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?`, [secret, userId]);
  return { secret, otpauth: otpauthUrl(secret, email) };
}

/** Step 2: verify a code against the pending secret → enable + issue recovery codes. */
export async function confirmTotpEnrollment(userId: number, code: string, ip?: string | null): Promise<{ ok: boolean; reason?: string; recovery?: string[] }> {
  await ensureControlSchema();
  const r = (await query(`SELECT totp_secret, totp_enabled FROM control_users WHERE id = ? LIMIT 1`, [userId]).catch(() => [])) as any[];
  const secret = r[0]?.totp_secret;
  if (!secret) return { ok: false, reason: 'Start 2FA setup first' };
  if (!verifyTotp(secret, code)) return { ok: false, reason: 'That code did not match — check your authenticator time.' };
  const recovery = generateRecoveryCodes();
  await query(`UPDATE control_users SET totp_enabled = 1, totp_recovery = ? WHERE id = ?`,
    [JSON.stringify(recovery.map(hashRecovery)), userId]);
  await controlAudit(userId, 'twofactor_enabled', 'control_users', null, ip ?? null);
  return { ok: true, recovery };
}

/** Disable 2FA — requires a current code (or recovery) to prevent hijack. */
export async function disableTotp(userId: number, code: string, ip?: string | null): Promise<{ ok: boolean; reason?: string }> {
  await ensureControlSchema();
  const r = (await query(`SELECT totp_secret, totp_enabled, totp_recovery FROM control_users WHERE id = ? LIMIT 1`, [userId]).catch(() => [])) as any[];
  if (Number(r[0]?.totp_enabled) !== 1) return { ok: true }; // already off
  const recovery: string[] = (() => { try { return typeof r[0].totp_recovery === 'object' && r[0].totp_recovery ? r[0].totp_recovery : JSON.parse(r[0].totp_recovery || '[]'); } catch { return []; } })();
  const okCode = verifyTotp(r[0].totp_secret, code) || recovery.includes(hashRecovery(code));
  if (!okCode) return { ok: false, reason: 'Enter a valid code to disable 2FA' };
  await query(`UPDATE control_users SET totp_enabled = 0, totp_secret = NULL, totp_recovery = NULL WHERE id = ?`, [userId]);
  await controlAudit(userId, 'twofactor_disabled', 'control_users', null, ip ?? null);
  return { ok: true };
}

export async function logoutControl(token: string): Promise<void> {
  await ensureControlSchema();
  await query(`DELETE FROM control_sessions WHERE token_hash = ?`, [hashToken(token)]).catch(() => {});
}

export async function getControlSession(req: NextRequest): Promise<ControlUser | null> {
  const token = req.cookies.get(CONTROL_COOKIE)?.value;
  if (!token) return null;
  await ensureControlSchema();
  const rows = (await query(
    `SELECT u.id, u.name, u.email, u.role, u.status
       FROM control_sessions s JOIN control_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.status = 'active' LIMIT 1`,
    [hashToken(token)],
  )) as any[];
  const u = rows[0];
  return u ? { id: Number(u.id), name: u.name, email: u.email, role: u.role, status: u.status } : null;
}

export const clientIp = (req: NextRequest): string | null =>
  (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;

/** Every Control Center action lands here — who, what, where, when. */
export async function controlAudit(
  userId: number | null, action: string, resource?: string | null,
  metadata?: Record<string, unknown> | null, ip?: string | null,
): Promise<void> {
  try {
    await ensureControlSchema();
    await query(
      `INSERT INTO control_audit_logs (user_id, action, resource, metadata, ip) VALUES (?, ?, ?, ?, ?)`,
      [userId, action, resource ?? null, metadata ? JSON.stringify(metadata) : null, ip ?? null],
    );
  } catch { /* audit must never break the operation */ }
}
