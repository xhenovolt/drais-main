/**
 * DRAIS DB mode resolver.
 *
 * DRAIS can run against three possible data sources:
 *   - online       : TiDB Cloud (the hosted/production source of truth)
 *   - local-mysql  : a local MySQL server (ADR-0010's pre-existing dual-mode,
 *                    for the packaged desktop app / offline use — unchanged
 *                    by DRAIS V2, renamed from the original 'local' label
 *                    for this file's own history)
 *   - local-sqlite : a local SQLite file via @drais/repo-sqlite (DRAIS V2,
 *                    docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §27
 *                    Decision 5 — "keep both, SQLite becomes the default")
 *
 * The UI chooses the mode; the SERVER resolves which connection pool to use.
 * Frontend buttons can't mutate process.env after boot, so "mode" is a
 * server-side runtime value (a module variable in the single-process desktop
 * build). On hosted/serverless (Vercel), local modes are impossible — there
 * is no localhost MySQL and no writable SQLite file — so the resolver FORCES
 * online unless a deployment explicitly opts in via DRAIS_ALLOW_LOCAL.
 *
 * IMPORTANT: this file only knows mode LABELS — it deliberately has zero
 * knowledge of mysql2 or better-sqlite3 (src/lib/db/pools.ts stays the only
 * mysql2 caller; @drais/repo-sqlite's connection.ts stays the only
 * better-sqlite3 caller). This keeps db-mode.ts safe to import from
 * anywhere — including hosted/serverless builds where better-sqlite3 (an
 * optionalDependency, see package.json) may not even be installed — without
 * risking the exact "native module broke the build" failure already hit
 * once this session. src/lib/repo/resolve.ts is where the 'local-sqlite'
 * label actually becomes a working connection; this file never imports it.
 *
 * Credentials never leave the server; only the mode label + health are exposed.
 */

export type DbMode = 'online' | 'local-mysql' | 'local-sqlite';

/** Whether this deployment is allowed to use ANY local mode at all
 *  (local-mysql or local-sqlite — both are unavailable/unsafe on
 *  hosted/serverless, for different reasons: no reachable localhost MySQL,
 *  and no persistent writable filesystem for a SQLite file). */
export function isLocalAllowed(): boolean {
  return process.env.DRAIS_ALLOW_LOCAL === 'true';
}

// Runtime override set by the mode-switch API (desktop/local only). Null = fall
// back to the env default. Module-level state is correct for the single-process
// desktop build; on serverless it's irrelevant because local is never allowed.
let runtimeMode: DbMode | null = null;

/** The env-configured default mode (only honoured when local is allowed).
 *  'local' (the pre-V2 value) is accepted as a synonym for 'local-mysql' —
 *  an existing desktop install's already-persisted DRAIS_DB_MODE=local
 *  config file (src/lib/db/runtime-config.ts) must keep meaning exactly
 *  what it always meant, not silently change behavior on next boot. */
function envDefaultMode(): DbMode {
  const v = process.env.DRAIS_DB_MODE;
  if (v === 'local' || v === 'local-mysql') return 'local-mysql';
  if (v === 'local-sqlite') return 'local-sqlite';
  return 'online';
}

/** Resolve the active DB mode for this process right now. */
export function getDbMode(): DbMode {
  if (!isLocalAllowed()) return 'online'; // hosted/prod: hard-forced online
  return runtimeMode ?? envDefaultMode();
}

/**
 * Switch the active mode at runtime. Throws if a local mode is requested in
 * an environment that doesn't allow it (so a hosted instance can never be
 * flipped to a non-existent local DB). Callers should reset pools + clear
 * sessions.
 */
export function setDbMode(mode: DbMode): DbMode {
  if (mode !== 'online' && !isLocalAllowed()) {
    throw new Error('Local database mode is not permitted in this environment.');
  }
  runtimeMode = mode;
  return runtimeMode;
}

/** Human-facing description of a mode (safe to send to the client). */
export function describeMode(mode: DbMode): { mode: DbMode; label: string; short: string } {
  switch (mode) {
    case 'local-mysql':
      return { mode, label: 'Local Server', short: 'LOCAL' };
    case 'local-sqlite':
      return { mode, label: 'Local Server (SQLite)', short: 'LOCAL' };
    default:
      return { mode, label: 'Online Cloud', short: 'ONLINE' };
  }
}
