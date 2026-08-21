/**
 * DRAIS connection-pool manager (mode-aware).
 *
 * Caches ONE pool per DB mode (online / local-mysql) and hands it out. The
 * pool creation logic — connection retry/backoff, keep-alive, TiDB-safe
 * options (timezone 'Z', bigNumberStrings) — is preserved verbatim from the
 * original single-pool implementation so online TiDB behaviour is unchanged.
 * The only new thing is "which config" is chosen by mode, and the cache is
 * keyed by mode.
 *
 * This module is mysql2-only, deliberately. DbMode (db-mode.ts) has a third
 * value, 'local-sqlite', that this file must NEVER resolve a config for —
 * assertMysqlMode() below throws a loud, specific error rather than letting
 * 'local-sqlite' silently fall through to the online TiDB config (the `? :`
 * pattern every function here uses would otherwise do exactly that, since
 * 'local-sqlite' !== 'local-mysql'). Reaching that throw today would mean
 * DRAIS_DB_MODE=local-sqlite was hand-set in an env/config file — the
 * mode-switch UI/API deliberately don't expose it yet (see
 * src/app/api/db-mode/route.ts's header) because src/lib/db.ts's ~435
 * query() call sites have no SQLite-reading path; local-sqlite is real only
 * for code written against @drais/repo-sqlite via src/lib/repo/resolve.ts.
 */
import mysql from 'mysql2/promise';
import type { DbMode } from './db-mode';

function assertMysqlMode(mode: DbMode): asserts mode is 'online' | 'local-mysql' {
  if (mode !== 'online' && mode !== 'local-mysql') {
    throw new Error(
      `[Database] pools.ts (mysql2) does not support DB mode '${mode}'. ` +
      `local-sqlite data must be read through @drais/repo-sqlite ` +
      `(src/lib/repo/resolve.ts's getActiveRepos()), not src/lib/db.ts's query().`,
    );
  }
}

export interface PoolConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean };
}

/** Online = TiDB Cloud (env TIDB_*). Same defaults as the legacy config. */
export function onlineConfig(): PoolConfig {
  return {
    host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.TIDB_PORT || '4000', 10),
    user: process.env.TIDB_USER || '',
    password: process.env.TIDB_PASSWORD || '',
    database: process.env.TIDB_DB || 'drais',
    ssl: { rejectUnauthorized: false },
  };
}

/** Local = a local MySQL server (env LOCAL_MYSQL_*). No TLS by default. */
export function localConfig(): PoolConfig {
  return {
    host: process.env.LOCAL_MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.LOCAL_MYSQL_PORT || '3306', 10),
    user: process.env.LOCAL_MYSQL_USER || 'root',
    password: process.env.LOCAL_MYSQL_PASSWORD || '',
    database: process.env.LOCAL_MYSQL_DATABASE || 'drais',
  };
}

export function configFor(mode: DbMode): PoolConfig {
  assertMysqlMode(mode);
  return mode === 'local-mysql' ? localConfig() : onlineConfig();
}

function assertCredentials(mode: DbMode, cfg: PoolConfig): void {
  if (!cfg.user) {
    throw new Error(
      mode === 'local-mysql'
        ? '[Database] FATAL: LOCAL_MYSQL_USER must be set for local-mysql mode.'
        : '[Database] FATAL: TIDB_USER and TIDB_PASSWORD must be set for online mode.',
    );
  }
  // Online requires a password; local MySQL root often has an empty password.
  if (mode === 'online' && !cfg.password) {
    throw new Error('[Database] FATAL: TIDB_PASSWORD must be set for online mode.');
  }
  if (!cfg.database) {
    throw new Error('[Database] FATAL: target database name is empty.');
  }
}

async function verifyConnection(conn: mysql.Connection, cfg: PoolConfig, mode: DbMode): Promise<void> {
  const [rows] = (await conn.execute('SELECT 1 AS test')) as any[];
  if (!rows || rows.length === 0) {
    throw new Error('[Database] Connection test failed — SELECT 1 returned no rows');
  }
  const [dbRows] = (await conn.execute('SELECT DATABASE() AS active_db')) as any[];
  const activeDb = dbRows?.[0]?.active_db;
  if (activeDb !== cfg.database) {
    throw new Error(
      `[Database] FATAL: Connected to wrong database "${activeDb}". Expected "${cfg.database}" (${mode} mode).`,
    );
  }
}

// One cached pool per mode.
const pools = new Map<DbMode, mysql.Pool>();
const verified = new Set<DbMode>();

async function createPool(mode: DbMode): Promise<mysql.Pool> {
  const cfg = configFor(mode);
  assertCredentials(mode, cfg);

  const label = mode === 'local-mysql' ? 'Local MySQL' : 'TiDB Cloud';
  console.log(`[Database] Connecting to ${label} → ${cfg.host}:${cfg.port}/${cfg.database} as ${cfg.user}`);

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let testConn: mysql.Connection | null = null;
    try {
      testConn = await mysql.createConnection({ ...cfg, connectTimeout: 15000 });
      await verifyConnection(testConn, cfg, mode);
      await testConn.end();
      break;
    } catch (err: any) {
      if (testConn) { try { await testConn.end(); } catch {} }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Database] ${label} attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `[Database] FATAL: ${label} unreachable after ${MAX_RETRIES} attempts. Last error: ${msg}.`,
        );
      }
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }

  return mysql.createPool({
    ...cfg,
    waitForConnections: true,
    connectionLimit: 25,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    connectTimeout: 15000,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
}

/** Get (or lazily create + verify) the pool for a mode. */
export async function getPool(mode: DbMode): Promise<mysql.Pool> {
  const existing = pools.get(mode);
  if (existing && verified.has(mode)) return existing;
  const p = await createPool(mode);
  pools.set(mode, p);
  verified.add(mode);
  return p;
}

/** Drop a cached pool (called on transient errors / mode switch). */
export function resetPool(mode: DbMode): void {
  pools.delete(mode);
  verified.delete(mode);
}

export function activeDatabaseName(mode: DbMode): string {
  return configFor(mode).database;
}

/** Lightweight health probe — never throws; safe to expose mode/db/host.
 *  Genuinely never throws now, including for a non-mysql mode like
 *  'local-sqlite' — configFor()'s assertMysqlMode() throw is caught too,
 *  not just the connection attempt, so this function's contract holds for
 *  any DbMode value a caller passes, not only the two normally expected.
 *  database/host stay '' in that specific case (there is no mysql config
 *  to report), but are still populated from cfg on a genuine mysql
 *  connection failure, same as before. */
export async function healthCheck(mode: DbMode): Promise<{
  ok: boolean;
  mode: DbMode;
  database: string;
  host: string;
  error?: string;
}> {
  let cfg: PoolConfig | null = null;
  try {
    cfg = configFor(mode);
    const p = await getPool(mode);
    await p.query('SELECT 1');
    return { ok: true, mode, database: cfg.database, host: cfg.host };
  } catch (err) {
    resetPool(mode);
    return {
      ok: false,
      mode,
      database: cfg?.database ?? '',
      host: cfg?.host ?? '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
