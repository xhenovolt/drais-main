/**
 * Database Backup Center — Cloudinary upload (raw, chunked).
 *
 * Genuinely new upload path for this codebase — the existing
 * src/lib/cloudinary.ts wrapper only handles small image uploads
 * (base64 data-URI, resource_type:'image'). SQL backup parts need
 * resource_type:'raw' and Cloudinary's chunked `upload_large`.
 *
 * IMPORTANT (found via live testing against the real account): this
 * package's `upload_large_stream` is NOT present at runtime despite being
 * declared in its .d.ts — and `upload_large(path, options)` called WITHOUT
 * a callback resolves before the internal file read/upload actually
 * finishes (its Promise-vs-stream return type is ambiguous depending on
 * arguments), which raced a temp-file delete against Cloudinary's own read
 * of that same file. The reliable path, confirmed against production
 * Cloudinary: `upload_large(path, options, callback)` — a real file path on
 * disk, callback-wrapped in a Promise, only deleting the temp file AFTER
 * the callback fires.
 *
 * Uploads ONE part per call — matches the same "bounded per serverless
 * invocation" reasoning as the generation /step loop. The caller (the
 * /finalize route) loops calling this until every backup_chunks PART_MARKER
 * row is uploaded.
 */
import { v2 as cloudinary } from 'cloudinary';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query } from '@/lib/db';
import { PART_MARKER } from './assembly';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error('[Backup/Cloudinary] Missing env vars: CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET');
}
cloudinary.config({ cloud_name: CLOUD_NAME, api_key: API_KEY, api_secret: API_SECRET, secure: true });

async function uploadBuffer(buffer: Buffer, publicId: string): Promise<{ secure_url: string; public_id: string; bytes: number }> {
  const tmpPath = path.join(os.tmpdir(), `drais-backup-${publicId.replace(/[^A-Za-z0-9_-]/g, '_')}.gz`);
  fs.writeFileSync(tmpPath, buffer);
  try {
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_large(
        tmpPath,
        { resource_type: 'raw', folder: 'drais-backups', public_id: publicId, chunk_size: 6_000_000 },
        (err, res) => (err ? reject(err) : resolve(res)),
      );
    });
    return { secure_url: result.secure_url, public_id: result.public_id, bytes: result.bytes };
  } finally {
    fs.unlink(tmpPath, () => {}); // best-effort cleanup, never blocks the upload result
  }
}

export interface UploadStepResult { done: boolean; partsRemaining: number; uploadedPart?: number }

/** Upload the next pending part for a backup. Idempotent per call — each
 *  invocation uploads exactly one part and removes its staged chunk row. */
export async function uploadNextBackupPart(backupId: number, backupUuid: string): Promise<UploadStepResult> {
  const rows = (await query(
    `SELECT id, seq, sql_gzip FROM backup_chunks WHERE backup_id = ? AND table_name = ? ORDER BY seq ASC LIMIT 1`,
    [backupId, PART_MARKER],
  )) as Array<{ id: number; seq: number; sql_gzip: Buffer }>;

  if (!rows.length) return { done: true, partsRemaining: 0 };

  const part = rows[0];
  const publicId = `${backupUuid}-part${String(part.seq).padStart(3, '0')}`;
  const result = await uploadBuffer(part.sql_gzip, publicId);

  await query(
    `INSERT INTO backup_parts (backup_id, part_number, cloudinary_public_id, cloudinary_secure_url, bytes) VALUES (?, ?, ?, ?, ?)`,
    [backupId, part.seq, result.public_id, result.secure_url, result.bytes],
  );
  await query(`DELETE FROM backup_chunks WHERE id = ?`, [part.id]);

  const remaining = (await query(
    `SELECT COUNT(*) AS n FROM backup_chunks WHERE backup_id = ? AND table_name = ?`,
    [backupId, PART_MARKER],
  )) as Array<{ n: number }>;
  const partsRemaining = Number(remaining[0]?.n ?? 0);
  return { done: partsRemaining === 0, partsRemaining, uploadedPart: part.seq };
}

export async function deleteBackupAssets(backupId: number): Promise<void> {
  const parts = (await query(`SELECT cloudinary_public_id FROM backup_parts WHERE backup_id = ?`, [backupId])) as Array<{ cloudinary_public_id: string }>;
  for (const p of parts) {
    await cloudinary.uploader.destroy(p.cloudinary_public_id, { resource_type: 'raw' }).catch(() => {});
  }
}
