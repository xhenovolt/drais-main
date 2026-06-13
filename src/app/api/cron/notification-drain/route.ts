/**
 * GET /api/cron/notification-drain
 *
 * Phase 5 — outbox drainer endpoint. The drain core lives in
 * src/lib/notifications/drain.ts; this route is a thin wrapper for
 * manual or externally-scheduled invocation (cron-job.org, school
 * server crontab, uptime monitors). CRON_SECRET gates if set.
 *
 * NOTE (Phase 0 of the attendance trust refactor): this endpoint is
 * NOT scheduled in vercel.json — the Vercel hobby plan does not allow
 * additional crons. The primary pump is the ZKTeco heartbeat path
 * (zk-handler GET → drainOutboxOpportunistically), which fires every
 * time any registered device polls (~every 30-60s per device).
 */
import { NextRequest, NextResponse } from 'next/server';
import { drainNotificationOutbox } from '@/lib/notifications/drain';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await drainNotificationOutbox();
    return NextResponse.json({
      success: true,
      ...result,
      drained_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[notification-drain]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
