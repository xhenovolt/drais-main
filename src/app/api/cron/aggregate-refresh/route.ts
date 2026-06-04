/**
 * GET /api/cron/aggregate-refresh
 *
 * Phase 6 — refreshes attendance_daily_aggregates for every active
 * school over the last 7 days. Scheduled every 5 minutes via
 * vercel.json. Manual trigger supported with CRON_SECRET gate.
 *
 * Cost
 * ----
 * Per-school refresh is O(rows in attendance_records over the window).
 * At 500 schools × 7 days × ~1000 students/day the worst case is a
 * few million rows scanned in 5 minutes — still well within a single
 * cron invocation.
 *
 * Safety
 * ------
 * - Schema is ensured idempotently on first call.
 * - Per-school failure is logged but doesn't abort the batch — one
 *   misbehaving school's data shouldn't block the rest.
 */
import { NextRequest, NextResponse } from 'next/server';
import { refreshActiveSchools } from '@/lib/attendance/aggregates';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const lookback = Number(req.nextUrl.searchParams.get('lookback')) || 7;
    const report = await refreshActiveSchools(lookback);
    return NextResponse.json({
      success: true,
      ...report,
      refreshed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[aggregate-refresh]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
