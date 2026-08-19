/**
 * @drais/repo — entry point for the repository-abstraction layer.
 *
 * docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §8/§8.1/§25 Phase 3.
 * Lands inert in this phase: nothing in src/app/** imports from here yet.
 * A future consumer picks ONE of the two factories below based on
 * getDbMode() (src/lib/db/db-mode.ts, unmodified) — this module doesn't
 * make that choice itself, so it never needs to import db-mode.ts, mysql2,
 * or better-sqlite3 all at once.
 */
export * from './contract';
export { createMysqlRepos } from './mysql';
export { createSqliteRepos, openSqliteDb, closeSqliteDb, type SqliteConnection } from './sqlite';
