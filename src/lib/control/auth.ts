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
  email: string, password: string, ip?: string | null, userAgent?: string | null,
): Promise<{ ok: boolean; token?: string; user?: ControlUser; reason?: string; retryAfterSec?: number }> {
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
    `SELECT id, name, email, password_hash, role, status FROM control_users WHERE email = ? LIMIT 1`,
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
