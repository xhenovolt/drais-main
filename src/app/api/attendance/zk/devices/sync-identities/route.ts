import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Name sanitizer for ZKTeco hardware.
 * - Max 24 characters
 * - ASCII only (strip diacritics, remove non-printable)
 * - No tab/newline (breaks ADMS protocol)
 */
function zkName(first: string, last: string): string {
  const raw = `${first || ''} ${last || ''}`.trim();
  // Transliterate common non-ASCII
  const ascii = raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .replace(/[^\x20-\x7E]/g, '')                       // ASCII printable only
    .replace(/[\t\r\n]/g, ' ')                          // no tabs/newlines
    .replace(/\s+/g, ' ')                               // collapse whitespace
    .trim();
  return ascii.slice(0, 24) || 'Unknown';
}

// ─── POST: Generate PINs + queue DATA UPDATE USER commands ────────────────────

/**
 * POST /api/attendance/zk/devices/sync-identities
 *
 * Body: { device_sn: string }
 *
 * 1. Assign sequential biometric PINs to all active students + staff
 *    who don't yet have a zk_user_mapping for this device.
 * 2. Queue DATA UPDATE USER commands in zk_device_commands.
 * 3. Log each command to system_logs.
 * 4. Return summary (queued count, skipped, errors).
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
    const device = await query('SELECT id, sn, school_id FROM devices WHERE sn = ? AND deleted_at IS NULL', [device_sn]);
    if (!device || device.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    const deviceSchoolId = session.schoolId;

    // ── Step 1: Find the current max PIN for this school's zk_user_mapping ──
    const maxRow = await query(
      `SELECT MAX(CAST(device_user_id AS UNSIGNED)) AS max_pin FROM zk_user_mapping WHERE school_id = ?`,
      [session.schoolId],
    );
    let nextPin = Math.max(1, (Number(maxRow?.[0]?.max_pin) || 0) + 1);

    // ── Step 2: Get all active students with their names ──
    const students = await query(
      `SELECT s.id AS student_id, p.first_name, p.last_name
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.school_id = ? AND s.status = 'active'
         AND s.deleted_at IS NULL AND p.deleted_at IS NULL
       ORDER BY s.id ASC`,
      [session.schoolId],
    );

    // ── Step 3: Get all active staff with their names ──
    const staff = await query(
      `SELECT st.id AS staff_id, p.first_name, p.last_name
       FROM staff st
       JOIN people p ON st.person_id = p.id
       WHERE st.school_id = ? AND st.status = 'active'
         AND st.deleted_at IS NULL AND p.deleted_at IS NULL
       ORDER BY st.id ASC`,
      [session.schoolId],
    );

    // ── Step 4: Get existing mappings for this device to skip already-synced ──
    const existingMappings = await query(
      `SELECT student_id, staff_id, device_user_id
       FROM zk_user_mapping
       WHERE school_id = ? AND (device_sn = ? OR device_sn IS NULL)`,
      [session.schoolId, device_sn],
    );

    const syncedStudents = new Set<number>();
    const syncedStaff = new Set<number>();
    const existingPins = new Set<number>();
    for (const m of existingMappings || []) {
      if (m.student_id) syncedStudents.add(Number(m.student_id));
      if (m.staff_id) syncedStaff.add(Number(m.staff_id));
      const pin = Number(m.device_user_id);
      if (!isNaN(pin)) existingPins.add(pin);
    }

    // Build list of people to sync
    type SyncEntry = {
      user_type: 'student' | 'staff';
      ref_id: number;
      name: string;
      pin: number;
    };
    const toSync: SyncEntry[] = [];

    for (const s of students || []) {
      if (syncedStudents.has(Number(s.student_id))) continue;
      // Ensure PIN uniqueness and <= 65535
      while (existingPins.has(nextPin)) nextPin++;
      if (nextPin > 65535) break; // ZK limit
      const pin = nextPin++;
      existingPins.add(pin);
      toSync.push({
        user_type: 'student',
        ref_id: Number(s.student_id),
        name: zkName(s.first_name, s.last_name),
        pin,
      });
    }

    for (const s of staff || []) {
      if (syncedStaff.has(Number(s.staff_id))) continue;
      while (existingPins.has(nextPin)) nextPin++;
      if (nextPin > 65535) break;
      const pin = nextPin++;
      existingPins.add(pin);
      toSync.push({
        user_type: 'staff',
        ref_id: Number(s.staff_id),
        name: zkName(s.first_name, s.last_name),
        pin,
      });
    }

    if (toSync.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All users already synced to this device',
        queued: 0,
        total_students: (students || []).length,
        total_staff: (staff || []).length,
        already_synced: syncedStudents.size + syncedStaff.size,
      });
    }

    // ── Step 5: Batch insert — mapping + commands + logs ──
    const BATCH = 50;
    let queued = 0;
    const errors: string[] = [];

    for (let i = 0; i < toSync.length; i += BATCH) {
      const chunk = toSync.slice(i, i + BATCH);

      for (const entry of chunk) {
        try {
          // Upsert zk_user_mapping
          await query(
            `INSERT INTO zk_user_mapping (school_id, device_user_id, user_type, student_id, staff_id, device_sn)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               user_type = VALUES(user_type),
               student_id = VALUES(student_id),
               staff_id = VALUES(staff_id),
               updated_at = CURRENT_TIMESTAMP`,
            [
              deviceSchoolId,
              String(entry.pin),
              entry.user_type,
              entry.user_type === 'student' ? entry.ref_id : null,
              entry.user_type === 'staff' ? entry.ref_id : null,
              device_sn,
            ],
          );

          // Queue DATA UPDATE USER command
          const cmd = `DATA UPDATE USERINFO PIN=${entry.pin}\tName=${entry.name}\tPri=0\tPasswd=\tCard=\tGrp=0\tTZ=0000000100000000`;
          await query(
            `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
             VALUES (?, ?, ?, 5, 5, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
            [deviceSchoolId, device_sn, cmd, session.userId],
          );

          // Log to system_logs
          await query(
            `INSERT INTO system_logs (school_id, level, source, message, context, user_id)
             VALUES (?, 'INFO', 'SYNC_IDENTITIES', 'COMMAND_QUEUED', ?, ?)`,
            [
              deviceSchoolId,
              JSON.stringify({
                device_sn,
                pin: entry.pin,
                name: entry.name,
                user_type: entry.user_type,
                ref_id: entry.ref_id,
              }),
              session.userId,
            ],
          );

          queued++;
        } catch (err: any) {
          errors.push(`PIN ${entry.pin} (${entry.name}): ${err.message || 'error'}`);
        }
      }
    }

    // Audit log
    try {
      await query(
        `INSERT INTO audit_logs (school_id, user_id, action, action_type, entity_type, details, source)
         VALUES (?, ?, 'SYNC_IDENTITIES', 'SYNC_IDENTITIES', 'devices', ?, 'WEB')`,
        [
          session.schoolId,
          session.userId,
          JSON.stringify({
            device_sn,
            queued,
            errors: errors.length,
            total_students: (students || []).length,
            total_staff: (staff || []).length,
          }),
        ],
      );
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Queued ${queued} identity commands for device ${device_sn}`,
      queued,
      errors: errors.slice(0, 20),
      error_count: errors.length,
      total_students: (students || []).length,
      total_staff: (staff || []).length,
      already_synced: syncedStudents.size + syncedStaff.size,
    });
  } catch (err: any) {
    console.error('[sync-identities POST] Error:', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}

// ─── GET: Check sync progress ─────────────────────────────────────────────────

/**
 * GET /api/attendance/zk/devices/sync-identities?device_sn=xxx
 *
 * Returns the current sync progress:
 *   - total pending DATA UPDATE USERINFO commands for this device
 *   - how many have been sent / acknowledged / failed
 *   - overall sync status
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
    // Count by status for DATA UPDATE USERINFO commands
    const counts = await query(
      `SELECT
         status,
         COUNT(*) AS cnt
       FROM zk_device_commands
       WHERE device_sn = ? AND command LIKE 'DATA UPDATE USERINFO PIN=%'
       GROUP BY status`,
      [deviceSn],
    );

    const statusMap: Record<string, number> = {};
    for (const row of counts || []) {
      statusMap[row.status] = Number(row.cnt);
    }

    const pending      = statusMap['pending']      || 0;
    const sent         = statusMap['sent']         || 0;
    const acknowledged = statusMap['acknowledged'] || 0;
    const failed       = statusMap['failed']       || 0;
    const expired      = statusMap['expired']      || 0;

    const total = pending + sent + acknowledged + failed + expired;
    const processed = sent + acknowledged + failed + expired;

    // Determine overall status
    let syncStatus: string;
    if (total === 0) {
      syncStatus = 'idle';
    } else if (pending > 0 || sent > 0) {
      syncStatus = 'syncing';
    } else if (failed > 0 && acknowledged === 0) {
      syncStatus = 'failed';
    } else {
      syncStatus = 'complete';
    }

    // Get total mapped users for this device
    const mappedRow = await query(
      `SELECT COUNT(*) AS cnt FROM zk_user_mapping WHERE device_sn = ? OR device_sn IS NULL`,
      [deviceSn],
    );
    const totalMapped = Number(mappedRow?.[0]?.cnt || 0);

    return NextResponse.json({
      success: true,
      sync_status: syncStatus,
      total,
      pending,
      sent,
      acknowledged,
      failed,
      expired,
      processed,
      total_mapped: totalMapped,
    });
  } catch (err: any) {
    console.error('[sync-identities GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to check progress' }, { status: 500 });
  }
}
