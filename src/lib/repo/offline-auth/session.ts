/**
 * @drais/repo — local session creation for offline login.
 *
 * NOT a copy of the online `sessions` table (see schema.ts's header on
 * this table) — created only by an actual local login happening on this
 * install. Token generation mirrors src/app/api/auth/login/route.ts's own
 * generateSessionToken() (32 random bytes, hex) and default 7-day expiry
 * (SESSION_CONFIG), so a session created offline has the same shape/
 * lifetime properties as one created online — just never touches a
 * network or the real `sessions` table.
 *
 * Lands inert — nothing calls this yet.
 */
import { randomBytes } from 'node:crypto';
import type { SqliteConnection } from '../sqlite/connection';

const TOKEN_BYTES = 32; // matches online's SESSION_CONFIG.TOKEN_LENGTH
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // matches online's SESSION_CONFIG.EXPIRY_DAYS = 7

export function generateOfflineSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export interface CreateOfflineSessionInput {
  userId: number;
  schoolId: number | null;
  expiresInMs?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
}

export interface OfflineSessionRecord {
  id: number;
  userId: number;
  schoolId: number | null;
  sessionToken: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  deviceInfo: string | null;
  logoutTime: string | null;
}

const SELECT_COLS = `id, user_id, school_id, session_token, expires_at, ip_address, user_agent, is_active,
                      created_at, updated_at, last_activity_at, device_info, logout_time`;

function toRecord(r: any): OfflineSessionRecord {
  return {
    id: r.id, userId: r.user_id, schoolId: r.school_id, sessionToken: r.session_token,
    expiresAt: r.expires_at, ipAddress: r.ip_address, userAgent: r.user_agent,
    isActive: Boolean(r.is_active), createdAt: r.created_at, updatedAt: r.updated_at,
    lastActivityAt: r.last_activity_at, deviceInfo: r.device_info, logoutTime: r.logout_time,
  };
}

export function createOfflineSession(db: SqliteConnection, input: CreateOfflineSessionInput, now: Date = new Date()): OfflineSessionRecord {
  const sessionToken = generateOfflineSessionToken();
  const expiresAt = new Date(now.getTime() + (input.expiresInMs ?? DEFAULT_EXPIRY_MS)).toISOString();
  const res = db.prepare(
    `INSERT INTO sessions (user_id, school_id, session_token, expires_at, ip_address, user_agent, device_info, last_activity_at, is_active)
     VALUES (@userId, @schoolId, @sessionToken, @expiresAt, @ipAddress, @userAgent, @deviceInfo, @lastActivityAt, 1)`,
  ).run({
    userId: input.userId, schoolId: input.schoolId ?? null, sessionToken, expiresAt,
    ipAddress: input.ipAddress ?? null, userAgent: input.userAgent ?? null,
    deviceInfo: input.deviceInfo ?? null, lastActivityAt: now.toISOString(),
  });
  const row = db.prepare(`SELECT ${SELECT_COLS} FROM sessions WHERE id = ?`).get(Number(res.lastInsertRowid));
  return toRecord(row);
}

/** For a future getSessionSchoolId() offline branch — the exact lookup
 *  shape that function will need: an active, unexpired session by token. */
export function findActiveOfflineSession(db: SqliteConnection, sessionToken: string, now: Date = new Date()): OfflineSessionRecord | null {
  const row = db.prepare(
    `SELECT ${SELECT_COLS} FROM sessions WHERE session_token = ? AND is_active = 1 AND expires_at > ?`,
  ).get(sessionToken, now.toISOString());
  return row ? toRecord(row) : null;
}

export function endOfflineSession(db: SqliteConnection, sessionToken: string, now: Date = new Date()): void {
  db.prepare(
    `UPDATE sessions SET is_active = 0, logout_time = ?, updated_at = ? WHERE session_token = ? AND is_active = 1`,
  ).run(now.toISOString(), now.toISOString(), sessionToken);
}
