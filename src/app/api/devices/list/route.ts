/**
 * GET /api/devices/list — this school's registered devices.
 *
 * Now AUTHENTICATED and SCHOOL-SCOPED (it was previously unauthenticated +
 * unscoped, then briefly retired — but several school pages depend on it for
 * their device filter, so it's restored here as a properly-isolated endpoint).
 * Returns only devices belonging to the caller's school, with a computed
 * `seconds_ago`.
 */
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ success: false, message: 'Not authenticated', data: [] }, { status: 401 });
  try {
    const rows = await query(
      `SELECT id, sn, device_name, model_name, location, last_seen, ip_address, is_online, status,
              firmware_version, push_version, last_activity,
              TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS seconds_ago, created_at
         FROM devices
        WHERE school_id = ? AND deleted_at IS NULL
        ORDER BY last_seen DESC`,
      [session.schoolId],
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('[devices/list] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch devices', data: [] }, { status: 500 });
  }
}
