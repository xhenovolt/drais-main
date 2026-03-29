import mysql from 'mysql2/promise';

// ============================================================================
// DRAIS — Database Connection (TiDB Cloud Only)
// No fallback, no silent failures. If TiDB is down, the system FAILS loudly.
// ============================================================================

let pool: mysql.Pool | null = null;
let connectionVerified = false;

const TIDB_CONFIG = {
  host:     process.env.TIDB_HOST     || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port:     parseInt(process.env.TIDB_PORT || '4000', 10),
  user:     process.env.TIDB_USER     || '',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DB       || 'drais',
  ssl: { rejectUnauthorized: false },
};

// Guard: fail immediately if credentials are missing
function assertCredentials() {
  if (!TIDB_CONFIG.user || !TIDB_CONFIG.password) {
    throw new Error(
      '[Database] FATAL: TIDB_USER and TIDB_PASSWORD must be set in environment. ' +
      'Set TIDB_USER and TIDB_PASSWORD in .env.local'
    );
  }
  if (!TIDB_CONFIG.database) {
    throw new Error('[Database] FATAL: TIDB_DB must be set in environment (e.g. TIDB_DB=drais)');
  }
}

/**
 * Hard validation — throws if query returns no rows.
 */
async function testConnection(conn: mysql.Connection): Promise<void> {
  const [rows] = await conn.execute('SELECT 1 AS test') as any[];
  if (!rows || rows.length === 0) {
    throw new Error('[Database] Connection test failed — SELECT 1 returned no rows');
  }
  const [dbRows] = await conn.execute('SELECT DATABASE() AS active_db') as any[];
  const activeDb = dbRows?.[0]?.active_db;
  console.log(`[Database] ✅ Connected to TiDB Cloud — active database: ${activeDb}`);
  if (activeDb !== TIDB_CONFIG.database) {
    throw new Error(
      `[Database] FATAL: Connected to wrong database "${activeDb}". Expected "${TIDB_CONFIG.database}". ` +
      'Check TIDB_DB in .env.local'
    );
  }
}

export async function getPool(): Promise<mysql.Pool> {
  if (pool && connectionVerified) return pool;

  assertCredentials();

  console.log(
    `[Database] Connecting to TiDB Cloud → ${TIDB_CONFIG.host}:${TIDB_CONFIG.port}/${TIDB_CONFIG.database} ` +
    `as ${TIDB_CONFIG.user}`
  );

  // Test connection first with exponential backoff
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let testConn: mysql.Connection | null = null;
    try {
      testConn = await mysql.createConnection({
        ...TIDB_CONFIG,
        connectTimeout: 15000,
      });
      await testConnection(testConn);
      await testConn.end();
      break; // Success
    } catch (err: any) {
      if (testConn) {
        try { await testConn.end(); } catch {}
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Database] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `[Database] FATAL: TiDB Cloud unreachable after ${MAX_RETRIES} attempts. ` +
          `Last error: ${msg}. ` +
          'Check TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DB in .env.local. ' +
          'Check network/DNS connectivity to TiDB Cloud.'
        );
      }
      // Exponential backoff: 300ms, 600ms
      await new Promise(r => setTimeout(r, 300 * attempt));
    }
  }

  pool = mysql.createPool({
    ...TIDB_CONFIG,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    connectTimeout: 15000,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  connectionVerified = true;
  return pool;
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

export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const MAX_RETRIES = 3;
  let lastError: unknown;
  const safeParams = sanitizeParams(params);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const p = await getPool();
      const [rows] = await p.execute(sql, safeParams);
      return rows as any[];
    } catch (err: any) {
      lastError = err;
      const isRetryable = RETRYABLE_CODES.has(err?.code);
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      console.warn(`[Database] Retrying query (attempt ${attempt}/${MAX_RETRIES}), error: ${err.code}`);
      pool = null;
      connectionVerified = false;
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
    // Wrap execute to sanitize params (undefined → null)
    const origExecute = conn.execute.bind(conn);
    (conn as any).execute = (sql: string, params?: any[]) =>
      origExecute(sql, params ? sanitizeParams(params) : params);
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

// Legacy exports kept for backward compatibility
export async function getActiveDatabase() {
  return 'tidb' as const;
}
export const getTiDBConfig = () => TIDB_CONFIG;
export const getLocalMySQLConfig = () => TIDB_CONFIG; // No local fallback

