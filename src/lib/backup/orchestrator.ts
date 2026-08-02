/**
 * Database Backup Center — shared orchestration core.
 *
 * Called from BOTH the school-scoped routes (src/app/api/backup/*) and the
 * Control Center routes (src/app/api/control-center/backup/*) — the two
 * auth systems in this codebase are genuinely separate (see src/lib/auth.ts
 * vs src/lib/control/auth.ts), so rather than build one route trying to
 * satisfy both, this module holds the actual logic as plain functions
 * taking a resolved `schoolId`, and each route family supplies that id its
 * own way (session-derived for school admins; an operator-chosen id for
 * Control Center) before calling in here. Reuse the logic, not the auth.
 */
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';
import { ensureBackupSchema } from './schema';
import { discoverSchoolTables, type TableScope } from './discovery';
import { dumpTableDDL, dumpTableBatch, gzipChunk, estimateRowCount, BATCH_SIZE } from './generator';
import { assembleAndSplit } from './assembly';
import { uploadNextBackupPart, deleteBackupAssets } from './cloudinaryUpload';
import { verifyBackup } from './verify';
import pkg from '../../../package.json';

const LARGE_BACKUP_ROW_THRESHOLD = 200_000; // heuristic — surfaced as a pre-flight warning, not a hard block

export interface BackupTableInfo extends TableScope { estimatedRows: number }

export interface StartResult {
  backupId: number;
  backupUuid: string;
  tables: BackupTableInfo[];
  estimatedRowCount: number;
  sizeWarning: boolean;
}

/** Every table this backup will cover, PLUS the school's own `schools` row
 *  (listed separately since discovery deliberately excludes the root
 *  table — see discovery.ts). */
function fullScopeWithSchoolRow(scopes: TableScope[]): TableScope[] {
  return [{ table: 'schools', ownership: 'direct', whereClause: 'id = ?' }, ...scopes];
}

export async function startBackup(
  schoolId: number, initiatedByUserId: number | null, initiatedByName: string | null, initiatedVia: 'school' | 'control',
): Promise<StartResult> {
  await ensureBackupSchema();

  const schoolRows = (await query(`SELECT name FROM schools WHERE id = ? LIMIT 1`, [schoolId])) as Array<{ name: string }>;
  if (!schoolRows.length) throw new Error(`School ${schoolId} not found`);
  const schoolName = schoolRows[0].name;

  const discovered = await discoverSchoolTables();
  const scopes = fullScopeWithSchoolRow(discovered);

  // Pre-flight size estimate — real COUNT(*) per table so the operator sees
  // a size warning BEFORE committing to the full step loop, not as a
  // surprise mid-run or upload failure. Run with bounded concurrency, not
  // sequentially — ~250 tables one-at-a-time against a remote TiDB Cloud
  // instance (each a real network round trip) is slow enough to blow a
  // serverless timeout on its own, before any real generation even starts.
  const CONCURRENCY = 12; // safely under the 25-connection pool cap
  const tables: BackupTableInfo[] = new Array(scopes.length);
  let cursor = 0;
  async function worker() {
    while (cursor < scopes.length) {
      const idx = cursor++;
      const s = scopes[idx];
      const params = s.table === 'schools' ? [schoolId] : buildParams(s, schoolId);
      const n = await estimateRowCount(s.table, s.whereClause, params).catch(() => 0);
      tables[idx] = { ...s, estimatedRows: n };
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const estimatedRowCount = tables.reduce((sum, t) => sum + t.estimatedRows, 0);
  const sizeWarning = estimatedRowCount >= LARGE_BACKUP_ROW_THRESHOLD;

  const backupUuid = randomUUID();
  const dbVersionRows = (await query(`SELECT VERSION() AS v`, [])) as Array<{ v: string }>;
  const fileName = buildFileName(schoolName);
  const res = (await query(
    `INSERT INTO backup_records
       (backup_uuid, school_id, school_name_snapshot, initiated_by_user_id, initiated_by_name, initiated_via,
        status, file_name, table_count, estimated_row_count, size_warning, drais_version, db_engine, db_version)
     VALUES (?, ?, ?, ?, ?, ?, 'generating', ?, ?, ?, ?, ?, 'TiDB/MySQL', ?)`,
    [backupUuid, schoolId, schoolName, initiatedByUserId, initiatedByName, initiatedVia,
      fileName, tables.length, estimatedRowCount, sizeWarning ? 1 : 0, pkg.version, dbVersionRows[0]?.v ?? null],
  )) as unknown as { insertId: number };

  return { backupId: res.insertId, backupUuid, tables, estimatedRowCount, sizeWarning };
}

/** DRAIS_<SchoolName>_Backup_YYYY-MM-DD_HH-mm.sql — per the spec's exact
 *  naming convention. School name is slugified (spaces -> underscores,
 *  non-alphanumerics stripped) so it's always a safe filename component. */
function buildFileName(schoolName: string): string {
  const slug = schoolName.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'School';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `DRAIS_${slug}_Backup_${stamp}.sql`;
}

/** Build the WHERE params for a scoped table — direct tables need [schoolId]
 *  once; indirect tables' nested-subquery WHERE also only ever needs the
 *  school id once, at the innermost clause (see discovery.ts). */
function buildParams(_scope: TableScope, schoolId: number): unknown[] {
  return [schoolId];
}

export interface StepResult { tableName: string; nextOffset: number; tableDone: boolean; allDone: boolean; rowsInBatch: number }

export async function stepBackup(
  backupId: number, schoolId: number, tableIndex: number, offset: number, knownEmpty = false,
): Promise<StepResult> {
  const discovered = await discoverSchoolTables();
  const scopes = fullScopeWithSchoolRow(discovered);
  if (tableIndex < 0 || tableIndex >= scopes.length) throw new Error(`Invalid tableIndex ${tableIndex}`);
  const scope = scopes[tableIndex];
  const params = buildParams(scope, schoolId);

  // seq only needs to be strictly increasing in (table, batch) order for
  // assembly's ORDER BY — computed, not queried. Saves a MAX(seq) round
  // trip on every single call, which added up materially across ~250
  // tables against a remote TiDB Cloud instance (each round trip is real
  // network latency, not free).
  const seqBase = tableIndex * 1_000_000 + offset;

  const sqlPieces: string[] = [];
  if (offset === 0) sqlPieces.push(await dumpTableDDL(scope.table));

  // The pre-flight estimate (from start()) already told the caller this
  // table has zero rows for this school — skip the row-fetch round trip
  // entirely rather than re-confirming what's already known. This is the
  // single biggest lever for the common case (most school-scoped tables
  // are empty for any given school) without changing correctness for
  // tables that actually have data.
  const batch = knownEmpty
    ? { sql: '', rowsInBatch: 0, done: true }
    : await dumpTableBatch(scope.table, scope.whereClause, params, offset, BATCH_SIZE);
  if (batch.sql) sqlPieces.push(batch.sql);

  if (sqlPieces.length) {
    await query(
      `INSERT INTO backup_chunks (backup_id, seq, table_name, sql_gzip, row_count) VALUES (?, ?, ?, ?, ?)`,
      [backupId, seqBase, scope.table, gzipChunk(sqlPieces.join('')), batch.rowsInBatch],
    );
  }

  const nextOffset = offset + batch.rowsInBatch;
  const tableDone = batch.done;
  const allDone = tableDone && tableIndex === scopes.length - 1;

  await query(
    `UPDATE backup_records SET rows_done = rows_done + ?, row_count_total = row_count_total + ?,
       tables_done = tables_done + ? WHERE id = ?`,
    [batch.rowsInBatch, batch.rowsInBatch, tableDone ? 1 : 0, backupId],
  );

  return { tableName: scope.table, nextOffset, tableDone, allDone, rowsInBatch: batch.rowsInBatch };
}

export interface FinalizeResult { stage: 'assembling' | 'uploading' | 'verifying' | 'completed' | 'failed'; error?: string; partsRemaining?: number }

/** One call = one bounded unit of finalize work (assemble+split OR upload
 *  one part OR verify) — same "bounded per invocation" shape as stepBackup,
 *  called repeatedly by the client until stage is 'completed' or 'failed'. */
export async function finalizeStep(backupId: number, backupUuid: string): Promise<FinalizeResult> {
  const recRows = (await query(`SELECT status FROM backup_records WHERE id = ?`, [backupId])) as Array<{ status: string }>;
  if (!recRows.length) return { stage: 'failed', error: 'Backup record not found.' };
  const status = recRows[0].status;

  try {
    if (status === 'generating' || status === 'finalizing') {
      await query(`UPDATE backup_records SET status = 'finalizing' WHERE id = ?`, [backupId]);
      const assembled = await assembleAndSplit(backupId);
      await query(`UPDATE backup_records SET status = 'uploading' WHERE id = ?`, [backupId]);
      return { stage: 'uploading', partsRemaining: assembled.partCount };
    }
    if (status === 'uploading') {
      const up = await uploadNextBackupPart(backupId, backupUuid);
      if (!up.done) return { stage: 'uploading', partsRemaining: up.partsRemaining };
      await query(`UPDATE backup_records SET status = 'verifying' WHERE id = ?`, [backupId]);
      return { stage: 'verifying' };
    }
    if (status === 'verifying') {
      const v = await verifyBackup(backupId);
      if (!v.ok) {
        await query(`UPDATE backup_records SET status = 'failed', error_message = ? WHERE id = ?`, [v.reason?.slice(0, 490) ?? 'Verification failed', backupId]);
        return { stage: 'failed', error: v.reason };
      }
      const rows = (await query(`SELECT started_at FROM backup_records WHERE id = ?`, [backupId])) as Array<{ started_at: Date | string }>;
      const startedAt = new Date(rows[0].started_at as any).getTime();
      const durationMs = Date.now() - startedAt;
      await query(
        `UPDATE backup_records SET status = 'completed', completed_at = CURRENT_TIMESTAMP, duration_ms = ? WHERE id = ?`,
        [durationMs, backupId],
      );
      return { stage: 'completed' };
    }
    if (status === 'completed') return { stage: 'completed' };
    return { stage: 'failed', error: `Unexpected status '${status}'` };
  } catch (e: any) {
    const msg = (e?.message || 'Unknown error').slice(0, 490);
    await query(`UPDATE backup_records SET status = 'failed', error_message = ? WHERE id = ?`, [msg, backupId]).catch(() => {});
    return { stage: 'failed', error: msg };
  }
}

export async function listBackups(schoolId: number | null, opts: { page?: number; limit?: number } = {}): Promise<{ records: any[]; total: number }> {
  await ensureBackupSchema();
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;
  const where = schoolId != null ? 'WHERE school_id = ?' : '';
  const params = schoolId != null ? [schoolId] : [];
  const records = (await query(
    `SELECT r.*, (SELECT COUNT(*) FROM backup_parts p WHERE p.backup_id = r.id) AS part_count
       FROM backup_records r ${where} ORDER BY r.started_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  )) as any[];
  const totalRows = (await query(`SELECT COUNT(*) AS n FROM backup_records ${where}`, params)) as Array<{ n: number }>;
  return { records, total: Number(totalRows[0]?.n ?? 0) };
}

export async function getBackup(backupId: number): Promise<any | null> {
  const rows = (await query(`SELECT * FROM backup_records WHERE id = ?`, [backupId])) as any[];
  return rows[0] ?? null;
}

export async function getBackupParts(backupId: number): Promise<Array<{ part_number: number; cloudinary_secure_url: string; bytes: number }>> {
  return (await query(`SELECT part_number, cloudinary_secure_url, bytes FROM backup_parts WHERE backup_id = ? ORDER BY part_number ASC`, [backupId])) as any[];
}

export async function deleteBackup(backupId: number): Promise<void> {
  await deleteBackupAssets(backupId);
  await query(`DELETE FROM backup_parts WHERE backup_id = ?`, [backupId]);
  await query(`DELETE FROM backup_chunks WHERE backup_id = ?`, [backupId]);
  await query(`DELETE FROM backup_records WHERE id = ?`, [backupId]);
}
