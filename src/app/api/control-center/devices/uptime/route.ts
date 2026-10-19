/**
 * GET /api/control-center/devices/uptime — uptime across every school (or the operator's schools),
 * worst 30-day uptime first. Retired devices are excluded. See lib/devices/uptime.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { denied, isScoped } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import { deviceUptime } from '@/lib/devices/uptime';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'devices.view')) return denied('devices.view');
  try {
    const { devices, threshold_minutes } = await deviceUptime({ schoolScope: isScoped(user) ? (user.schoolScope ?? []) : null });
    // Worst first; devices with no recorded contact at all go last.
    devices.sort((a, b) => (a.uptime.d30 ?? 101) - (b.uptime.d30 ?? 101));
    return NextResponse.json({ success: true, devices, threshold_minutes });
  } catch (e: any) {
    console.error('[control/devices/uptime] failed', e);
    return NextResponse.json({ error: `Could not load device uptime: ${e?.message || e}` }, { status: 500 });
  }
}
