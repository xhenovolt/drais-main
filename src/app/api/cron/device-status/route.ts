import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/cron/device-status
 * Background job: mark devices offline if no heartbeat in 2 minutes.
 * Call via Vercel Cron, external scheduler, or manual trigger.
 * Protected by CRON_SECRET header (optional — also works without for internal calls).
 */
export async function GET(req: NextRequest) {
  // Optional auth via cron secret
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Mark stale devices as offline (no heartbeat in 2 minutes)
    const result = await query(
      `UPDATE devices
       SET is_online = FALSE, status = 'offline'
       WHERE is_online = TRUE
         AND last_seen < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
         AND deleted_at IS NULL`,
      [],
    );

    const affected = (result as any)?.affectedRows ?? 0;

    return NextResponse.json({
      success: true,
      marked_offline: affected,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Cron Device Status] Error:', err);
    return NextResponse.json({ error: 'Failed to update device status' }, { status: 500 });
  }
}
