import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/attendance/zk/devices/sync-members
 * Queue a DATA QUERY USERINFO command so the device pushes its enrolled members.
 *
 * Body: { device_sn: string }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { device_sn } = await req.json();
    if (!device_sn) {
      return NextResponse.json({ error: 'device_sn is required' }, { status: 400 });
    }

    // Verify device exists (devices are school-agnostic)
    const device = await query(
      'SELECT id, sn, school_id FROM devices WHERE sn = ? AND deleted_at IS NULL',
      [device_sn],
    );
    if (!device || device.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const deviceSchoolId = device[0].school_id || session.schoolId;

    // Check if there's already a pending/sent USERINFO command
    const existing = await query(
      `SELECT id, status FROM zk_device_commands
       WHERE device_sn = ? AND command = 'DATA QUERY USERINFO'
         AND status IN ('pending', 'sent')
       LIMIT 1`,
      [device_sn],
    );
    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        message: 'Sync already in progress',
        command_id: existing[0].id,
        status: existing[0].status,
      });
    }

    // Queue the command with high priority (delivered on next heartbeat)
    const result = await query(
      `INSERT INTO zk_device_commands
         (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, 'DATA QUERY USERINFO', 10, 3,
               DATE_ADD(NOW(), INTERVAL 1 HOUR), ?)`,
      [deviceSchoolId, device_sn, session.userId],
    );

    const commandId = (result as any)?.insertId;

    return NextResponse.json({
      success: true,
      message: 'Member sync queued — will execute on next device heartbeat',
      command_id: commandId,
      status: 'pending',
    });
  } catch (err: any) {
    console.error('[sync-members POST] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to queue sync' }, { status: 500 });
  }
}

/**
 * GET /api/attendance/zk/devices/sync-members?device_sn=xxx
 * Check the status of a member sync operation.
 *
 * Returns:
 *   - pending:      command queued, waiting for heartbeat
 *   - sent:         command delivered, waiting for device response
 *   - acknowledged: device responded, members saved to zk_user_mapping
 *   - failed/expired: command failed
 *   - idle:         no sync in progress
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const deviceSn = new URL(req.url).searchParams.get('device_sn');
  if (!deviceSn) {
    return NextResponse.json({ error: 'device_sn query param required' }, { status: 400 });
  }

  try {
    // Look up device (devices are school-agnostic)
    const deviceRow = await query('SELECT school_id FROM devices WHERE sn = ? AND deleted_at IS NULL', [deviceSn]);
    if (!deviceRow || deviceRow.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    const deviceSchoolId = deviceRow[0].school_id || session.schoolId;

    // Get latest USERINFO command for this device
    const cmd = await query(
      `SELECT id, status, sent_at, ack_at, retry_count, created_at
       FROM zk_device_commands
       WHERE device_sn = ? AND command = 'DATA QUERY USERINFO'
       ORDER BY id DESC
       LIMIT 1`,
      [deviceSn],
    );

    if (!cmd || cmd.length === 0) {
      return NextResponse.json({ success: true, sync_status: 'idle', members: [] });
    }

    const command = cmd[0];

    // Get current member list from zk_user_mapping
    const members = await query(
      `SELECT
         m.device_user_id, m.user_type, m.student_id, m.staff_id, m.card_number,
         COALESCE(
           CONCAT(sp.first_name, ' ', sp.last_name),
           CONCAT(tp.first_name, ' ', tp.last_name)
         ) AS resolved_name,
         m.updated_at
       FROM zk_user_mapping m
       LEFT JOIN students s ON m.student_id = s.id
       LEFT JOIN people sp ON s.person_id = sp.id
       LEFT JOIN staff st ON m.staff_id = st.id
       LEFT JOIN people tp ON st.person_id = tp.id
       WHERE (m.device_sn = ? OR m.device_sn IS NULL)
       ORDER BY CAST(m.device_user_id AS UNSIGNED) ASC`,
      [deviceSn],
    );

    return NextResponse.json({
      success: true,
      sync_status: command.status,
      command_id: command.id,
      sent_at: command.sent_at,
      ack_at: command.ack_at,
      retry_count: command.retry_count,
      members: members || [],
      member_count: members?.length || 0,
    });
  } catch (err: any) {
    console.error('[sync-members GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to check sync status' }, { status: 500 });
  }
}
