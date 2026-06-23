/**
 * DRAIS DB mode resolver.
 *
 * DRAIS runs against two possible databases:
 *   - online : TiDB Cloud (the hosted/production source of truth)
 *   - local  : a local MySQL server (for the packaged desktop app / offline use)
 *
 * The UI chooses the mode; the SERVER resolves which connection pool to use.
 * Frontend buttons can't mutate process.env after boot, so "mode" is a
 * server-side runtime value (a module variable in the single-process desktop
 * build). On hosted/serverless (Vercel), local mode is impossible — there is
 * no localhost MySQL — so the resolver FORCES online unless a deployment
 * explicitly opts in via DRAIS_ALLOW_LOCAL.
 *
 * Credentials never leave the server; only the mode label + health are exposed.
 */

export type DbMode = 'online' | 'local';

/** Whether this deployment is allowed to use local MySQL at all. */
export function isLocalAllowed(): boolean {
  return process.env.DRAIS_ALLOW_LOCAL === 'true';
}

// Runtime override set by the mode-switch API (desktop/local only). Null = fall
// back to the env default. Module-level state is correct for the single-process
// desktop build; on serverless it's irrelevant because local is never allowed.
let runtimeMode: DbMode | null = null;

/** The env-configured default mode (only honoured when local is allowed). */
function envDefaultMode(): DbMode {
  return process.env.DRAIS_DB_MODE === 'local' ? 'local' : 'online';
}

/** Resolve the active DB mode for this process right now. */
export function getDbMode(): DbMode {
  if (!isLocalAllowed()) return 'online'; // hosted/prod: hard-forced online
  return runtimeMode ?? envDefaultMode();
}

/**
 * Switch the active mode at runtime. Throws if local mode is requested in an
 * environment that doesn't allow it (so a hosted instance can never be flipped
 * to a non-existent local DB). Callers should reset pools + clear sessions.
 */
export function setDbMode(mode: DbMode): DbMode {
  if (mode === 'local' && !isLocalAllowed()) {
    throw new Error('Local database mode is not permitted in this environment.');
  }
  runtimeMode = mode;
  return runtimeMode;
}

/** Human-facing description of a mode (safe to send to the client). */
export function describeMode(mode: DbMode): { mode: DbMode; label: string; short: string } {
  return mode === 'local'
    ? { mode, label: 'Local Server', short: 'LOCAL' }
    : { mode, label: 'Online Cloud', short: 'ONLINE' };
}
