import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

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
 * Mirrors the sync-identities pattern:
 *   1. Verify device exists → use device.school_id (not session)
 *   2. Resolve student name from people table
 *   3. Look up zk_user_mapping by student_id + device_sn
 *   4. If NO mapping → auto-assign next sequential PIN, upsert mapping,
 *      queue DATA UPDATE USERINFO (same as sync-identities) so the device
 *      knows this user before we try to enroll their finger
 *   5. Queue ENROLL command with priority 50
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

      // ── 4b. Queue DATA UPDATE USERINFO so device registers this user first ──
      const syncCmd = `DATA UPDATE USERINFO PIN=${device_user_id}\tName=${safeName}\tPri=0\tPasswd=\tCard=\tGrp=0\tTZ=0000000100000000`;
      await query(
        `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
         VALUES (?, ?, ?, 5, 5, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
        [deviceSchoolId, device_sn, syncCmd, session.userId],
      );

      console.log(
        `[enroll-fingerprint] Auto-synced identity for student ${student_id} → PIN ${device_user_id} on ${device_sn}`,
      );
    }

    // ── 5. Check for existing pending/sent ENROLL command ──
    const existing = await query(
      `SELECT id, status FROM zk_device_commands
       WHERE device_sn = ?
         AND command LIKE ?
         AND status IN ('pending', 'sent')
       LIMIT 1`,
      [device_sn, `%ENROLL PIN=${device_user_id}%`],
    );

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        message: `Enroll command already queued for ${safeName}. Waiting for device heartbeat.`,
        command_id: existing[0].id,
        status: existing[0].status,
        student_name: safeName,
        device_sn,
      });
    }

    // ── 6. Queue ENROLL command — priority 50 (highest) ──
    const enrollCmd = `ENROLL PIN=${device_user_id}\tName=${safeName}\tFinger=0`;
    const result = await query(
      `INSERT INTO zk_device_commands
         (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, ?, 50, 5, DATE_ADD(NOW(), INTERVAL 30 MINUTE), ?)`,
      [deviceSchoolId, device_sn, enrollCmd, session.userId],
    );

    const commandId = (result as any)?.insertId;

    console.log(
      `[enroll-fingerprint] Queued ENROLL for ${safeName} (PIN=${device_user_id}) on ${device_sn}, cmd=${commandId}`,
    );

    return NextResponse.json({
      success: true,
      message: `Command Sent! Please check the device screen for ${safeName}.`,
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
