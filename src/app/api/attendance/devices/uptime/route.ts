/**
 * GET /api/attendance/devices/uptime — uptime of THIS school's devices (current status and for how long,
 * last seen, uptime % today / 7 days / 30 days, recent offline gaps). See lib/devices/uptime.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { deviceUptime } from '@/lib/devices/uptime';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated', devices: [] }, { status: 401 });
  try {
    const { devices, threshold_minutes } = await deviceUptime({ schoolId: session.schoolId });
    return NextResponse.json({ success: true, devices, threshold_minutes });
  } catch (e: any) {
    console.error('[attendance/devices/uptime] failed', e);
    return NextResponse.json({ success: false, error: 'Could not load device uptime', devices: [] }, { status: 500 });
  }
}
