/**
 * Attendance intelligence sweep — the founder-independence fix.
 *
 * Every intelligence layer (Recovery, Device Intelligence, per-record
 * confidence, the dashboard/logs clock badges) depends on
 * `device_clock_health` and `attendance_time_baselines` being populated. Those
 * were only ever written when a human opened the Time Health page — so the
 * "self-healing" platform in fact only healed when the founder remembered to
 * visit a route. This module removes that coupling:
 *
 *   sweepSchoolIntelligence(schoolId)  — evaluate today's clock health for
 *       every device with punches today (learns the baseline on first sight).
 *       Throttled per school (once/hour) via an in-memory guard so it is safe
 *       to call opportunistically on any intelligence-page load.
 *   sweepAllSchools()  — the cron entry: run the above for every school with
 *       recent attendance activity, so the data stays fresh with ZERO visits.
 */
import { query } from '@/lib/db';
import { evaluateDeviceDay } from '@/lib/attendance/time-intelligence/engine';

const lastSweep = new Map<number, number>();
const THROTTLE_MS = 60 * 60 * 1000; // once per hour per school

export async function sweepSchoolIntelligence(schoolId: number, force = false): Promise<{ devices: number }> {
  const now = Date.now();
  if (!force && (now - (lastSweep.get(schoolId) || 0)) < THROTTLE_MS) return { devices: 0 };
  lastSweep.set(schoolId, now);

  const devices = (await query(
    `SELECT DISTINCT device_sn FROM attendance_raw_events
      WHERE school_id = ? AND device_sn IS NOT NULL
        AND punch_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)`,
    [schoolId],
  ).catch(() => [])) as Array<{ device_sn: string }>;

  let n = 0;
  for (const d of devices) {
    try { await evaluateDeviceDay(schoolId, d.device_sn); n++; } catch { /* per-device best-effort */ }
  }

  // Materialise absent rows for no-shows (past days + today after school),
  // so per-person profiles / analytics / allowance see real absence — not a
  // silent gap. Idempotent; finalizeDay skips people who already have a row.
  try {
    const { finalizeDay } = await import('@/lib/attendance/finalize-day');
    await finalizeDay(schoolId);            // today (after hours) or no-op
    const y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await finalizeDay(schoolId, y);         // yesterday, guaranteed complete
  } catch { /* finalization is best-effort */ }

  return { devices: n };
}

/** Fire-and-forget opportunistic refresh — never blocks the caller. */
export function sweepSchoolIntelligenceInBackground(schoolId: number): void {
  sweepSchoolIntelligence(schoolId).catch(() => {});
}

/** Cron entry — sweep every school with recent attendance activity. */
export async function sweepAllSchools(): Promise<{ schools: number; devices: number }> {
  const schools = (await query(
    `SELECT DISTINCT school_id FROM attendance_raw_events
      WHERE punch_at >= DATE_SUB(NOW(), INTERVAL 3 DAY) AND school_id IS NOT NULL`,
    [],
  ).catch(() => [])) as Array<{ school_id: number }>;

  let devices = 0;
  for (const s of schools) {
    const r = await sweepSchoolIntelligence(Number(s.school_id), true).catch(() => ({ devices: 0 }));
    devices += r.devices;
  }
  return { schools: schools.length, devices };
}
