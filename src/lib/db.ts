import mysql from 'mysql2/promise';
import { getDbMode } from '@/lib/db/db-mode';
import { getPool as getPoolForMode, resetPool, activeDatabaseName, configFor } from '@/lib/db/pools';

// ============================================================================
// DRAIS — Database Connection (mode-aware: online TiDB Cloud / local MySQL).
// Pool creation + per-mode caching lives in src/lib/db/pools.ts; the active
// mode is resolved by src/lib/db/db-mode.ts (forced online on hosted/prod).
// This module keeps the long-standing query/connection/transaction helpers so
// the ~435 call sites are untouched and online behaviour is identical.
// ============================================================================

/** Pool for the currently-resolved mode (online by default / forced on prod). */
export async function getPool(): Promise<mysql.Pool> {
  return getPoolForMode(getDbMode());
}

// Retryable error codes (transient network/pool issues)
const RETRYABLE_CODES = new Set([
  'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ENOTFOUND',
  'ECONNREFUSED', 'ER_CON_COUNT_ERROR', 'POOL_CLOSED',
]);

/**
 * Sanitize query parameters: convert undefined to null to prevent
 * mysql2 from throwing "Bind parameters must not contain undefined".
 */
function sanitizeParams(params: any[]): any[] {
  return params.map(p => (p === undefined ? null : p));
}

/**
 * TiDB (and MySQL) reject `LIMIT ?` / `OFFSET ?` under the prepared-statement
 * protocol (.execute) with "Incorrect arguments to LIMIT" — the bound value
 * is treated as a string. The text protocol (.query) handles them fine and
 * still escapes parameters safely. So route only those queries to .query().
 */
const LIMIT_OFFSET_PLACEHOLDER = /\b(LIMIT|OFFSET)\s+\?/i;
export function usesLimitPlaceholder(sql: string): boolean {
  return LIMIT_OFFSET_PLACEHOLDER.test(sql);
}

export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const MAX_RETRIES = 3;
  let lastError: unknown;
  const safeParams = sanitizeParams(params);
  const useTextProtocol = usesLimitPlaceholder(sql);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const p = await getPool();
      const [rows] = useTextProtocol
        ? await p.query(sql, safeParams)
        : await p.execute(sql, safeParams);
      return rows as any[];
    } catch (err: any) {
      lastError = err;
      const isRetryable = RETRYABLE_CODES.has(err?.code);
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      console.warn(`[Database] Retrying query (attempt ${attempt}/${MAX_RETRIES}), error: ${err.code}`);
      resetPool(getDbMode());
      await new Promise(r => setTimeout(r, 300 * attempt));
    }
  }
  throw lastError;
}

/**
 * Get a single connection from the pool.
 * Callers MUST call conn.end() — it releases back to the pool.
 */
export async function getConnection(): Promise<mysql.Connection> {
  try {
    const p = await getPool();
    const conn = await p.getConnection();
    // Alias end() → release() so callers don't destroy the socket
    (conn as any).end = (): Promise<void> =>
      new Promise<void>((resolve) => { conn.release(); resolve(); });
    // Wrap execute to sanitize params (undefined → null) and route
    // LIMIT ?/OFFSET ? to the text protocol (.query), which TiDB accepts.
    const origExecute = conn.execute.bind(conn);
    const origQuery = conn.query.bind(conn);
    (conn as any).execute = (sql: string, params?: any[]) => {
      const safe = params ? sanitizeParams(params) : params;
      return usesLimitPlaceholder(sql) ? origQuery(sql, safe) : origExecute(sql, safe);
    };
    return conn as unknown as mysql.Connection;
  } catch (error) {
    console.error('[Database] getConnection error:', error);
    throw new Error(
      `[Database] Failed to acquire connection from pool: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function withTransaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Legacy exports kept for backward compatibility. Now mode-aware.
export async function getActiveDatabase() {
  return activeDatabaseName(getDbMode());
}
export const getTiDBConfig = () => configFor('online');
export const getLocalMySQLConfig = () => configFor('local');

