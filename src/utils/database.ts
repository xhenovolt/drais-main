/**
 * Legacy DB helper — now a thin shim over the central mode-aware pool
 * (`@/lib/db`). It previously held its OWN mysql2 pool defaulting to
 * localhost:3306/drais_school, which broke on hosted deploys and bypassed the
 * online/local mode resolver. Delegating here fixes both: every caller of
 * executeQuery/executeTransaction now uses the same resolved pool as the rest
 * of the app. Prefer importing from '@/lib/db' directly in new code.
 */
import { query, getConnection, withTransaction } from '@/lib/db';

export async function executeQuery(sql: string, params: unknown[] = []): Promise<unknown> {
  return query(sql, params as any[]);
}

export async function executeQuerySingle(sql: string, params: any[] = []): Promise<any> {
  const results = await query(sql, params);
  return Array.isArray(results) && results.length > 0 ? results[0] : null;
}

export async function executeTransaction(
  queries: { query: string; params?: unknown[] }[],
): Promise<unknown[]> {
  return withTransaction(async (conn) => {
    const results: unknown[] = [];
    for (const { query: sql, params = [] } of queries) {
      const [result] = await conn.execute(sql, params as any[]);
      results.push(result);
    }
    return results;
  });
}

/** No-op: the central pool is process-managed and must not be closed per-call. */
export async function closeConnection(): Promise<void> {
  /* intentionally empty — pool lifecycle is owned by @/lib/db */
}

export async function testConnection(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Re-export for callers that want a single connection (mode-aware).
export { getConnection };

const DatabaseService = {
  executeQuery,
  executeQuerySingle,
  executeTransaction,
  closeConnection,
  testConnection,
};

export default DatabaseService;
