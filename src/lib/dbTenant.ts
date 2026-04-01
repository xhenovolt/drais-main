/**
 * src/lib/dbTenant.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central tenant-scoped DB wrapper.
 * Every query that touches tenant data MUST go through queryTenant() or
 * execTenant() to guarantee school_id isolation. Throws immediately if
 * school_id is missing or the SQL does not reference school_id.
 *
 * Usage:
 *   import { queryTenant, execTenant, withTenantTransaction } from '@/lib/dbTenant';
 *
 *   const students = await queryTenant(
 *     'SELECT * FROM students WHERE school_id = ? AND status = ?',
 *     [schoolId, 'active'],
 *     schoolId
 *   );
 */
import { query, getConnection, withTransaction } from '@/lib/db';
import type mysql from 'mysql2/promise';

// ─── Guard ───────────────────────────────────────────────────────────────────

function assertTenantSafe(sql: string, schoolId: number): void {
  if (!schoolId || schoolId <= 0) {
    throw new Error(`[dbTenant] FATAL: Missing or invalid school_id (got ${schoolId}). Every tenant query requires a valid school_id.`);
  }
  if (!/school_id/i.test(sql)) {
    throw new Error(
      `[dbTenant] UNSAFE QUERY: SQL does not reference school_id. ` +
      `All tenant-scoped queries must include a school_id filter.\n` +
      `Query: ${sql.substring(0, 200)}`
    );
  }
}

/**
 * Sanitize params: convert undefined → null to avoid mysql2 bind errors.
 */
function sanitize(params: any[]): any[] {
  return params.map(p => (p === undefined ? null : p));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Execute a SELECT query with mandatory school_id isolation.
 * Returns rows as any[].
 */
export async function queryTenant(
  sql: string,
  params: any[],
  schoolId: number,
): Promise<any[]> {
  assertTenantSafe(sql, schoolId);
  return query(sql, sanitize(params));
}

/**
 * Execute a tenant-scoped query on an existing connection (for transactions).
 * Returns the raw mysql2 result (insertId, affectedRows, etc.).
 */
export async function execTenant(
  conn: mysql.Connection | mysql.PoolConnection,
  sql: string,
  params: any[],
  schoolId: number,
): Promise<any> {
  assertTenantSafe(sql, schoolId);
  const [result] = await conn.execute(sql, sanitize(params));
  return result;
}

/**
 * Run a callback inside a transaction with tenant assertion on every query.
 * The callback receives a helper that wraps conn.execute with tenant checks.
 */
export async function withTenantTransaction<T>(
  schoolId: number,
  fn: (helpers: {
    exec: (sql: string, params: any[]) => Promise<any>;
    query: (sql: string, params: any[]) => Promise<any[]>;
    conn: mysql.PoolConnection;
  }) => Promise<T>,
): Promise<T> {
  if (!schoolId || schoolId <= 0) {
    throw new Error(`[dbTenant] FATAL: Cannot start tenant transaction without valid school_id (got ${schoolId})`);
  }

  return withTransaction(async (conn) => {
    const exec = async (sql: string, params: any[]): Promise<any> => {
      assertTenantSafe(sql, schoolId);
      const [result] = await conn.execute(sql, sanitize(params));
      return result;
    };

    const queryFn = async (sql: string, params: any[]): Promise<any[]> => {
      assertTenantSafe(sql, schoolId);
      const [rows] = await conn.execute(sql, sanitize(params));
      return rows as any[];
    };

    return fn({ exec, query: queryFn, conn });
  });
}
