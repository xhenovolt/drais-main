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
 * Body: { student_id: number, device_sn?: string }
 *
 * Flow:
 *   1. Resolve the student name and device_user_id
 *      - If device_sn is provided, use it directly (Quick-Capture flow)
 *      - Otherwise fall back to existing device_user_mappings lookup
 *   2. Queue an ENROLL command into zk_device_commands
 *   3. On next heartbeat, the ZK handler delivers: C:{id}:ENROLL PIN={device_user_id} Name={name}
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { student_id, device_sn: requestedDeviceSn } = body;
    if (!student_id) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
    }

    let device_user_id: string | number;
    let device_sn: string;
    let fullName: string;

    if (requestedDeviceSn) {
      // Quick-Capture flow: device_sn provided by the DeviceSelector modal.
      // Look up the student name and their zk_user_mapping device_user_id.
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

      fullName = `${studentRows[0].first_name} ${studentRows[0].last_name}`.trim();
      device_sn = requestedDeviceSn;

      // Try to find an existing zk_user_mapping device_user_id
      // Check by student_id across school_id OR device_sn (device may have been
      // auto-registered under a different school_id during initial sync)
      const mappingRows = await query(
        `SELECT device_user_id FROM zk_user_mapping
         WHERE student_id = ?
           AND (school_id = ? OR device_sn = ?)
         LIMIT 1`,
        [student_id, session.schoolId, requestedDeviceSn],
      );

      if (mappingRows && mappingRows.length > 0) {
        device_user_id = mappingRows[0].device_user_id;
      } else {
        // No mapping yet — auto-generate biometric_id from student.id
        device_user_id = student_id;

        // Auto-create zk_user_mapping so the device can resolve this user on future punches
        await query(
          `INSERT INTO zk_user_mapping
             (school_id, device_user_id, user_type, student_id, device_sn)
           VALUES (?, ?, 'student', ?, ?)
           ON DUPLICATE KEY UPDATE
             student_id = VALUES(student_id),
             updated_at = CURRENT_TIMESTAMP`,
          [session.schoolId, String(device_user_id), student_id, requestedDeviceSn],
        );
        console.log(`[enroll-fingerprint] Auto-created zk_user_mapping for student ${student_id} → PIN ${device_user_id}`);
      }
    } else {
      // Legacy flow: resolve from device_user_mappings
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
      device_user_id = student.device_user_id;
      device_sn = student.device_sn;
      fullName = `${student.first_name} ${student.last_name}`.trim();
    }

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

    // 3. Queue the ENROLL command with HIGHEST priority (50)
    //    ENROLL commands must be delivered BEFORE any DATA UPDATE or QUERY commands.
    //    ZKTeco ENROLL format: ENROLL PIN={userid} Name={name} Finger=0
    const command = `ENROLL PIN=${device_user_id}\tName=${fullName}\tFinger=0`;

    const result = await query(
      `INSERT INTO zk_device_commands
         (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, ?, 50, 5, DATE_ADD(NOW(), INTERVAL 30 MINUTE), ?)`,
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
