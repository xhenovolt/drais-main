/**
 * @drais/repo-sqlite — connection management.
 *
 * better-sqlite3 is synchronous by design (no connection pool, no async
 * driver overhead — the whole point of an embedded single-writer database).
 * Repo methods below are still declared `async` to satisfy the shared
 * `Repos` contract (§8) so callers never need to know which engine they're
 * talking to; the synchronous call underneath just resolves immediately.
 *
 * Still not imported by src/lib/db/db-mode.ts or src/lib/db/pools.ts
 * directly, and never will be — per §8.1's isolation rule, and because
 * db-mode.ts must stay free of any better-sqlite3 knowledge (see
 * ../resolve.ts's header). The actual integration point is one layer up:
 * ./singleton.ts opens the one long-lived local file this function
 * describes, and ../resolve.ts's getActiveRepos() is what a caller
 * actually asks for a mode-aware Repos — this module itself remains a
 * standalone connection helper, used directly only by tests and
 * provisioning, which intentionally manage their own connection lifecycle
 * rather than sharing the singleton.
 *
 * The require() below is deliberately NOT `require('better-sqlite3')` as a
 * literal, and deliberately NOT a plain `require(someVariable)` either —
 * live-browser verification (2026-09-29, Phase 7 sub-effort 12's own
 * smoke test) found the previous ['better','sqlite3'].join('-') version
 * throwing "Cannot find module 'better-sqlite3'" / MODULE_NOT_FOUND from a
 * webpack-bundled `webpackEmptyContext`, the moment an actual request (the
 * offline login route) exercised this code through the real Next.js dev
 * server — every test before this had called these functions directly via
 * tsx, which never runs webpack at all, so this was never actually
 * exercised end-to-end until now.
 *
 * Root cause, confirmed by reading webpack's own documented behaviour, not
 * assumed: serverExternalPackages (next.config.js) externalizes a package
 * by matching the LITERAL specifier text webpack's static analysis sees at
 * a require()/import call site. A require of a *computed* expression —
 * whether a string literal built from parts, or a plain variable — never
 * presents a literal specifier for that matching to key off, for ANY
 * bundler, so serverExternalPackages silently does nothing here regardless
 * of the package being listed there (it is, correctly, and still didn't
 * help — this was the actual gap, not a missing config entry). Turbopack's
 * *build-time* resolution (the original comment's concern) is a different,
 * narrower problem this also happens to dodge, but was never the whole fix.
 *
 * The actual fix: `eval('require')`, not `require`. A call through `eval`
 * is opaque to every bundler's static import/require analysis — there is
 * no specifier for it to see, literal or computed, so nothing attempts to
 * resolve or bundle this module at build time; it becomes a genuine
 * Node-runtime `require()` the same way a plain `require('fs')` would be,
 * except invisible to webpack/Turbopack alike. This is the same technique
 * real-world optional-native-dependency packages use (e.g. `ws`'s
 * bufferutil/utf-8-validate, chokidar's fsevents) for exactly this
 * "must build without it installed, must load it for real if it is"
 * requirement — not a novel trick invented for this file.
 */
import type Database from 'better-sqlite3';
import { ensureSchema } from './schema';

export type SqliteConnection = Database.Database;

const BETTER_SQLITE3_PKG = 'better-sqlite3';

/**
 * Open (or create) a SQLite database at `path`. Pass ':memory:' for a
 * throwaway in-process database — used by the parity tests, since it needs
 * no filesystem cleanup and is safe to run anywhere (matches the
 * architecture-scan.mjs convention already established in this repo).
 */
export function openSqliteDb(path: string): SqliteConnection {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, no-eval
  const DatabaseCtor = eval('require')(BETTER_SQLITE3_PKG) as typeof Database;
  const db = new DatabaseCtor(path);
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
