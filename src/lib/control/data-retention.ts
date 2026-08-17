/**
 * DRAIS — data retention sweep (readiness audit, Phase 2).
 *
 * The audit's finding: no retention/pruning job exists for high-volume
 * operational tables, and nothing schedules one. At scale (50 schools ×
 * 3 devices) this was projected at ~28M attendance_raw_events rows/year.
 *
 * Deliberately OPT-IN, not a decision this code makes on its own: whether
 * to permanently delete years-old raw attendance data is a retention
 * policy call for the school/platform owner, not something to default to
 * "on" with a period picked by whoever wrote this file. Nothing is ever
 * pruned unless `retention_attendance_raw_days` is explicitly set via
 * platform_settings (setRetentionDays below, or a future Control Centre
 * UI) to a positive number of days.
 *
 * Scope: attendance_raw_events only, the specific table the audit named,
 * and only rows that are BOTH older than the configured window AND
 * matched = 1 — an unmatched punch (not yet resolved to a person) is
 * never pruned regardless of age, since it may still need manual
 * identity resolution at /attendance/identity-matching.
 */
import { query } from '@/lib/db';
import { getSetting, setSetting } from '@/lib/control/platform-settings';

const RETENTION_KEY = 'retention_attendance_raw_days';
const BATCH = 5000; // bound each DELETE so a large backlog can't hold a long-running transaction

export interface RetentionSweepResult {
  enabled: boolean;
  retentionDays: number | null;
  deleted: number;
}

export async function getRetentionDays(): Promise<number | null> {
  const raw = await getSetting(RETENTION_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Explicit opt-in. Pass null to disable (the default state). */
export async function setRetentionDays(days: number | null): Promise<void> {
  await setSetting(RETENTION_KEY, days && days > 0 ? String(Math.floor(days)) : null);
}

export async function runDataRetentionSweep(): Promise<RetentionSweepResult> {
  const retentionDays = await getRetentionDays();
  if (!retentionDays) {
    return { enabled: false, retentionDays: null, deleted: 0 };
  }

  let totalDeleted = 0;
  for (let i = 0; i < 20; i++) { // hard cap of 20 batches (100k rows) per sweep run — never one unbounded delete
    const result = (await query(
      `DELETE FROM attendance_raw_events
        WHERE matched = 1 AND punch_at < DATE_SUB(NOW(), INTERVAL ? DAY)
        LIMIT ?`,
      [retentionDays, BATCH],
    )) as { affectedRows?: number };
    const n = result?.affectedRows ?? 0;
    totalDeleted += n;
    if (n < BATCH) break; // fewer than a full batch means we've caught up
  }

  return { enabled: true, retentionDays, deleted: totalDeleted };
}
