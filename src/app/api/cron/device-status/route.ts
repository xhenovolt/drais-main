import { NextRequest, NextResponse } from 'next/server';
import { runDeviceStatusSweep } from '@/lib/devices/device-status-sweep';

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
 * The actual sweep logic now lives in src/lib/devices/device-status-sweep.ts
 * (extracted 2026-08-18) — this route was never wired to any actual
 * trigger (not vercel.json, not the job-runner, not a heartbeat
 * piggyback) and appears to have never run in production; a real device
 * was found stuck `is_online = TRUE` for 7+ days as a direct result. The
 * shared function is now also called from the daily job-runner fan-out
 * AND opportunistically on every device heartbeat (see
 * runDeviceStatusSweepOpportunistically() in that file) — this route
 * itself is kept for manual/CRON_SECRET-gated on-demand use, unchanged.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDeviceStatusSweep();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[Cron Device Status] Error:', err);
    return NextResponse.json({ error: 'Failed to update device status' }, { status: 500 });
  }
}
