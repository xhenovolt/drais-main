/**
 * @drais/repo-sqlite — the one long-lived local-mode connection.
 *
 * Mirrors src/lib/db/pools.ts's own module-level cache-one-per-process
 * pattern, but for the single SQLite file a local install holds (§9 of the
 * architecture audit: one school per local install, so one file, not a
 * pool). better-sqlite3 is synchronous and single-writer by design — a
 * pool would be the wrong shape here even if this file wanted one.
 *
 * Path resolution follows src/lib/db/runtime-config.ts's own established
 * convention (DRAIS_CONFIG_FILE defaults to ~/.drais/drais.env) — the local
 * SQLite file defaults to ~/.drais/local.sqlite, overridable via
 * DRAIS_SQLITE_PATH (also readable/settable through that same runtime-config
 * module, so an admin can relocate it from the same UI that edits DB
 * credentials, without needing source access in the packaged exe).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openSqliteDb, closeSqliteDb, type SqliteConnection } from './connection';

export function defaultSqlitePath(): string {
  return process.env.DRAIS_SQLITE_PATH || path.join(os.homedir(), '.drais', 'local.sqlite');
}

let cached: SqliteConnection | null = null;
let cachedPath: string | null = null;

/** Get (or lazily open) the singleton local SQLite connection. Re-opens if
 *  DRAIS_SQLITE_PATH changed since the last call (mirrors pools.ts
 *  resetting on a runtime-config change) rather than silently keeping a
 *  stale connection to the old path open. */
export function getSqliteDb(): SqliteConnection {
  const targetPath = defaultSqlitePath();
  if (cached && cachedPath === targetPath) return cached;
  if (cached) closeSqliteDb(cached);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  cached = openSqliteDb(targetPath);
  cachedPath = targetPath;
  return cached;
}

/** Close and drop the cached connection (mirrors pools.ts's resetPool —
 *  called after a config change, or to release the file handle cleanly). */
export function resetSqliteDb(): void {
  if (cached) closeSqliteDb(cached);
  cached = null;
  cachedPath = null;
}
