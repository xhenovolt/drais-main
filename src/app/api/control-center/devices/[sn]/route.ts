/**
 * Control Center — one device's ownership timeline (Roadmap P2).
 *   GET → the device_transfers history (assign / release / acquire / retire),
 *         newest first, with school names. Control session required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { deviceTimeline } from '@/lib/control/devices';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ sn: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { sn } = await ctx.params;
  const timeline = await deviceTimeline(sn).catch(() => []);
  return NextResponse.json({ success: true, timeline });
}
