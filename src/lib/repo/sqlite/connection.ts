/**
 * @drais/repo-sqlite — connection management.
 *
 * better-sqlite3 is synchronous by design (no connection pool, no async
 * driver overhead — the whole point of an embedded single-writer database).
 * Repo methods below are still declared `async` to satisfy the shared
 * `Repos` contract (§8) so callers never need to know which engine they're
 * talking to; the synchronous call underneath just resolves immediately.
 *
 * NOT wired into src/lib/db/db-mode.ts or src/lib/db/pools.ts — this is a
 * standalone connection helper for this repo layer only, per §8.1's
 * isolation rule. A future integration point (not built here) would have
 * db-mode.ts hand a SQLite path to this module instead of local MySQL
 * credentials to pools.ts.
 */
import Database from 'better-sqlite3';
import { ensureSchema } from './schema';

export type SqliteConnection = Database.Database;

/**
 * Open (or create) a SQLite database at `path`. Pass ':memory:' for a
 * throwaway in-process database — used by the parity tests, since it needs
 * no filesystem cleanup and is safe to run anywhere (matches the
 * architecture-scan.mjs convention already established in this repo).
 */
export function openSqliteDb(path: string): SqliteConnection {
  const db = new Database(path);
  // WAL = the mode Electron/desktop local mode will actually run under
  // (concurrent readers don't block the single writer). Harmless for
  // ':memory:' (SQLite ignores journal_mode there).
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);
  return db;
}

export function closeSqliteDb(db: SqliteConnection): void {
  db.close();
}
