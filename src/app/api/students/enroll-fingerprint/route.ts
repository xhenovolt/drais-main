import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/students/enroll-fingerprint?command_id=123
 * Check enrollment command status + whether fingerprint template was received.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const commandId = new URL(req.url).searchParams.get('command_id');
  if (!commandId) {
    return NextResponse.json({ error: 'command_id required' }, { status: 400 });
  }

  try {
    const rows = await query(
      `SELECT c.id, c.device_sn, c.command, c.status, c.error_message,
              c.sent_at, c.ack_at, c.retry_count, c.max_retries, c.created_at
       FROM zk_device_commands c
       WHERE c.id = ? AND c.school_id = ?
       LIMIT 1`,
      [commandId, session.schoolId],
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }

    const cmd = rows[0];

    // Extract PIN from command to check for fingerprint capture
    const pinMatch = cmd.command?.match(/PIN=(\d+)/);
    let fingerprint_captured = false;
    if (pinMatch) {
      const pin = pinMatch[1];
      // Check if zk-handler captured a fingerprint template for this PIN
      const fpRows = await query(
        `SELECT id FROM student_fingerprints sf
         JOIN zk_user_mapping m ON m.student_id = sf.student_id
         WHERE m.device_user_id = ? AND m.device_sn = ?
         LIMIT 1`,
        [pin, cmd.device_sn],
      );
      fingerprint_captured = fpRows?.length > 0;
    }

    return NextResponse.json({
      success: true,
      command: {
        id: cmd.id,
        status: cmd.status,
        error_message: cmd.error_message,
        sent_at: cmd.sent_at,
        ack_at: cmd.ack_at,
        retry_count: cmd.retry_count,
        max_retries: cmd.max_retries,
        created_at: cmd.created_at,
      },
      fingerprint_captured,
    });
  } catch (err: any) {
    console.error('[enroll-fingerprint GET] Error:', err);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}

/**
 * Name sanitizer for ZKTeco hardware (same as sync-identities).
 * - Max 24 characters, ASCII only, no tab/newline
 */
function zkName(first: string, last: string): string {
  const raw = `${first || ''} ${last || ''}`.trim();
  const ascii = raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\t\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ascii.slice(0, 24) || 'Unknown';
}

/**
 * POST /api/students/enroll-fingerprint
 *
 * Mirrors the sync-identities pattern exactly:
 *   1. Verify device exists → use device.school_id
 *   2. Resolve student name from people table
 *   3. Look up zk_user_mapping by student_id + device_sn
 *   4. If NO mapping → auto-assign next sequential PIN, upsert mapping
 *   5. Queue DATA UPDATE USERINFO command (same format that sync uses)
 *      so the device registers the user — this is the only ADMS command
 *      supported by the K40 for user management.
 *
 * NOTE: ZKTeco K40 ADMS push does NOT support remote ENROLL commands
 * (Return=-1002). Fingerprint enrollment must happen locally on the device
 * after the identity is synced. The device sends templates back via OPERLOG
 * as FP PIN=X\tFID=Y\tTMP=... which the zk-handler captures automatically.
 *
 * Body: { student_id: number, device_sn: string }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { student_id, device_sn } = body;
    if (!student_id || !device_sn) {
      return NextResponse.json(
        { error: 'student_id and device_sn are required' },
        { status: 400 },
      );
    }

    // ── 1. Verify device exists → use device school_id (like sync-identities) ──
    const deviceRows = await query(
      'SELECT id, sn, school_id FROM devices WHERE sn = ?',
      [device_sn],
    );
    if (!deviceRows || deviceRows.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    const deviceSchoolId = deviceRows[0].school_id || session.schoolId;

    // ── 2. Look up student name ──
    const studentRows = await query(
      `SELECT s.id, p.first_name, p.last_name
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.id = ? AND s.school_id = ?
       LIMIT 1`,
      [student_id, session.schoolId],
    );
    if (!studentRows || studentRows.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const safeName = zkName(studentRows[0].first_name, studentRows[0].last_name);

    // ── 3. Check existing zk_user_mapping for this student + device ──
    const mappingRows = await query(
      `SELECT device_user_id FROM zk_user_mapping
       WHERE student_id = ? AND device_sn = ?
       LIMIT 1`,
      [student_id, device_sn],
    );

    let device_user_id: number;

    if (mappingRows && mappingRows.length > 0) {
      device_user_id = Number(mappingRows[0].device_user_id);
    } else {
      // ── 4a. No mapping → assign next sequential PIN (same logic as sync-identities) ──
      const maxRow = await query(
        `SELECT MAX(CAST(device_user_id AS UNSIGNED)) AS max_pin FROM zk_user_mapping`,
      );
      device_user_id = Math.max(1, (Number(maxRow?.[0]?.max_pin) || 0) + 1);
      if (device_user_id > 65535) {
        return NextResponse.json(
          { error: 'PIN limit reached (65535). Cannot assign more users.' },
          { status: 400 },
        );
      }

      // Upsert mapping (uses device school_id, matching sync-identities)
      await query(
        `INSERT INTO zk_user_mapping (school_id, device_user_id, user_type, student_id, device_sn)
         VALUES (?, ?, 'student', ?, ?)
         ON DUPLICATE KEY UPDATE
           student_id = VALUES(student_id),
           updated_at = CURRENT_TIMESTAMP`,
        [deviceSchoolId, String(device_user_id), student_id, device_sn],
      );
    }

    // ── 5. Check for existing pending/sent DATA UPDATE USERINFO command for this PIN ──
    const existing = await query(
      `SELECT id, status FROM zk_device_commands
       WHERE device_sn = ?
         AND command LIKE ?
         AND status IN ('pending', 'sent')
       LIMIT 1`,
      [device_sn, `DATA UPDATE USERINFO PIN=${device_user_id}%`],
    );

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        message: `Identity sync already queued for ${safeName} (PIN ${device_user_id}). Waiting for device heartbeat.`,
        command_id: existing[0].id,
        status: existing[0].status,
        student_name: safeName,
        device_user_id,
        device_sn,
        already_queued: true,
      });
    }

    // ── 6. Queue DATA UPDATE USERINFO — same command sync-identities uses ──
    //    This is the ONLY ADMS command the K40 supports for user registration.
    //    After the device acks this, the user appears on device and can enroll
    //    their fingerprint locally. Device sends FP template back via OPERLOG.
    const syncCmd = `DATA UPDATE USERINFO PIN=${device_user_id}\tName=${safeName}\tPri=0\tPasswd=\tCard=\tGrp=0\tTZ=0000000100000000`;
    const result = await query(
      `INSERT INTO zk_device_commands
         (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, ?, 5, 5, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
      [deviceSchoolId, device_sn, syncCmd, session.userId],
    );

    const commandId = (result as any)?.insertId;

    console.log(
      `[enroll-fingerprint] Synced identity for ${safeName} (PIN=${device_user_id}) on ${device_sn}, cmd=${commandId}`,
    );

    return NextResponse.json({
      success: true,
      message: `${safeName} synced to device (PIN ${device_user_id}). Enroll fingerprint on device now.`,
      command_id: commandId,
      student_name: safeName,
      device_user_id,
      device_sn,
    });
  } catch (err: any) {
    console.error('[enroll-fingerprint] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to queue fingerprint enrollment' },
      { status: 500 },
    );
  }
}
