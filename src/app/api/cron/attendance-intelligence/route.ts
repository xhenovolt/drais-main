/**
 * GET /api/cron/attendance-intelligence
 *
 * Keeps the attendance intelligence layers fed WITHOUT anyone opening a page.
 * Runs the clock-health + baseline sweep for every school with recent
 * attendance activity. This is the founder-independence guarantee: Recovery,
 * Device Intelligence, confidence scoring and the clock badges all have
 * fresh data even if no operator visits Time Health.
 *
 * Scheduled via vercel.json; also callable with the CRON_SECRET header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { sweepAllSchools } from '@/lib/attendance/intelligence-sweep';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await sweepAllSchools();
    return NextResponse.json({ success: true, ...result, swept_at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Sweep failed' }, { status: 500 });
  }
}
