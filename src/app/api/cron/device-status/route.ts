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

    const devicesAffected = (result as any)?.affectedRows ?? 0;

    // Expire stale commands: sent > 30 seconds ago with no ack → fail them
    const cmdResult = await query(
      `UPDATE zk_device_commands
       SET status = 'failed',
           error_message = 'Timeout: no device acknowledgment within 30 seconds',
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'sent'
         AND sent_at < DATE_SUB(NOW(), INTERVAL 30 SECOND)
         AND (retry_count >= max_retries OR max_retries = 0)`,
      [],
    );
    const cmdsTimedOut = (cmdResult as any)?.affectedRows ?? 0;

    // Reset sent commands that still have retries left → back to pending
    const retryResult = await query(
      `UPDATE zk_device_commands
       SET status = 'pending',
           error_message = CONCAT('Auto-retry: timed out after 30s (attempt ', retry_count, '/', max_retries, ')'),
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'sent'
         AND sent_at < DATE_SUB(NOW(), INTERVAL 30 SECOND)
         AND retry_count < max_retries`,
      [],
    );
    const cmdsRetried = (retryResult as any)?.affectedRows ?? 0;

    // Expire commands past their expires_at
    const expireResult = await query(
      `UPDATE zk_device_commands
       SET status = 'expired',
           error_message = 'Command expired',
           updated_at = CURRENT_TIMESTAMP
       WHERE status IN ('pending', 'sent')
         AND expires_at IS NOT NULL
         AND expires_at < NOW()`,
      [],
    );
    const cmdsExpired = (expireResult as any)?.affectedRows ?? 0;

    return NextResponse.json({
      success: true,
      devices_marked_offline: devicesAffected,
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
