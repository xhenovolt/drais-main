/**
 * Control Center — full detail for one device (Roadmap P2 / detail).
 *   GET → the device row + live counts + owner + its ownership timeline.
 * Control session required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { deviceDetail, deviceTimeline } from '@/lib/control/devices';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ sn: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { sn } = await ctx.params;
  const [device, timeline] = await Promise.all([
    deviceDetail(sn).catch(() => null),
    deviceTimeline(sn).catch(() => []),
  ]);
  return NextResponse.json({ success: true, device, timeline });
}
