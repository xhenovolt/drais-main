/**
 * POST /api/devices/reset-and-sync
 *
 * Nuclear option: wipe ALL user data from device, then re-push everyone from DB.
 * Order of operations:
 *   1. Expire all existing pending/sent commands for this device
 *   2. Enqueue CLEAR DATA USER (priority 100 — highest)
 *   3. Enqueue DATA UPDATE USERINFO for every mapped user (priority 5)
 *   4. Reset device_sync_state.last_known_device_user_count = 0
 *
 * Drais DB is always the source of truth. Device gets rebuilt from scratch.
 *
 * Body: { device_sn: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

function zkSafeName(first: string, last: string): string {
  const raw = `${first || ''} ${last || ''}`.trim();
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\t\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24) || 'Unknown';
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { device_sn?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { device_sn } = body;
  if (!device_sn) return NextResponse.json({ error: 'device_sn is required' }, { status: 400 });

  // Verify device exists
  const deviceRows = await query(
    `SELECT id, sn, school_id FROM devices WHERE sn = ? LIMIT 1`,
    [device_sn],
  );
  if (!deviceRows?.length) return NextResponse.json({ error: 'Device not found' }, { status: 404 });

  const deviceSchoolId = deviceRows[0].school_id || session.schoolId;

  try {
    // Step 1: Expire ALL pending/sent commands for this device (clean slate)
    await query(
      `UPDATE zk_device_commands
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE device_sn = ? AND status IN ('pending', 'sent')`,
      [device_sn],
    );

    // Step 2: Enqueue CLEAR DATA USER — priority 100 (goes first on next heartbeat)
    await query(
      `INSERT INTO zk_device_commands
         (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, 'CLEAR DATA USER', 100, 1, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?)`,
      [deviceSchoolId, device_sn, session.userId],
    );

    // Step 3: Get all user mappings
    const mappings = await query(
      `SELECT m.device_user_id, m.user_type, m.student_id, m.staff_id,
              p.first_name, p.last_name
       FROM zk_user_mapping m
       LEFT JOIN students s ON m.student_id = s.id AND s.deleted_at IS NULL
       LEFT JOIN staff st ON m.staff_id = st.id AND st.deleted_at IS NULL
       LEFT JOIN people p ON (
         (m.student_id IS NOT NULL AND p.id = s.person_id) OR
         (m.staff_id IS NOT NULL AND p.id = st.person_id)
       )
       WHERE (m.device_sn = ? OR m.device_sn IS NULL)
       ORDER BY CAST(m.device_user_id AS UNSIGNED) ASC`,
      [device_sn],
    );

    // Step 4: Enqueue all users after the clear
    let queued = 0;
    let errors = 0;

    for (const m of mappings || []) {
      const pin = m.device_user_id;
      if (!pin) continue;

      const name = zkSafeName(m.first_name || '', m.last_name || '');
      const cmd = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=0\tTZ=0000000100000000`;

      try {
        await query(
          `INSERT INTO zk_device_commands
             (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
           VALUES (?, ?, ?, 5, 5, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
          [deviceSchoolId, device_sn, cmd, session.userId],
        );
        queued++;
      } catch {
        errors++;
      }
    }

    // Step 5: Reset sync state — device is being wiped, user count = 0 until re-acked
    await query(
      `INSERT INTO device_sync_state
         (id, device_sn, school_id, expected_user_count, last_known_device_user_count, sync_status, updated_at)
       VALUES (?, ?, ?, ?, 0, 'syncing', NOW())
       ON DUPLICATE KEY UPDATE
         expected_user_count = VALUES(expected_user_count),
         last_known_device_user_count = 0,
         sync_status = 'syncing',
         updated_at = NOW()`,
      [device_sn, device_sn, deviceSchoolId, queued],
    );

    await logAudit({
      schoolId: session.schoolId,
      userId:   session.userId,
      action:   AuditAction.UPDATED_STAFF, // closest audit action available
      entityType: 'device',
      entityId:   deviceRows[0].id,
      details: {
        action: 'reset_and_sync',
        device_sn,
        clear_command_queued: true,
        users_queued: queued,
      },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    return NextResponse.json({
      success: true,
      message: `Device reset queued. ${queued} users will be reloaded after wipe.`,
      clear_queued: true,
      users_queued: queued,
      errors,
      total_mapped: (mappings || []).length,
    });
  } catch (err) {
    console.error('[reset-and-sync] Error:', err);
    return NextResponse.json({ error: 'Failed to queue reset commands' }, { status: 500 });
  }
}
