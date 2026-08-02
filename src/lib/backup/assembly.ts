/**
 * Database Backup Center — assembly + split.
 *
 * Runs after every table has been dumped into `backup_chunks` by the /step
 * loop. Concatenates everything into the final SQL file, computes the
 * integrity checksum over that FULL assembled text (independent of how it's
 * later split for upload), then re-splits into parts small enough for
 * Cloudinary's free/basic raw-upload ceiling (~10MB) — each part gzip'd
 * independently so it's a self-contained, valid gzip stream on its own.
 *
 * Split parts are stored back into `backup_chunks` (table_name =
 * PART_MARKER) rather than held in request memory, because the actual
 * Cloudinary upload happens in SEPARATE, later serverless invocations (one
 * part per call, same Hobby-timeout reasoning as the generation /step loop)
 * — durability has to come from TiDB, not from holding buffers across
 * requests that may run on different instances.
 */
import { query } from '@/lib/db';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { gunzipChunk } from './generator';

export const PART_MARKER = '__upload_part__';
const TARGET_PART_GZIP_BYTES = 7 * 1024 * 1024; // safety margin under Cloudinary's ~10MB raw cap

interface ChunkRow { seq: number; table_name: string; sql_gzip: Buffer }

export interface AssembleResult { partCount: number; totalBytes: number; checksum: string; alreadyDone: boolean }

export async function assembleAndSplit(backupId: number): Promise<AssembleResult> {
  const existingParts = (await query(
    `SELECT COUNT(*) AS n FROM backup_chunks WHERE backup_id = ? AND table_name = ?`,
    [backupId, PART_MARKER],
  )) as Array<{ n: number }>;
  const sourceRows = (await query(
    `SELECT seq, table_name, sql_gzip FROM backup_chunks WHERE backup_id = ? AND table_name <> ? ORDER BY seq ASC`,
    [backupId, PART_MARKER],
  )) as ChunkRow[];

  if (Number(existingParts[0]?.n ?? 0) > 0 && sourceRows.length === 0) {
    // Already assembled+split by a prior call (idempotent re-entry) —
    // report back what's already recorded rather than redoing the work.
    const rec = (await query(`SELECT checksum_sha256, compressed_bytes, uncompressed_bytes FROM backup_records WHERE id = ?`, [backupId])) as any[];
    const partRows = (await query(`SELECT COUNT(*) AS n FROM backup_chunks WHERE backup_id = ? AND table_name = ?`, [backupId, PART_MARKER])) as Array<{ n: number }>;
    return {
      partCount: Number(partRows[0]?.n ?? 0), alreadyDone: true,
      totalBytes: Number(rec[0]?.uncompressed_bytes ?? 0), checksum: rec[0]?.checksum_sha256 ?? '',
    };
  }

  if (!sourceRows.length) throw new Error('No table data was generated for this backup — nothing to assemble.');

  // Defensive: a prior attempt could have crashed AFTER inserting some part
  // rows but BEFORE deleting the source chunks (the two steps aren't
  // atomic across separate statements) — clear any such leftovers before
  // recomputing, or a retry would insert duplicate parts on top.
  if (Number(existingParts[0]?.n ?? 0) > 0) {
    await query(`DELETE FROM backup_chunks WHERE backup_id = ? AND table_name = ?`, [backupId, PART_MARKER]);
  }

  const sqlParts: string[] = sourceRows.map((r) => gunzipChunk(r.sql_gzip));
  const assembled = sqlParts.join('');
  const totalBytes = Buffer.byteLength(assembled, 'utf8');
  const checksum = crypto.createHash('sha256').update(assembled, 'utf8').digest('hex');

  // Split by line so we never cut a statement mid-way; grow each part until
  // its gzip'd size approaches the target, independent of raw byte count
  // (binary-ish columns like fingerprint templates compress far worse than
  // ordinary SQL text, so a fixed raw-byte split would be unsafe).
  const lines = assembled.split(/(?<=\n)/); // keep newlines attached
  const parts: Buffer[] = [];
  let current = '';
  let currentGzipEstimate = 0;
  for (const line of lines) {
    current += line;
    // Re-gzip only every ~200 lines to avoid O(n^2) cost on huge files —
    // good enough for a size target, not an exact boundary.
    currentGzipEstimate++;
    if (currentGzipEstimate % 200 === 0) {
      const gz = zlib.gzipSync(Buffer.from(current, 'utf8'));
      if (gz.length >= TARGET_PART_GZIP_BYTES) {
        parts.push(gz);
        current = '';
        currentGzipEstimate = 0;
      }
    }
  }
  if (current.length) parts.push(zlib.gzipSync(Buffer.from(current, 'utf8')));

  let compressedBytes = 0;
  for (const p of parts) compressedBytes += p.length;

  // Persist the split parts durably, then drop the per-table source chunks
  // (already folded into the assembled+checksummed file — no longer needed).
  for (let i = 0; i < parts.length; i++) {
    await query(
      `INSERT INTO backup_chunks (backup_id, seq, table_name, sql_gzip, row_count) VALUES (?, ?, ?, ?, 0)`,
      [backupId, i, PART_MARKER, parts[i]],
    );
  }
  await query(`DELETE FROM backup_chunks WHERE backup_id = ? AND table_name <> ?`, [backupId, PART_MARKER]);
  await query(
    `UPDATE backup_records SET checksum_sha256 = ?, uncompressed_bytes = ?, compressed_bytes = ? WHERE id = ?`,
    [checksum, totalBytes, compressedBytes, backupId],
  );

  return { partCount: parts.length, totalBytes, checksum, alreadyDone: false };
}
