import { NextRequest, NextResponse } from 'next/server';
import { processPendingDeliveries } from '@/lib/platform/webhooks';
import { pruneRateLimits } from '@/lib/platform/rateLimit';

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.headers.get('x-cron-secret');
  return provided === expected;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const r = await processPendingDeliveries();
  await pruneRateLimits(15);
  return NextResponse.json({ success: true, ...r });
}

export async function POST(req: NextRequest) { return GET(req); }
