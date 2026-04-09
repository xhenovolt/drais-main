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
         d.location, d.ip_address, d.status, d.push_version, d.school_id,
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
          WHERE m.device_sn = d.sn OR m.device_sn IS NULL) AS mapped_users,
         ss.sync_status,
         ss.expected_user_count,
         ss.last_known_device_user_count,
         ss.last_sync_at
       FROM devices d
       LEFT JOIN device_sync_state ss ON ss.device_sn = d.sn
       WHERE d.deleted_at IS NULL
       ORDER BY d.last_seen DESC`,
      [],
    );

    // Fallback: if no registered devices, discover from recent ADMS traffic (any school)
    let discovered: any[] = [];
    if (devices.length === 0) {
      discovered = await query(
        `SELECT
           device_sn AS serial_number,
           MAX(check_time) AS last_heartbeat,
           COUNT(*) AS today_punches,
           'discovered' AS status,
           CASE
             WHEN MAX(check_time) > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 'online'
             ELSE 'offline'
           END AS connection_status
         FROM zk_attendance_logs
         WHERE check_time > DATE_SUB(NOW(), INTERVAL 7 DAY)
         GROUP BY device_sn
         ORDER BY last_heartbeat DESC`,
        [],
      );
    }

    // Debug: last heartbeat info
    const lastHeartbeat = await query(
      `SELECT sn, ip, push_version, created_at
       FROM device_heartbeats
       ORDER BY created_at DESC LIMIT 5`,
      [],
    );

    return NextResponse.json({ success: true, data: devices, discovered, debug: { lastHeartbeats: lastHeartbeat } });
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

    // Verify device exists
    const existing = await query(
      'SELECT id FROM devices WHERE id = ? AND deleted_at IS NULL',
      [id],
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
       WHERE id = ?`,
      [device_name || null, location || null, model || null, status || null, id],
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
      'SELECT sn FROM devices WHERE id = ? AND deleted_at IS NULL',
      [id],
    );
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    await query(
      `UPDATE devices SET deleted_at = NOW(), status = 'inactive', is_online = FALSE WHERE id = ?`,
      [id],
    );

    await logAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: AuditAction.DELETED_STAFF, // closest available
      entityType: 'device',
      entityId: Number(id),
      details: { serial_number: existing[0].sn, soft_delete: true },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    return NextResponse.json({ success: true, message: 'Device removed (will auto-recover on next heartbeat)' });
  } catch (err) {
    console.error('[ZK Devices DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}
