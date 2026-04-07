/**
 * POST /api/biometric/assign
 *
 * Assign an unassigned biometric enrollment to a specific student.
 * Uses a DB transaction with row-level locking to prevent concurrent double-assignment.
 *
 * Body: { enrollment_id: number, student_id: number }
 * Returns: { ok: true, enrollment_id, student_id }
 *
 * After assignment:
 *   • biometric_enrollments.status → ASSIGNED
 *   • zk_user_mapping upserted so name re-confirmed on device via next command
 *   • A DATA UPDATE USERINFO command queued so the device shows the real name
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const enrollment_id = parseInt(String(body?.enrollment_id), 10);
  const student_id = parseInt(String(body?.student_id), 10);

  if (!enrollment_id || !student_id) {
    return NextResponse.json({ error: 'enrollment_id and student_id required' }, { status: 400 });
  }

  const schoolId = session.schoolId;

  // ── Validate student belongs to this school ──────────────────────────────
  const studentRows = await query(
    `SELECT p.first_name, p.last_name
     FROM students s
     JOIN people p ON s.person_id = p.id
     WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
     LIMIT 1`,
    [student_id, schoolId],
  ).catch(() => null);

  if (!studentRows?.length) {
    return NextResponse.json({ error: 'Student not found or not in your school' }, { status: 404 });
  }
  const studentName = `${studentRows[0].first_name ?? ''} ${studentRows[0].last_name ?? ''}`.trim();
  const zkName = studentName.replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim() || `S${student_id}`;

  // ── Transaction: lock + assign ───────────────────────────────────────────
  try {
    // BEGIN
    await query('START TRANSACTION', []);

    // Lock the row and verify it is still unassigned
    const lockRows = await query(
      `SELECT id, device_sn, device_slot, status, student_id
       FROM biometric_enrollments
       WHERE id = ? AND school_id = ?
       LIMIT 1
       FOR UPDATE`,
      [enrollment_id, schoolId],
    );

    if (!lockRows?.length) {
      await query('ROLLBACK', []);
      return NextResponse.json({ error: 'Enrollment record not found' }, { status: 404 });
    }

    const enr = lockRows[0];
    if (enr.student_id !== null) {
      await query('ROLLBACK', []);
      return NextResponse.json({ error: 'Already assigned to another student' }, { status: 409 });
    }

    if (!['INITIATED', 'CAPTURED', 'UNASSIGNED'].includes(enr.status)) {
      await query('ROLLBACK', []);
      return NextResponse.json({ error: `Cannot assign from status ${enr.status}` }, { status: 409 });
    }

    // Update to ASSIGNED
    await query(
      `UPDATE biometric_enrollments
       SET student_id = ?, status = 'ASSIGNED', assigned_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [student_id, enrollment_id],
    );

    // Upsert zk_user_mapping so punches resolve automatically
    await query(
      `INSERT INTO zk_user_mapping
         (school_id, student_id, device_user_id, user_type, device_sn)
       VALUES (?, ?, ?, 'student', ?)
       ON DUPLICATE KEY UPDATE
         student_id = VALUES(student_id),
         device_sn  = COALESCE(VALUES(device_sn), device_sn),
         updated_at = CURRENT_TIMESTAMP`,
      [schoolId, student_id, String(enr.device_slot), enr.device_sn],
    );

    // COMMIT
    await query('COMMIT', []);

    // ── Queue device command to update the name on the device ────────────
    // Format: DATA UPDATE USERINFO PIN={slot}\tName={name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000000000000\tVerify=0\tVoiceVerify=0
    const updateCmd = `DATA UPDATE USERINFO PIN=${enr.device_slot}\tName=${zkName}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000000000000\tVerify=0\tVoiceVerify=0`;
    await query(
      `INSERT INTO zk_device_commands
         (device_sn, command, priority, status, school_id, expires_at)
       VALUES (?, ?, 5, 'pending', ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
      [enr.device_sn, updateCmd, schoolId],
    ).catch(() => {}); // non-fatal — device will show correct name on next name re-confirm

    return NextResponse.json({ ok: true, enrollment_id, student_id, student_name: studentName });
  } catch (e: any) {
    await query('ROLLBACK', []).catch(() => {});
    return NextResponse.json({ error: `Assignment failed: ${e.message}` }, { status: 500 });
  }
}
