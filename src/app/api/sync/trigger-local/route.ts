import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * POST /api/sync/trigger-local
 * Connects directly to a ZKTeco device on the local network via TCP (port 4370)
 * using node-zklib, pulls all users, and creates people + students records.
 *
 * No bridge required — DRAIS talks directly to the K40/K50 over TCP.
 *
 * Body: { device_ip?: string, device_port?: number, device_sn?: string }
 * If device_ip is omitted, falls back to the school's registered device IP.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  // Resolve device IP — caller may provide one, or we look up from DB
  let deviceIp: string = (body.device_ip as string) || '';
  const devicePort: number = Number(body.device_port || 4370);
  let deviceSn: string = (body.device_sn as string) || '';

  if (!deviceIp) {
    const rows = await query<{ ip_address: string; sn: string }[]>(
      `SELECT ip_address, sn FROM devices WHERE school_id = ? AND status = 'active' ORDER BY last_seen DESC LIMIT 1`,
      [session.schoolId],
    );
    deviceIp = rows[0]?.ip_address || '';
    if (!deviceSn) deviceSn = rows[0]?.sn || '';
  }

  if (!deviceIp) {
    return NextResponse.json(
      { error: 'No device IP found. Register a device or pass device_ip in the request body.' },
      { status: 422 },
    );
  }

  // ── Connect to device via TCP ───────────────────────────────────────────
  const ZKLib = require('node-zklib');
  let zk: any;

  try {
    zk = new ZKLib(deviceIp, devicePort, 10000, 4000);
    await zk.createSocket();
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Cannot connect to device at ${deviceIp}:${devicePort}: ${err.message}`,
        hint: 'Ensure the device is powered on, on the same network, and port 4370 is accessible.',
      },
      { status: 502 },
    );
  }

  try {
    // Get device info for logging
    let serialNumber = deviceSn;
    try {
      serialNumber = (await zk.getSerialNumber()) || deviceSn;
    } catch { /* use provided SN */ }

    // ── Pull all users from device ──────────────────────────────────────
    const usersResult = await zk.getUsers();
    const deviceUsers: Array<{ uid: number; name: string; role: number; userId: string; cardno?: string }> =
      usersResult?.data || [];

    if (deviceUsers.length === 0) {
      try { await zk.disconnect(); } catch {}
      return NextResponse.json({
        success: true,
        strategy: 'local-tcp',
        device_ip: deviceIp,
        message: 'Device has no enrolled users.',
        users_pulled: 0,
        learners_created: 0,
      });
    }

    // ── Create people + students for each device user ───────────────────
    let created = 0;
    let skipped = 0;
    let updated = 0;
    const userDetails: Array<{
      device_uid: number;
      device_user_id: string;
      name: string;
      action: string;
      student_id?: number;
      person_id?: number;
    }> = [];

    for (const u of deviceUsers) {
      const deviceUserId = String(u.userId || u.uid);
      const fullName = (u.name || '').trim();

      // Skip unnamed users (admin/test accounts on device)
      if (!fullName || fullName === '' || fullName.toLowerCase() === 'admin') {
        skipped++;
        userDetails.push({ device_uid: u.uid, device_user_id: deviceUserId, name: fullName, action: 'skipped' });
        continue;
      }

      // Split name intelligently
      const nameParts = fullName.split(/\s+/);
      const firstName = nameParts[0] || fullName;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      // Check if mapping already exists
      const existingMapping = await query(
        `SELECT student_id FROM zk_user_mapping
         WHERE device_user_id = ? AND school_id = ? LIMIT 1`,
        [deviceUserId, session.schoolId],
      );

      if (existingMapping?.[0]?.student_id) {
        // Already mapped — update the person's name if needed
        const studentId = existingMapping[0].student_id;
        await query(
          `UPDATE people p JOIN students s ON s.person_id = p.id
           SET p.first_name = COALESCE(NULLIF(?, ''), p.first_name),
               p.last_name = COALESCE(NULLIF(?, ''), p.last_name),
               p.updated_at = CURRENT_TIMESTAMP
           WHERE s.id = ? AND p.school_id = ?`,
          [firstName, lastName, studentId, session.schoolId],
        );
        updated++;
        userDetails.push({ device_uid: u.uid, device_user_id: deviceUserId, name: fullName, action: 'updated', student_id: studentId });
        continue;
      }

      // Create person record
      const personResult: any = await query(
        `INSERT INTO people (school_id, first_name, last_name, created_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [session.schoolId, firstName, lastName],
      );
      const personId = personResult?.insertId;

      if (!personId) {
        skipped++;
        userDetails.push({ device_uid: u.uid, device_user_id: deviceUserId, name: fullName, action: 'failed_person' });
        continue;
      }

      // Create student record
      const studentResult: any = await query(
        `INSERT INTO students (school_id, person_id, status, admission_date, created_at)
         VALUES (?, ?, 'active', CURDATE(), CURRENT_TIMESTAMP)`,
        [session.schoolId, personId],
      );
      const studentId = studentResult?.insertId;

      if (!studentId) {
        skipped++;
        userDetails.push({ device_uid: u.uid, device_user_id: deviceUserId, name: fullName, action: 'failed_student', person_id: personId });
        continue;
      }

      // Create ZK user mapping
      await query(
        `INSERT INTO zk_user_mapping (school_id, device_user_id, user_type, student_id, device_sn, card_number)
         VALUES (?, ?, 'student', ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           student_id = VALUES(student_id),
           updated_at = CURRENT_TIMESTAMP`,
        [session.schoolId, deviceUserId, studentId, serialNumber || null, u.cardno || null],
      );

      created++;
      userDetails.push({
        device_uid: u.uid,
        device_user_id: deviceUserId,
        name: fullName,
        action: 'created',
        student_id: studentId,
        person_id: personId,
      });
    }

    // ── Pull attendance logs (bonus) ────────────────────────────────────
    let attendancePulled = 0;
    try {
      const attResult = await zk.getAttendances();
      attendancePulled = attResult?.data?.length || 0;
    } catch { /* non-critical */ }

    try { await zk.disconnect(); } catch {}

    return NextResponse.json({
      success: true,
      strategy: 'local-tcp',
      device_ip: deviceIp,
      device_sn: serialNumber,
      users_pulled: deviceUsers.length,
      learners_created: created,
      learners_updated: updated,
      learners_skipped: skipped,
      attendance_records: attendancePulled,
      users: userDetails,
    });

  } catch (err: any) {
    try { await zk.disconnect(); } catch {}
    return NextResponse.json(
      { error: `Device communication failed: ${err.message}`, device_ip: deviceIp },
      { status: 502 },
    );
  }
}
