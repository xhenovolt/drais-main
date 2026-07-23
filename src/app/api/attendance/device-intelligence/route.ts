/**
 * GET /api/attendance/device-intelligence — per-device reputation scores +
 * maintenance recommendations (Phase 7). ?banner=1 → worst device only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { loadDeviceReputations } from '@/lib/attendance/device-intelligence-loader';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const devices = await loadDeviceReputations(session.schoolId);
    if (new URL(req.url).searchParams.get('banner')) {
      const worst = devices.find(d => d.reputation.band === 'poor') || null;
      return NextResponse.json({ success: true, worst });
    }
    return NextResponse.json({
      success: true, devices,
      fleet: devices.length
        ? Math.round(devices.reduce((a, d) => a + d.reputation.overall, 0) / devices.length)
        : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
