import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureDeviceOwnershipSchema } from '@/lib/devices/migrations/devices-ownership-schema';

export const runtime = 'nodejs';

/**
 * GET /api/cron/device-status
 *
 * Background sweeper. Phase 2 upgrades this from "silent status flip"
 * to a first-class alert producer:
 *
 *   1. Devices that have not heart-beaten in >2 minutes are marked
 *      offline AND emit a 'device_offline' device_alerts row. Phase 5
 *      notification policies subscribe to that row to fan out SMS.
 *      Dedup: an open alert for the same (sn, code) is reused — we
 *      do not flood ops with one alert per cron tick while the
 *      device is still down.
 *
 *   2. Commands that have been 'sent' for >30s without an ACK are
 *      either retried (if retries left) or failed. Pre-existing
 *      behaviour preserved.
 *
 *   3. Commands past their expires_at are expired.
 *
 *   4. Devices that came back online (last_seen within window) and
 *      have an OPEN offline alert get the alert auto-acknowledged so
 *      ops dashboards stay clean.
 *
 * Scheduling: see vercel.json `crons` block. The route is also
 * callable manually (no auth) or with CRON_SECRET header for
 * Vercel-side protection.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
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
    //    alert row, not one per cron tick.
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

    return NextResponse.json({
      success: true,
      devices_marked_offline: devicesAffected,
      alerts_opened: alertsOpened,
      alerts_auto_acked: alertsAutoAcked,
      commands_timed_out: cmdsTimedOut,
      commands_retried: cmdsRetried,
      commands_expired: cmdsExpired,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Cron Device Status] Error:', err);
    return NextResponse.json({ error: 'Failed to update device status' }, { status: 500 });
  }
}
