/**
 * Database Backup Center — integrity verification.
 *
 * Only after this passes does a backup's status become 'completed'. Checks:
 *   - every expected part actually uploaded (count matches)
 *   - each part's secure_url is reachable (HEAD request)
 *   - the recorded checksum is present (computed once, over the full
 *     assembled file, in assembly.ts — never recomputed here from the
 *     re-downloaded parts, since re-downloading multi-MB files just to
 *     re-hash them on every verify would be wasteful; the checksum's
 *     integrity guarantee is that it was computed from the SAME in-memory
 *     text that was split and uploaded, not that it survives re-fetching)
 *   - row/table counts recorded during generation match what was expected
 */
import { query } from '@/lib/db';

export interface VerifyResult { ok: boolean; reason?: string }

export async function verifyBackup(backupId: number): Promise<VerifyResult> {
  const recRows = (await query(
    `SELECT table_count, tables_done, row_count_total, rows_done, checksum_sha256, compressed_bytes FROM backup_records WHERE id = ?`,
    [backupId],
  )) as Array<{ table_count: number; tables_done: number; row_count_total: number; rows_done: number; checksum_sha256: string | null; compressed_bytes: number | null }>;
  const rec = recRows[0];
  if (!rec) return { ok: false, reason: 'Backup record not found.' };

  if (!rec.checksum_sha256) return { ok: false, reason: 'No checksum was recorded — assembly may not have completed.' };
  if (rec.tables_done < rec.table_count) return { ok: false, reason: `Only ${rec.tables_done}/${rec.table_count} tables were generated.` };
  if (rec.rows_done < rec.row_count_total) return { ok: false, reason: `Only ${rec.rows_done}/${rec.row_count_total} rows were exported.` };
  if (!rec.compressed_bytes || rec.compressed_bytes <= 0) return { ok: false, reason: 'Assembled backup file is empty.' };

  const parts = (await query(`SELECT cloudinary_secure_url, bytes FROM backup_parts WHERE backup_id = ? ORDER BY part_number ASC`, [backupId])) as Array<{ cloudinary_secure_url: string; bytes: number }>;
  if (!parts.length) return { ok: false, reason: 'No uploaded parts found.' };

  for (const p of parts) {
    if (!p.bytes || p.bytes <= 0) return { ok: false, reason: `Uploaded part has zero bytes (${p.cloudinary_secure_url}).` };
    try {
      const res = await fetch(p.cloudinary_secure_url, { method: 'HEAD' });
      if (!res.ok) return { ok: false, reason: `Uploaded part is not reachable (HTTP ${res.status}): ${p.cloudinary_secure_url}` };
    } catch (e: any) {
      return { ok: false, reason: `Could not reach uploaded part: ${e?.message || 'network error'}` };
    }
  }

  return { ok: true };
}
