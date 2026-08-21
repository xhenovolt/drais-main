/**
 * @drais/repo — entry point for the repository-abstraction layer.
 *
 * docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §8/§8.1/§25 Phase 3.
 * Lands inert in this phase: nothing in src/app/** imports from here yet.
 * getActiveRepos() (./resolve) is the mode-aware picker between the two
 * factories below, based on getDbMode() (src/lib/db/db-mode.ts, which now
 * has a real three-way DbMode per §27 Decision 5 — see resolve.ts's header
 * for why that wiring lives there and not in this file or db-mode.ts itself).
 */
export * from './contract';
export { createMysqlRepos } from './mysql';
export { createSqliteRepos, openSqliteDb, closeSqliteDb, type SqliteConnection } from './sqlite';
export { getActiveRepos } from './resolve';
