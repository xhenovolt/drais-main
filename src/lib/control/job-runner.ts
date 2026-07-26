/**
 * Control Center — in-DB job runner (Phase 18 / E-14).
 *
 * Vercel Hobby allows exactly ONE cron, and DRAIS already uses it. This runner
 * breaks that ceiling WITHOUT adding a cron: periodic / retryable work becomes a
 * `platform_jobs` row, and the existing daily cron (plus any request-driven tick)
 * calls `runDueJobs()` to claim + execute due jobs with retry + backoff. No new
 * schedule is ever created.
 *
 * The scheduling maths (`computeBackoffSeconds`, `isDue`) are PURE + unit-tested.
 */
import { query } from '@/lib/db';
import { randomBytes } from 'node:crypto';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';
const STALE_LOCK_SEC = 10 * 60; // a 'running' job locked longer than this is reclaimed

/** PURE: retry backoff — 60s, 120s, 240s, … capped at 1h. */
export function computeBackoffSeconds(attempts: number): number {
  const a = Math.max(1, Math.floor(attempts));
  return Math.min(3600, 60 * 2 ** (a - 1));
}

/** PURE: is a job due to run at `now` given its run_after (ISO/epoch ms)? */
export function isDue(runAfterMs: number, nowMs: number): boolean {
  return runAfterMs <= nowMs;
}

let ensured: Promise<void> | null = null;
export function ensureJobSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS platform_jobs (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         type VARCHAR(60) NOT NULL,
         payload JSON,
         status VARCHAR(16) NOT NULL DEFAULT 'pending',
         run_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         attempts INT NOT NULL DEFAULT 0,
         max_attempts INT NOT NULL DEFAULT 5,
         lock_token CHAR(32) DEFAULT NULL,
         locked_at DATETIME DEFAULT NULL,
         last_error VARCHAR(500) DEFAULT NULL,
         dedup_key VARCHAR(120) DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         KEY idx_due (status, run_after),
         UNIQUE KEY uk_dedup (dedup_key)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
    );
  })();
  return ensured;
}

/* ── handler registry ─────────────────────────────────────────────────── */

type JobHandler = (payload: any) => Promise<any>;
const HANDLERS = new Map<string, JobHandler>();
export function registerJobHandler(type: string, fn: JobHandler): void { HANDLERS.set(type, fn); }

/* ── enqueue ──────────────────────────────────────────────────────────── */

/**
 * Enqueue a job. `dedupKey` makes it idempotent — a second enqueue with the
 * same key while one is still pending is a no-op (INSERT IGNORE on the unique key).
 */
export async function enqueueJob(args: {
  type: string; payload?: any; runAfterSec?: number; maxAttempts?: number; dedupKey?: string;
}): Promise<void> {
  await ensureJobSchema();
  const runAfter = new Date(Date.now() + (args.runAfterSec ?? 0) * 1000);
  await query(
    `INSERT ${args.dedupKey ? 'IGNORE' : ''} INTO platform_jobs (type, payload, run_after, max_attempts, dedup_key)
     VALUES (?, ?, ?, ?, ?)`,
    [args.type, JSON.stringify(args.payload ?? {}), runAfter, args.maxAttempts ?? 5, args.dedupKey ?? null],
  ).catch(() => {});
}

/* ── dispatch ─────────────────────────────────────────────────────────── */

/**
 * Claim + run all due jobs (bounded by `limit`). Claims atomically via a unique
 * lock token so overlapping ticks don't double-run. Retries with backoff up to
 * max_attempts; a job that has no registered handler is failed permanently.
 */
export async function runDueJobs(limit = 25): Promise<{ ran: number; done: number; failed: number }> {
  await ensureJobSchema();
  const token = randomBytes(16).toString('hex');

  // Atomically claim: pending-and-due, or a stale 'running' (crashed) job.
  await query(
    `UPDATE platform_jobs
        SET status = 'running', lock_token = ?, locked_at = NOW(), attempts = attempts + 1
      WHERE lock_token IS NULL
        AND ( (status = 'pending' AND run_after <= NOW())
           OR (status = 'running' AND locked_at < DATE_SUB(NOW(), INTERVAL ? SECOND)) )
      ORDER BY run_after ASC
      LIMIT ?`,
    [token, STALE_LOCK_SEC, limit],
  ).catch(() => {});

  const jobs = (await query(`SELECT * FROM platform_jobs WHERE lock_token = ?`, [token]).catch(() => [])) as any[];
  let done = 0, failed = 0;
  for (const job of jobs) {
    const handler = HANDLERS.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for job type '${job.type}'`);
      const payload = typeof job.payload === 'object' && job.payload ? job.payload : JSON.parse(job.payload || '{}');
      await handler(payload);
      await query(`UPDATE platform_jobs SET status = 'done', lock_token = NULL, last_error = NULL WHERE id = ?`, [job.id]).catch(() => {});
      done++;
    } catch (e: any) {
      const attempts = Number(job.attempts || 1);
      const max = Number(job.max_attempts || 5);
      const err = String(e?.message || e).slice(0, 500);
      if (attempts >= max) {
        await query(`UPDATE platform_jobs SET status = 'failed', lock_token = NULL, last_error = ? WHERE id = ?`, [err, job.id]).catch(() => {});
        failed++;
      } else {
        const backoff = computeBackoffSeconds(attempts);
        await query(
          `UPDATE platform_jobs SET status = 'pending', lock_token = NULL, last_error = ?,
                  run_after = DATE_ADD(NOW(), INTERVAL ? SECOND) WHERE id = ?`,
          [err, backoff, job.id],
        ).catch(() => {});
      }
    }
  }
  return { ran: jobs.length, done, failed };
}

/** Recent jobs, newest first (observability). */
export async function listJobs(limit = 50): Promise<any[]> {
  await ensureJobSchema();
  return (await query(
    `SELECT id, type, status, attempts, max_attempts, run_after, last_error, dedup_key, created_at, updated_at
       FROM platform_jobs ORDER BY id DESC LIMIT ?`, [limit],
  ).catch(() => [])) as any[];
}
