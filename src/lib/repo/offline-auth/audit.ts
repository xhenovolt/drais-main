/**
 * @drais/repo — local audit trail for offline-authenticated events.
 *
 * Confirmed design (2026-08-21, user, AskUserQuestion): audit logging
 * writes to a local table and syncs later, rather than being silently
 * skipped offline.
 *
 * Deliberately NOT part of the contract/mysql/sqlite Repos pattern the
 * rest of this repo layer follows — that pattern is for the SAME logical
 * entity backed by either engine (a school row online is the same school
 * row locally). This table has no online counterpart to mirror: it's
 * generated locally and flows OUTWARD on sync (local -> the real
 * `audit_logs` table src/lib/audit.ts writes to), the opposite direction
 * of every other table in this repo layer so far. Shaped like
 * src/lib/audit.ts's own AuditEntry so a future sync pass can map a row
 * here onto a real logAudit() call with no field translation needed.
 * Standalone schema-ensure + append/list functions operating directly on
 * a SqliteConnection, matching the precedent already set elsewhere in
 * this codebase for local-only SQLite state outside this repo layer
 * (src/lib/sentinel/schema.ts, src/lib/backup/schema.ts).
 *
 * Lands inert — nothing calls this yet.
 */
import type { SqliteConnection } from '../sqlite/connection';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS offline_audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id    INTEGER NOT NULL,
  user_id      INTEGER,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    INTEGER,
  details      TEXT, -- JSON, stringified at this boundary
  ip           TEXT,
  user_agent   TEXT,
  source       TEXT,
  occurred_at  TEXT NOT NULL,
  synced_at    TEXT -- NULL until a future sync pass pushes this row online
);
CREATE INDEX IF NOT EXISTS idx_offline_audit_unsynced ON offline_audit_log(synced_at);
CREATE INDEX IF NOT EXISTS idx_offline_audit_school ON offline_audit_log(school_id, occurred_at);
`;

let ensured = new WeakSet<SqliteConnection>();

export function ensureOfflineAuditSchema(db: SqliteConnection): void {
  if (ensured.has(db)) return;
  db.exec(SCHEMA_SQL);
  ensured.add(db);
}

export interface OfflineAuditEntry {
  schoolId: number;
  userId: number | null;
  action: string;
  entityType?: string;
  entityId?: number | null;
  details?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  source?: 'WEB' | 'MOBILE' | 'API' | 'JETON' | 'SYSTEM';
}

/** Never throws — mirrors logAudit()'s own rule: an audit-write failure
 *  must not turn a login attempt into an outage. */
export function appendOfflineAuditEvent(db: SqliteConnection, entry: OfflineAuditEntry, now: Date = new Date()): void {
  ensureOfflineAuditSchema(db);
  try {
    db.prepare(
      `INSERT INTO offline_audit_log (school_id, user_id, action, entity_type, entity_id, details, ip, user_agent, source, occurred_at)
       VALUES (@schoolId, @userId, @action, @entityType, @entityId, @details, @ip, @userAgent, @source, @occurredAt)`,
    ).run({
      schoolId: entry.schoolId, userId: entry.userId, action: entry.action,
      entityType: entry.entityType ?? 'system', entityId: entry.entityId ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
      ip: entry.ip ?? null, userAgent: entry.userAgent ?? null, source: entry.source ?? 'WEB',
      occurredAt: now.toISOString(),
    });
  } catch (err) {
    console.error(`[OfflineAudit] Failed to write log — action=${entry.action} school=${entry.schoolId}`, err);
  }
}

export interface OfflineAuditRow extends OfflineAuditEntry {
  id: number;
  occurredAt: string;
  syncedAt: string | null;
}

/** For a future sync pass — rows not yet pushed to the real audit_logs table. */
export function listUnsyncedOfflineAuditEvents(db: SqliteConnection, limit = 500): OfflineAuditRow[] {
  ensureOfflineAuditSchema(db);
  const rows = db.prepare(
    `SELECT id, school_id, user_id, action, entity_type, entity_id, details, ip, user_agent, source, occurred_at, synced_at
       FROM offline_audit_log WHERE synced_at IS NULL ORDER BY occurred_at ASC LIMIT ?`,
  ).all(limit) as any[];
  return rows.map((r) => ({
    id: r.id, schoolId: r.school_id, userId: r.user_id, action: r.action,
    entityType: r.entity_type, entityId: r.entity_id,
    details: r.details ? JSON.parse(r.details) : undefined,
    ip: r.ip, userAgent: r.user_agent, source: r.source,
    occurredAt: r.occurred_at, syncedAt: r.synced_at,
  }));
}

/** For a future sync pass — mark rows as pushed once logAudit() succeeds for them online. */
export function markOfflineAuditEventsSynced(db: SqliteConnection, ids: number[], now: Date = new Date()): void {
  if (!ids.length) return;
  ensureOfflineAuditSchema(db);
  const syncedAt = now.toISOString();
  const stmt = db.prepare(`UPDATE offline_audit_log SET synced_at = ? WHERE id = ?`);
  const tx = db.transaction((rows: number[]) => { for (const id of rows) stmt.run(syncedAt, id); });
  tx(ids);
}
