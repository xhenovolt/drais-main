/**
 * Device status sweep — flips stale devices offline, opens/auto-acks
 * device_offline alerts, and expires/retries timed-out device commands.
 *
 * Extracted 2026-08-18 from src/app/api/cron/device-status/route.ts, found
 * completely orphaned while investigating why a device that had not
 * heart-beaten in 7+ days was still shown as `is_online = TRUE`: this
 * logic was written for a dedicated Vercel cron slot that was later
 * reassigned to result-deadlines (Vercel Hobby = exactly one cron), and
 * nothing ever migrated it onto the in-DB job runner the way dunning/
 * platform_health/notification_drain were — it had, as far as this
 * investigation could tell, never run in production.
 *
 * Two triggers now call this, matching the codebase's established
 * "no new cron, ever" pattern:
 *   1. The daily job-runner fan-out (result-deadlines/route.ts) — a
 *      guaranteed once-a-day floor, exactly like dunning/platform_health.
 *   2. runDeviceStatusSweepOpportunistically(), piggybacked on every
 *      device heartbeat in zk-handler.ts, throttled per-process — the
 *      same shape as drainOutboxOpportunistically() in
 *      notifications/drain.ts. This is the one that actually matters:
 *      the sweep's own 2-minute staleness threshold is meaningless if it
 *      only runs once a day, and DRAIS already has frequent real traffic
 *      (device heartbeats, every ~30-60s per device) to ride on instead
 *      of waiting for a cron slot this plan doesn't have.
 */
import { query } from '@/lib/db';
import { ensureDeviceOwnershipSchema } from '@/lib/devices/migrations/devices-ownership-schema';

export interface DeviceStatusSweepResult {
  devices_marked_offline: number;
  alerts_opened: number;
  alerts_auto_acked: number;
  commands_timed_out: number;
  commands_retried: number;
  commands_expired: number;
  checked_at: string;
}

export async function runDeviceStatusSweep(): Promise<DeviceStatusSweepResult> {
  await ensureDeviceOwnershipSchema();

  // ── 1. Find the devices that just transitioned online → offline.
  //    Collect their school_id + sn BEFORE flipping so the alert
  //    rows carry the right scope.
  const newlyOffline = (await query(
    `SELECT sn, school_id
       FROM devices
      WHERE is_online = TRUE
        AND last_seen < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        AND deleted_at IS NULL`,
    [],
  )) as Array<{ sn: string; school_id: number | null }>;

  const offlineResult = (await query(
    `UPDATE devices
        SET is_online = FALSE, status = 'offline'
      WHERE is_online = TRUE
        AND last_seen < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
        AND deleted_at IS NULL`,
    [],
  )) as { affectedRows?: number };
  const devicesAffected = Number(offlineResult?.affectedRows ?? 0);

  // ── 1a. Emit device_offline alerts. Dedup against open alerts
  //    so a device that stays offline for hours still produces one
  //    alert row, not one per sweep.
  let alertsOpened = 0;
  for (const d of newlyOffline) {
    try {
      const open = (await query(
        `SELECT id FROM device_alerts
          WHERE device_sn = ? AND code = 'device_offline'
            AND acknowledged_at IS NULL
          LIMIT 1`,
        [d.sn],
      )) as Array<{ id: number }>;
      if (open.length > 0) continue; // already-open alert; skip

      await query(
        `INSERT INTO device_alerts (device_sn, school_id, severity, code, message)
         VALUES (?, ?, 'warning', 'device_offline', ?)`,
        [d.sn, d.school_id, `Device ${d.sn} stopped heart-beating`],
      );
      alertsOpened++;
    } catch { /* best-effort; alerts are observability, not source-of-truth */ }
  }

  // ── 1b. Auto-ack open offline alerts for devices that are back.
  //    Same dedup logic in reverse — keeps ops dashboards clean.
  let alertsAutoAcked = 0;
  try {
    const r = (await query(
      `UPDATE device_alerts a
         JOIN devices d ON d.sn = a.device_sn
          SET a.acknowledged_at = CURRENT_TIMESTAMP
        WHERE a.code = 'device_offline'
          AND a.acknowledged_at IS NULL
          AND d.is_online = TRUE`,
      [],
    )) as { affectedRows?: number };
    alertsAutoAcked = Number(r?.affectedRows ?? 0);
  } catch { /* ok */ }

  // ── 2. Expire stale commands — preserved from previous version.
  const cmdResult = (await query(
    `UPDATE zk_device_commands
        SET status = 'failed',
            error_message = 'Timeout: no device acknowledgment within 30 seconds',
            updated_at = CURRENT_TIMESTAMP
      WHERE status = 'sent'
        AND sent_at < DATE_SUB(NOW(), INTERVAL 30 SECOND)
        AND (retry_count >= max_retries OR max_retries = 0)`,
    [],
  )) as { affectedRows?: number };
  const cmdsTimedOut = Number(cmdResult?.affectedRows ?? 0);

  const retryResult = (await query(
    `UPDATE zk_device_commands
        SET status = 'pending',
            error_message = CONCAT('Auto-retry: timed out after 30s (attempt ', retry_count, '/', max_retries, ')'),
            updated_at = CURRENT_TIMESTAMP
      WHERE status = 'sent'
        AND sent_at < DATE_SUB(NOW(), INTERVAL 30 SECOND)
        AND retry_count < max_retries`,
    [],
  )) as { affectedRows?: number };
  const cmdsRetried = Number(retryResult?.affectedRows ?? 0);

  const expireResult = (await query(
    `UPDATE zk_device_commands
        SET status = 'expired',
            error_message = 'Command expired',
            updated_at = CURRENT_TIMESTAMP
      WHERE status IN ('pending', 'sent')
        AND expires_at IS NOT NULL
        AND expires_at < NOW()`,
    [],
  )) as { affectedRows?: number };
  const cmdsExpired = Number(expireResult?.affectedRows ?? 0);

  return {
    devices_marked_offline: devicesAffected,
    alerts_opened: alertsOpened,
    alerts_auto_acked: alertsAutoAcked,
    commands_timed_out: cmdsTimedOut,
    commands_retried: cmdsRetried,
    commands_expired: cmdsExpired,
    checked_at: new Date().toISOString(),
  };
}

// ── Opportunistic trigger, piggybacked on device heartbeat traffic ────────
// Same shape as drainOutboxOpportunistically() in notifications/drain.ts:
// throttled per-process, fire-and-forget, never blocks the caller.
let lastOpportunisticSweep = 0;
let sweepInFlight = false;
const OPPORTUNISTIC_INTERVAL_MS = 90_000;

export function runDeviceStatusSweepOpportunistically(): void {
  const now = Date.now();
  if (sweepInFlight || now - lastOpportunisticSweep < OPPORTUNISTIC_INTERVAL_MS) return;
  lastOpportunisticSweep = now;
  sweepInFlight = true;
  runDeviceStatusSweep()
    .then((r) => {
      if (r.devices_marked_offline > 0 || r.alerts_opened > 0) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(), type: 'DEVICE_STATUS_SWEEP',
          trigger: 'heartbeat', ...r,
        }));
      }
    })
    .catch((err) => console.warn('[device-status-sweep] opportunistic sweep failed:', err))
    .finally(() => { sweepInFlight = false; });
}
