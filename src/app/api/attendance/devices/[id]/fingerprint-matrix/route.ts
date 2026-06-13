/**
 * GET /api/attendance/devices/[sn]/fingerprint-matrix
 *
 * Phase 3F — per-person-per-device biometric truth. Powers the device
 * "People on Device" / "Missing" tabs and the per-person template
 * status column.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import { getDeviceFingerprintMatrix } from '@/lib/biometric/fingerprint-status';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const matrix = await getDeviceFingerprintMatrix(access.schoolId, sn);
    return NextResponse.json({ success: true, device: access.device, matrix });
  } catch (err: any) {
    console.error('[fingerprint-matrix GET]', err);
    return NextResponse.json({ error: 'Failed to build fingerprint matrix' }, { status: 500 });
  }
}
