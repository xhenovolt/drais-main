/**
 * Isolated ID-card jobs backed by `id_card_jobs` (migration 050).
 *
 * Isolation guarantees
 *  - Every read/write is scoped by school_id AND created_by (a job is private to
 *    the uploader; another user in the same school gets a 404, not a 403, so job
 *    ids can't be probed).
 *  - The workbook lives only in the DB row (LONGBLOB). There is no URL to it.
 *  - Jobs expire (default 24 h) and expired rows are purged opportunistically on
 *    every create/list; users can also delete immediately (bytes are nulled).
 *  - No table touched here is a student/people/enrollment table.
 */
import { randomUUID, createHash } from 'node:crypto';
import { query } from '@/lib/db';

export const JOB_TTL_HOURS = 24;

export interface JobRow {
  id: number;
  job_uuid: string;
  school_id: number;
  created_by: number;
  status: string;
  file_name: string;
  file_size: number;
  sheet_name: string | null;
  header_row: number;
  mapping_json: string | null;
  row_count: number;
  expires_at: string | Date;
  created_at: string | Date;
}

const META_COLS = `id, job_uuid, school_id, created_by, status, file_name, file_size,
  sheet_name, header_row, mapping_json, row_count, expires_at, created_at`;

let purgedAt = 0;

/** Hard-delete expired or soft-deleted jobs (bytes included). Throttled to once a minute per process. */
export async function purgeExpiredJobs(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - purgedAt < 60_000) return 0;
  purgedAt = now;
  const res = (await query(
    `DELETE FROM id_card_jobs WHERE expires_at < UTC_TIMESTAMP() OR deleted_at IS NOT NULL`,
    [],
  )) as unknown as { affectedRows?: number };
  return res?.affectedRows ?? 0;
}

export async function createJob(p: {
  schoolId: number; userId: number; fileName: string; data: Buffer; ttlHours?: number;
}): Promise<{ uuid: string; expiresAt: Date }> {
  await purgeExpiredJobs();
  const uuid = randomUUID();
  const expiresAt = new Date(Date.now() + (p.ttlHours ?? JOB_TTL_HOURS) * 3_600_000);
  const sha = createHash('sha256').update(p.data).digest('hex');
  await query(
    `INSERT INTO id_card_jobs
       (job_uuid, school_id, created_by, status, file_name, file_size, file_sha256, file_data, expires_at)
     VALUES (?, ?, ?, 'uploaded', ?, ?, ?, ?, ?)`,
    [uuid, p.schoolId, p.userId, p.fileName.slice(0, 255), p.data.length, sha, p.data, toSqlUtc(expiresAt)],
  );
  return { uuid, expiresAt };
}

export async function getJob(uuid: string, schoolId: number, userId: number): Promise<JobRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  const rows = (await query(
    `SELECT ${META_COLS} FROM id_card_jobs
      WHERE job_uuid = ? AND school_id = ? AND created_by = ?
        AND deleted_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [uuid, schoolId, userId],
  )) as JobRow[];
  return rows[0] ?? null;
}

export async function getJobData(uuid: string, schoolId: number, userId: number): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  const rows = (await query(
    `SELECT file_data FROM id_card_jobs
      WHERE job_uuid = ? AND school_id = ? AND created_by = ?
        AND deleted_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [uuid, schoolId, userId],
  )) as Array<{ file_data: Buffer | null }>;
  return rows[0]?.file_data ?? null;
}

export async function listJobs(schoolId: number, userId: number): Promise<JobRow[]> {
  await purgeExpiredJobs();
  return (await query(
    `SELECT ${META_COLS} FROM id_card_jobs
      WHERE school_id = ? AND created_by = ? AND deleted_at IS NULL AND expires_at > UTC_TIMESTAMP()
      ORDER BY id DESC LIMIT 20`,
    [schoolId, userId],
  )) as JobRow[];
}

export async function saveMapping(
  uuid: string, schoolId: number, userId: number,
  p: { sheetName: string; headerRow: number; mapping: Record<string, string>; rowCount: number },
): Promise<boolean> {
  const res = (await query(
    `UPDATE id_card_jobs
        SET sheet_name = ?, header_row = ?, mapping_json = ?, row_count = ?, status = 'mapped'
      WHERE job_uuid = ? AND school_id = ? AND created_by = ? AND deleted_at IS NULL`,
    [p.sheetName.slice(0, 255), p.headerRow, JSON.stringify(p.mapping), p.rowCount, uuid, schoolId, userId],
  )) as unknown as { affectedRows?: number };
  return (res?.affectedRows ?? 0) > 0;
}

/** Immediate removal: the workbook bytes are destroyed, not just flagged. */
export async function deleteJob(uuid: string, schoolId: number, userId: number): Promise<boolean> {
  const res = (await query(
    `DELETE FROM id_card_jobs WHERE job_uuid = ? AND school_id = ? AND created_by = ?`,
    [uuid, schoolId, userId],
  )) as unknown as { affectedRows?: number };
  return (res?.affectedRows ?? 0) > 0;
}

function toSqlUtc(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
