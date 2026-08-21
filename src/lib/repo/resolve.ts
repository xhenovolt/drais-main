/**
 * @drais/repo — mode-aware Repos resolver.
 *
 * docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §27 Decision 5's
 * "technical consequence, not yet built" note, now built: the actual place
 * DbMode's third value ('local-sqlite') becomes a real, working connection.
 *
 * Deliberately lives here, not in src/lib/db/db-mode.ts or pools.ts — this
 * file imports from repo/sqlite (which pulls in better-sqlite3, an
 * optionalDependency), so it must stay a leaf nobody is forced to import.
 * db-mode.ts stays free of any better-sqlite3/mysql2 knowledge, which is
 * what keeps it safe to import from hosted/serverless builds where
 * better-sqlite3 may not even be installed — exactly the failure this
 * session already hit once with `dist:*`/vercel-build before it was moved
 * to optionalDependencies.
 *
 * NOT imported by any route/page yet (§8.1 — lands inert, same as every
 * repo-sqlite file so far). This is the missing link for the NEXT thing
 * that gets built on top of it, not a retrofit onto the ~435 existing
 * src/lib/db.ts query() call sites, which this deliberately does not
 * touch — see pools.ts's assertMysqlMode() for why local-sqlite must never
 * reach that module.
 */
import { getDbMode } from '@/lib/db/db-mode';
import type { Repos } from './contract';
import { createMysqlRepos } from './mysql';
import { createSqliteRepos } from './sqlite';
import { getSqliteDb } from './sqlite/singleton';

/**
 * The Repos implementation for whatever DbMode is currently active.
 * online / local-mysql -> repo-mysql (thin wrapper over the existing,
 * untouched src/lib/db.ts pool). local-sqlite -> repo-sqlite, backed by
 * the one long-lived local file (sqlite/singleton.ts).
 *
 * Synchronous by design: both factories just assemble an object of
 * closures — the actual I/O happens per-method-call, not at resolution
 * time (repo-mysql's pool connects lazily on first query; repo-sqlite's
 * connection opens eagerly in getSqliteDb(), but that's a fast local file
 * open, not a network round-trip).
 */
export function getActiveRepos(): Repos {
  return getDbMode() === 'local-sqlite' ? createSqliteRepos(getSqliteDb()) : createMysqlRepos();
}
