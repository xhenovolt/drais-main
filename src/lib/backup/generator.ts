/**
 * Database Backup Center — SQL generation primitives.
 *
 * Reuses the proven pieces from scripts/db/export-full.mjs /
 * export-albayan.mjs (SHOW CREATE TABLE for DDL, the esc() value-escaper,
 * batched LIMIT/OFFSET paging) but restructured to return one table/batch's
 * SQL text at a time instead of writing straight to a stream — the caller
 * (the /step API route) is what makes this resumable across separate
 * short-lived serverless invocations.
 */
import { query } from '@/lib/db';
import zlib from 'node:zlib';

export const BATCH_SIZE = 500;

export function esc(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex') || '0'}`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\x1a/g, '\\Z')}'`;
}

/** `SHOW CREATE TABLE` verbatim — indexes/keys are embedded in the DDL
 *  (TiDB parses but does not enforce FKs, so there's no separate FK section
 *  to capture; the DDL string already includes everything MySQL would). */
export async function dumpTableDDL(table: string): Promise<string> {
  const rows = (await query(`SHOW CREATE TABLE \`${table}\``, [])) as Array<Record<string, string>>;
  const ddl = rows[0]?.['Create Table'];
  if (!ddl) throw new Error(`SHOW CREATE TABLE returned nothing for ${table}`);
  return `-- ---------- ${table} ----------\nDROP TABLE IF EXISTS \`${table}\`;\n${ddl};\n\n`;
}

/** Estimate a table's row count for this school, for the pre-flight size
 *  warning. Uses a real COUNT(*) — information_schema.TABLE_ROWS is only an
 *  approximation and can be badly wrong on TiDB right after writes. */
export async function estimateRowCount(table: string, whereClause: string, params: unknown[]): Promise<number> {
  const rows = (await query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${whereClause}`, params)) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

export interface BatchResult { sql: string; rowsInBatch: number; done: boolean }

/** One batch of INSERT statements for a table, scoped by the discovered
 *  WHERE clause. `done` is true once fewer than BATCH_SIZE rows come back —
 *  the caller advances `offset` by rowsInBatch and keeps calling until done. */
export async function dumpTableBatch(
  table: string, whereClause: string, params: unknown[], offset: number, limit = BATCH_SIZE,
): Promise<BatchResult> {
  const rows = (await query(
    `SELECT * FROM \`${table}\` WHERE ${whereClause} LIMIT ${limit} OFFSET ${offset}`,
    params,
  )) as Array<Record<string, unknown>>;
  if (!rows.length) return { sql: '', rowsInBatch: 0, done: true };
  const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(', ');
  const values = rows.map((r) => `(${Object.values(r).map(esc).join(', ')})`).join(',\n');
  const sql = `INSERT INTO \`${table}\` (${cols}) VALUES\n${values};\n`;
  return { sql, rowsInBatch: rows.length, done: rows.length < limit };
}

export function gzipChunk(sql: string): Buffer {
  return zlib.gzipSync(Buffer.from(sql, 'utf8'));
}

export function gunzipChunk(buf: Buffer): string {
  return zlib.gunzipSync(buf).toString('utf8');
}
