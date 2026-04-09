import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/admin/biometric-monitor/hide
 * Hide a device from the current school's view.
 * Body: { device_id: number }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { device_id } = await req.json();
    if (!device_id || typeof device_id !== 'number') {
      return NextResponse.json({ error: 'device_id is required' }, { status: 400 });
    }

    await query(
      `INSERT INTO device_school_hidden (device_id, school_id, hidden_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE hidden_at = CURRENT_TIMESTAMP, hidden_by = VALUES(hidden_by)`,
      [device_id, session.schoolId, session.userId],
    );

    return NextResponse.json({ success: true, message: 'Device hidden for this school' });
  } catch (err) {
    console.error('[Hide Device] Error:', err);
    return NextResponse.json({ error: 'Failed to hide device' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/biometric-monitor/hide
 * Unhide (show) a device for the current school.
 * Query: ?device_id=123
 */
export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const deviceId = req.nextUrl.searchParams.get('device_id');
    if (!deviceId) {
      return NextResponse.json({ error: 'device_id is required' }, { status: 400 });
    }

    await query(
      `DELETE FROM device_school_hidden WHERE device_id = ? AND school_id = ?`,
      [Number(deviceId), session.schoolId],
    );

    return NextResponse.json({ success: true, message: 'Device unhidden for this school' });
  } catch (err) {
    console.error('[Unhide Device] Error:', err);
    return NextResponse.json({ error: 'Failed to unhide device' }, { status: 500 });
  }
}
