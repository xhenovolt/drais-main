import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/enrollment-station?device_sn=xxx
 *
 * Returns enrollment overview:
 *   - Students grouped by class with fingerprint status
 *   - Total/enrolled/pending counts
 *   - Recent fingerprint captures (last hour)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const deviceSn = new URL(req.url).searchParams.get('device_sn') || null;

  try {
    // Get all active students with class info
    const students = await query(
      `SELECT s.id AS student_id, p.first_name, p.last_name,
              c.id AS class_id, c.name AS class_name,
              s.admission_no
       FROM students s
       JOIN people p ON s.person_id = p.id
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
       ORDER BY c.name ASC, p.first_name ASC`,
      [session.schoolId],
    );

    // Get student IDs that have fingerprint templates
    const fpRows = await query(
      `SELECT DISTINCT student_id FROM student_fingerprints
       WHERE school_id = ? AND is_active = 1 AND student_id IS NOT NULL`,
      [session.schoolId],
    );
    const hasFingerprint = new Set<number>();
    for (const r of fpRows || []) {
      if (r.student_id) hasFingerprint.add(Number(r.student_id));
    }

    // Get student IDs that are already mapped to the device (have a PIN)
    let hasMappingSet = new Set<number>();
    const pinMap = new Map<number, string>(); // student_id → device PIN
    if (deviceSn) {
      const mapRows = await query(
        `SELECT student_id, device_user_id FROM zk_user_mapping
         WHERE (device_sn = ? OR device_sn IS NULL) AND student_id IS NOT NULL`,
        [deviceSn],
      );
      for (const r of mapRows || []) {
        if (r.student_id) {
          hasMappingSet.add(Number(r.student_id));
          pinMap.set(Number(r.student_id), r.device_user_id);
        }
      }
    }

    // Recent fingerprint captures (last 1 hour)
    const recentCaptures = await query(
      `SELECT sf.student_id, sf.finger_position, sf.hand, sf.enrollment_timestamp,
              p.first_name, p.last_name
       FROM student_fingerprints sf
       JOIN students s ON sf.student_id = s.id
       JOIN people p ON s.person_id = p.id
       WHERE sf.school_id = ? AND sf.enrollment_timestamp > DATE_SUB(NOW(), INTERVAL 1 HOUR)
       ORDER BY sf.enrollment_timestamp DESC
       LIMIT 50`,
      [session.schoolId],
    );

    // Build class groups
    const classMap = new Map<string, any>();
    for (const s of students || []) {
      const className = s.class_name || 'Unassigned';
      const classId = s.class_id || 0;
      if (!classMap.has(className)) {
        classMap.set(className, { class_id: classId, class_name: className, students: [], enrolled: 0, total: 0, synced: 0 });
      }
      const group = classMap.get(className)!;
      const enrolled = hasFingerprint.has(Number(s.student_id));
      const synced = hasMappingSet.has(Number(s.student_id));
      group.students.push({
        student_id: s.student_id,
        first_name: s.first_name,
        last_name: s.last_name,
        admission_no: s.admission_no,
        has_fingerprint: enrolled,
        has_mapping: synced,
        device_pin: pinMap.get(Number(s.student_id)) || null,
      });
      group.total++;
      if (enrolled) group.enrolled++;
      if (synced) group.synced++;
    }

    const classes = Array.from(classMap.values()).sort((a, b) => a.class_name.localeCompare(b.class_name));
    const totalStudents = (students || []).length;
    const totalEnrolled = hasFingerprint.size;
    const totalSynced = hasMappingSet.size;

    return NextResponse.json({
      success: true,
      data: {
        classes,
        summary: {
          total_students: totalStudents,
          total_enrolled: totalEnrolled,
          total_synced: totalSynced,
          total_pending: totalStudents - totalEnrolled,
        },
        recent_captures: recentCaptures || [],
      },
    });
  } catch (err: any) {
    console.error('[enrollment-station GET]', err);
    return NextResponse.json({ error: err.message || 'Failed to load enrollment data' }, { status: 500 });
  }
}

/**
 * POST /api/attendance/enrollment-station
 *
 * Bulk sync identities + optionally trigger ENROLL_FP for a specific student.
 *
 * Body:
 *   { action: 'bulk_sync', device_sn: string }
 *     → Sync ALL unsynced students to device (same as sync-identities but for session school)
 *
 *   { action: 'enroll_fp', device_sn: string, student_id: number }
 *     → Try ENROLL_FP command for a specific student (may not be supported by all devices)
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { action, device_sn, student_id } = await req.json();

    if (!device_sn) {
      return NextResponse.json({ error: 'device_sn is required' }, { status: 400 });
    }

    // Verify device exists
    const deviceRows = await query('SELECT id, sn, school_id FROM devices WHERE sn = ?', [device_sn]);
    if (!deviceRows || deviceRows.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    const deviceSchoolId = deviceRows[0].school_id || session.schoolId;

    if (action === 'bulk_sync') {
      // Sync all students who don't have a mapping yet — same logic as sync-identities
      const students = await query(
        `SELECT s.id AS student_id, p.first_name, p.last_name
         FROM students s
         JOIN people p ON s.person_id = p.id
         WHERE s.school_id = ? AND s.status = 'active'
           AND s.deleted_at IS NULL AND p.deleted_at IS NULL
         ORDER BY s.id ASC`,
        [session.schoolId],
      );

      const existingMappings = await query(
        `SELECT student_id, device_user_id FROM zk_user_mapping
         WHERE (device_sn = ? OR device_sn IS NULL) AND student_id IS NOT NULL`,
        [device_sn],
      );

      const synced = new Set<number>();
      const existingPins = new Set<number>();
      for (const m of existingMappings || []) {
        if (m.student_id) synced.add(Number(m.student_id));
        const pin = Number(m.device_user_id);
        if (!isNaN(pin)) existingPins.add(pin);
      }

      // Find max PIN
      const maxRow = await query('SELECT MAX(CAST(device_user_id AS UNSIGNED)) AS max_pin FROM zk_user_mapping');
      let nextPin = Math.max(1, (Number(maxRow?.[0]?.max_pin) || 0) + 1);

      let queued = 0;
      const errors: string[] = [];

      for (const s of students || []) {
        if (synced.has(Number(s.student_id))) continue;

        while (existingPins.has(nextPin)) nextPin++;
        if (nextPin > 65535) break;

        const pin = nextPin++;
        existingPins.add(pin);

        const name = zkName(s.first_name, s.last_name);

        try {
          await query(
            `INSERT INTO zk_user_mapping (school_id, device_user_id, user_type, student_id, device_sn)
             VALUES (?, ?, 'student', ?, ?)
             ON DUPLICATE KEY UPDATE student_id = VALUES(student_id), updated_at = CURRENT_TIMESTAMP`,
            [deviceSchoolId, String(pin), s.student_id, device_sn],
          );

          const cmd = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=0\tTZ=0000000100000000`;
          await query(
            `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
             VALUES (?, ?, ?, 5, 5, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
            [deviceSchoolId, device_sn, cmd, session.userId],
          );
          queued++;
        } catch (err: any) {
          errors.push(`PIN ${pin}: ${err.message}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Queued ${queued} identity sync commands`,
        queued,
        already_synced: synced.size,
        errors: errors.slice(0, 10),
      });
    }

    if (action === 'enroll_fp') {
      if (!student_id) {
        return NextResponse.json({ error: 'student_id is required for enroll_fp' }, { status: 400 });
      }

      // Get student's PIN from mapping
      const mapping = await query(
        `SELECT device_user_id FROM zk_user_mapping
         WHERE student_id = ? AND device_sn = ?
         LIMIT 1`,
        [student_id, device_sn],
      );

      if (!mapping || mapping.length === 0) {
        return NextResponse.json({ error: 'Student not synced to device. Run bulk sync first.' }, { status: 400 });
      }

      const pin = mapping[0].device_user_id;

      // Check for existing pending ENROLL_FP
      const existing = await query(
        `SELECT id FROM zk_device_commands
         WHERE device_sn = ? AND command LIKE ? AND status IN ('pending', 'sent')
         LIMIT 1`,
        [device_sn, `ENROLL_FP PIN=${pin}%`],
      );

      if (existing && existing.length > 0) {
        return NextResponse.json({ success: true, message: 'Enrollment already in progress', command_id: existing[0].id });
      }

      const result = await query(
        `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
         VALUES (?, ?, ?, 50, 3, DATE_ADD(NOW(), INTERVAL 10 MINUTE), ?)`,
        [deviceSchoolId, device_sn, `ENROLL_FP PIN=${pin}&FID=0&RETRY=3&OVERWRITE=Y`, session.userId],
      );

      return NextResponse.json({
        success: true,
        message: 'Remote enrollment command queued',
        command_id: (result as any)?.insertId,
        pin,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[enrollment-station POST]', err);
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 });
  }
}

/** ZK name sanitizer — ASCII, max 24 chars, no tabs */
function zkName(first: string, last: string): string {
  const raw = `${first || ''} ${last || ''}`.trim();
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[\t\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24) || 'Unknown';
}
