import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/students/enroll-fingerprint
 *
 * Queues a ZKTeco ENROLL command so the device prompts the student
 * to place their finger on the sensor.
 *
 * Body: { student_id: number }
 *
 * Flow:
 *   1. Resolve the student's device_user_id from device_user_mappings
 *   2. Find the device SN from the mapping
 *   3. Queue an ENROLL command into zk_device_commands
 *   4. On next heartbeat, the ZK handler delivers: C:{id}:ENROLL PIN={device_user_id} Name={name}
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { student_id } = await req.json();
    if (!student_id) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
    }

    // 1. Find the student + device mapping + device SN
    const rows = await query(
      `SELECT
         s.id AS student_id,
         p.first_name,
         p.last_name,
         dum.device_user_id,
         dum.device_id,
         d.sn AS device_sn,
         d.device_name
       FROM students s
       JOIN people p ON s.person_id = p.id
       JOIN device_user_mappings dum ON s.id = dum.student_id
       JOIN devices d ON dum.device_id = d.id
       WHERE s.id = ? AND s.school_id = ?
       LIMIT 1`,
      [student_id, session.schoolId],
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: 'Student has no device mapping. Assign a Device ID first.' },
        { status: 404 },
      );
    }

    const student = rows[0];
    const { device_user_id, device_sn, first_name, last_name } = student;
    const fullName = `${first_name} ${last_name}`.trim();

    // 2. Check if there's already a pending/sent ENROLL command for this student
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
        message: `Enroll command already queued for ${fullName}. Waiting for device heartbeat.`,
        command_id: existing[0].id,
        status: existing[0].status,
        student_name: fullName,
        device_sn,
      });
    }

    // 3. Queue the ENROLL command with high priority
    //    ZKTeco ENROLL format: ENROLL PIN={userid} Name={name} Finger=0
    const command = `ENROLL PIN=${device_user_id}\tName=${fullName}\tFinger=0`;

    const result = await query(
      `INSERT INTO zk_device_commands
         (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, ?, 20, 5, DATE_ADD(NOW(), INTERVAL 30 MINUTE), ?)`,
      [session.schoolId, device_sn, command, session.userId],
    );

    const commandId = (result as any)?.insertId;

    console.log(
      `[enroll-fingerprint] Queued ENROLL for ${fullName} (PIN=${device_user_id}) on device ${device_sn}, command_id=${commandId}`,
    );

    return NextResponse.json({
      success: true,
      message: `Command Sent! Please check the device screen for ${fullName}.`,
      command_id: commandId,
      student_name: fullName,
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
