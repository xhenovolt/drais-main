import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/zk/devices
 * List all ZK devices with status and stats.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const devices = await query(
      `SELECT
         d.id, d.sn AS serial_number, d.device_name, d.model_name AS model, d.firmware_version,
         d.location, d.ip_address, d.status, d.push_version,
         d.last_seen AS last_heartbeat, d.last_activity, d.created_at AS registered_at,
         CASE
           WHEN d.last_seen > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 'online'
           WHEN d.last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'delayed'
           ELSE 'offline'
         END AS connection_status,
         (SELECT COUNT(*) FROM zk_attendance_logs al
          WHERE al.device_sn = d.sn AND DATE(al.check_time) = CURDATE()) AS today_punches,
         (SELECT COUNT(*) FROM zk_device_commands c
          WHERE c.device_sn = d.sn AND c.status = 'pending') AS pending_commands,
         (SELECT COUNT(*) FROM zk_user_mapping m
          WHERE m.device_sn = d.sn OR m.device_sn IS NULL) AS mapped_users
       FROM devices d
       WHERE d.school_id = ?
       ORDER BY d.last_seen DESC`,
      [session.schoolId],
    );

    return NextResponse.json({ success: true, data: devices });
  } catch (err) {
    console.error('[ZK Devices GET] Error:', err);
    return NextResponse.json({ error: 'Failed to load devices' }, { status: 500 });
  }
}

/**
 * PUT /api/attendance/zk/devices
 * Update device metadata (name, location, model, status).
 */
export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, device_name, location, model, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await query(
      'SELECT id FROM devices WHERE id = ? AND school_id = ?',
      [id, session.schoolId],
    );
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    await query(
      `UPDATE devices SET
         device_name = COALESCE(?, device_name),
         location = COALESCE(?, location),
         model_name = COALESCE(?, model_name),
         status = COALESCE(?, status),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND school_id = ?`,
      [device_name || null, location || null, model || null, status || null, id, session.schoolId],
    );

    await logAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: AuditAction.UPDATED_STAFF, // closest available
      entityType: 'device',
      entityId: id,
      details: { device_name, location, model, status },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    return NextResponse.json({ success: true, message: 'Device updated' });
  } catch (err) {
    console.error('[ZK Devices PUT] Error:', err);
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
  }
}

/**
 * DELETE /api/attendance/zk/devices
 * Remove a device from the registry (doesn't delete logs).
 */
export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  try {
    const existing = await query(
      'SELECT sn FROM devices WHERE id = ? AND school_id = ?',
      [id, session.schoolId],
    );
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    await query('DELETE FROM devices WHERE id = ? AND school_id = ?', [id, session.schoolId]);

    await logAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: AuditAction.DELETED_STAFF, // closest available
      entityType: 'device',
      entityId: Number(id),
      details: { serial_number: existing[0].sn },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    return NextResponse.json({ success: true, message: 'Device removed' });
  } catch (err) {
    console.error('[ZK Devices DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}
