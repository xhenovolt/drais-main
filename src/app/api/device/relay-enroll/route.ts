/**
 * POST /api/device/relay-enroll
 * ──────────────────────────────────────────────────────────────────
 * Cloud-Relay fingerprint enrollment — same strategy as local-enroll
 * (CMD_STARTENROLL via TCP) but executed through the HTTP-polling
 * relay agent that runs on the school's LAN.
 *
 * Flow:
 *   1. Resolve student UID from zk_user_mapping (or auto-assign)
 *   2. Insert to relay_commands { action: 'enroll', params: { uid, finger } }
 *   3. Return { command_id, uid, student_name, relay_online }
 *   4. Client polls /api/device/relay-enroll/status?command_id=xxx
 *
 * Relay agent (workers/zk-relay-agent.js) picks up the command, sends
 * CMD_STARTENROLL to the device via direct TCP, and reports back.
 * The fingerprint template is returned separately via ADMS OPERLOG
 * (device sends it automatically after the student scans).
 *
 * Body: { student_id: number, device_sn: string, finger?: 0–9 }
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

  const { student_id, device_sn, finger = 0 } = body;

  if (!student_id) {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  }
  if (!device_sn || typeof device_sn !== 'string' || device_sn.length > 64) {
    return NextResponse.json({ error: 'device_sn is required' }, { status: 400 });
  }

  const fingerIdx = Math.max(0, Math.min(9, parseInt(String(finger), 10) || 0));

  // ── 1. Verify device exists ─────────────────────────────────────────────────
  const deviceRows = await query(
    'SELECT id, sn, school_id FROM devices WHERE sn = ?',
    [device_sn],
  );
  if (!deviceRows?.length) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }
  const deviceSchoolId = Number(deviceRows[0].school_id) || session.schoolId;

  // ── 2. Resolve student name ─────────────────────────────────────────────────
  const studentRows = await query(
    `SELECT s.id, p.first_name, p.last_name
     FROM students s
     JOIN people p ON s.person_id = p.id
     WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
     LIMIT 1`,
    [student_id, session.schoolId],
  );
  if (!studentRows?.length) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }
  const studentName = `${studentRows[0].first_name ?? ''} ${studentRows[0].last_name ?? ''}`.trim() || 'Student';

  // ── 3. Resolve or assign UID ────────────────────────────────────────────────
  let uid: number;

  // First check for device-specific mapping
  const deviceMapping = await query(
    `SELECT device_user_id FROM zk_user_mapping
     WHERE student_id = ? AND device_sn = ? LIMIT 1`,
    [student_id, device_sn],
  );

  if (deviceMapping?.length) {
    uid = Number(deviceMapping[0].device_user_id);
  } else {
    // Fall back to any mapping for this student (school-wide)
    const anyMapping = await query(
      `SELECT device_user_id FROM zk_user_mapping
       WHERE student_id = ? AND school_id = ? LIMIT 1`,
      [student_id, session.schoolId],
    );

    if (anyMapping?.length) {
      uid = Number(anyMapping[0].device_user_id);
      // Also register this UID for the specific device
      await query(
        `INSERT INTO zk_user_mapping (school_id, student_id, device_user_id, user_type, device_sn)
         VALUES (?, ?, ?, 'student', ?)
         ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
        [deviceSchoolId, student_id, String(uid), device_sn],
      ).catch(() => {});
    } else {
      // Auto-assign next sequential UID (same logic as local-enroll)
      const maxRow = await query(
        `SELECT COALESCE(MAX(CAST(device_user_id AS UNSIGNED)), 0) AS max_uid
         FROM zk_user_mapping`,
      );
      uid = Math.max(1, (Number(maxRow?.[0]?.max_uid) || 0) + 1);
      if (uid > 65535) {
        return NextResponse.json({ error: 'PIN limit reached (65535)' }, { status: 400 });
      }
      await query(
        `INSERT INTO zk_user_mapping (school_id, student_id, device_user_id, user_type, device_sn)
         VALUES (?, ?, ?, 'student', ?)`,
        [deviceSchoolId, student_id, String(uid), device_sn],
      );
    }
  }

  // ── 4. Deduplicate — skip if a *fresh* pending/sent enroll already exists ─
  // "sent" commands older than 60s are stale (relay was offline), allow re-queueing
  const existing = await query(
    `SELECT id, status FROM relay_commands
     WHERE device_sn = ? AND action = 'enroll' AND status IN ('pending', 'sent')
       AND JSON_EXTRACT(params, '$.uid') = ?
       AND (status = 'pending' OR TIMESTAMPDIFF(SECOND, created_at, NOW()) < 60)
     LIMIT 1`,
    [device_sn, uid],
  );
  if (existing?.length) {
    return NextResponse.json({
      success: true,
      command_id: existing[0].id,
      status: existing[0].status,
      uid,
      student_name: studentName,
      already_queued: true,
      message: `Enrollment already queued for ${studentName} (UID ${uid})`,
    });
  }

  // ── 5. Check relay agent online status (non-blocking, just for UI hint) ─────
  const agentRows = await query(
    `SELECT status, TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS sec_ago
     FROM relay_agents WHERE device_sn = ? LIMIT 1`,
    [device_sn],
  ).catch(() => null);
  const secAgo = agentRows?.[0]?.sec_ago;
  const relayOnline = secAgo != null && Number(secAgo) < 60;

  // ── 6. Queue relay command ──────────────────────────────────────────────────
  // Truncate name to 23 chars (ZK name field is 24 bytes incl. null terminator)
  // Strip non-ASCII chars so the device receives a clean name
  const zkName = studentName.replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim() || `UID${uid}`;

  const insertResult = await query(
    `INSERT INTO relay_commands (device_sn, action, params, status, created_at)
     VALUES (?, 'enroll', ?, 'pending', NOW())`,
    [device_sn, JSON.stringify({ uid, finger: fingerIdx, name: zkName })],
  );
  const commandId = (insertResult as any)?.insertId;

  console.log(
    `[relay-enroll] Queued enroll for ${studentName} (UID=${uid}) on ${device_sn}, cmd=${commandId}, relay_online=${relayOnline}`,
  );

  return NextResponse.json({
    success: true,
    command_id: commandId,
    uid,
    student_name: studentName,
    device_sn,
    relay_online: relayOnline,
    message: relayOnline
      ? `Relay command queued for ${studentName} (UID ${uid}). Device will show scan prompt.`
      : `Command queued for ${studentName} (UID ${uid}). Waiting for relay agent to connect.`,
  });
}
