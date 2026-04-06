/**
 * POST /api/device/local-enroll
 * ─────────────────────────────
 * Hybrid Enrollment — Local (Direct TCP) path.
 *
 * Instead of queuing a device_command and waiting for the device to poll
 * (ADMS / cloud path), this endpoint connects directly to the ZKTeco device
 * on the LAN and sends CMD_STARTENROLL immediately.
 *
 * Response is returned as soon as the device acknowledges the command, so
 * the UI can show "Scan finger now" without any polling loop.
 *
 * Body: { student_id: number, device_ip: string, device_port?: number, finger?: number }
 * Returns: { success, uid, student_name, message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');

// ─── IP Validator (LAN only) ──────────────────────────────────────────────────
function isValidLanIP(ip: string): boolean {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const o = [+match[1], +match[2], +match[3], +match[4]];
  if (o.some(n => n > 255)) return false;
  if (o[0] === 127 || o[0] === 0) return false;
  if (o[0] === 169 && o[1] === 254) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { student_id, device_ip, device_port = 4370, finger = 0 } = body;

  if (!student_id) {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  }
  if (!device_ip || !isValidLanIP(device_ip)) {
    return NextResponse.json({ error: 'Invalid device_ip — must be a LAN IPv4 address' }, { status: 400 });
  }

  const schoolId = session.schoolId;
  const port = Math.max(1, Math.min(65535, parseInt(String(device_port), 10) || 4370));

  // ── 1. Resolve student name ─────────────────────────────────────────────────
  let studentName = 'Student';
  try {
    const studentRows = await query(
      `SELECT p.first_name, p.last_name
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
       LIMIT 1`,
      [student_id, schoolId],
    );
    if (!studentRows?.length) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    studentName = `${studentRows[0].first_name ?? ''} ${studentRows[0].last_name ?? ''}`.trim() || 'Student';
  } catch (e: any) {
    return NextResponse.json({ error: `DB error: ${e.message}` }, { status: 500 });
  }

  // ── 2. Get or create zk_user_mapping → device UID ──────────────────────────
  let uid: number;
  try {
    const mappingRows = await query(
      `SELECT device_user_id FROM zk_user_mapping
       WHERE student_id = ? AND school_id = ?
       LIMIT 1`,
      [student_id, schoolId],
    );

    if (mappingRows?.length) {
      uid = Number(mappingRows[0].device_user_id);
    } else {
      // Auto-assign next sequential UID
      const maxRow = await query(
        `SELECT COALESCE(MAX(CAST(device_user_id AS UNSIGNED)), 0) AS max_uid
         FROM zk_user_mapping`,
      );
      uid = Math.max(1, (Number(maxRow?.[0]?.max_uid) || 0) + 1);
      if (uid > 65535) {
        return NextResponse.json({ error: 'UID limit reached (max 65535)' }, { status: 409 });
      }
      await query(
        `INSERT INTO zk_user_mapping (school_id, student_id, device_user_id, user_type, device_sn)
         VALUES (?, ?, ?, 'student', 'LOCAL')`,
        [schoolId, student_id, uid],
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Mapping error: ${e.message}` }, { status: 500 });
  }

  // ── 3. Connect + send CMD_STARTENROLL ───────────────────────────────────────
  const zk = new ZKLib(device_ip, port, 8000, 5200);
  try {
    await zk.createSocket();
  } catch (e: any) {
    return NextResponse.json({
      error: `Cannot reach device at ${device_ip}:${port} — ${e.message}`,
      hint: 'Ensure device is on same LAN as the server',
    }, { status: 502 });
  }

  try {
    // Cancel any in-progress capture
    try { await zk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, ''); } catch {}
    await zk.zklibTcp.disableDevice();

    // ── Write user record (name + uid) BEFORE enrollment — MANDATORY ──────────
    // A fingerprint must NEVER be enrolled on an anonymous slot.
    // ZK 72-byte user record: [uid(2)][role(1)][password(8)][name(24)][cardno(4)][pad(9)][userId(9)][pad(15)]
    const zkName = studentName.replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim() || `UID${uid}`;
    const userBuf = Buffer.alloc(72, 0);
    userBuf.writeUInt16LE(uid, 0);                                    // uid (bytes 0-1)
    // byte 2: role = 0 (regular user)
    // bytes 3-10: password = all zeros
    Buffer.from(zkName, 'ascii').copy(userBuf, 11, 0, 23);            // name (bytes 11-34, max 23 + null)
    // bytes 35-38: cardno = 0
    Buffer.from(String(uid), 'ascii').copy(userBuf, 48, 0, 8);        // userId string (bytes 48-56)
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, userBuf);     // throws → aborts enrollment

    // CMD_STARTENROLL payload: uid (2 bytes LE) + finger_index (1 byte)
    const payload = Buffer.alloc(3);
    payload.writeUInt16LE(uid, 0);
    payload.writeUInt8(Math.max(0, Math.min(9, parseInt(String(finger), 10) || 0)), 2);

    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, payload);
    await zk.zklibTcp.enableDevice();
  } catch (e: any) {
    try { await zk.zklibTcp.enableDevice(); } catch {}
    try { await zk.disconnect(); } catch {}
    await query(
      `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, error_message, created_at)
       VALUES (?, ?, ?, ?, 'LOCAL', 'local', 'failed', ?, NOW())`,
      [schoolId, student_id, uid, Math.max(0, Math.min(9, parseInt(String(finger), 10) || 0)), e.message],
    ).catch(() => {});
    return NextResponse.json({
      error: `Enrollment failed: ${e.message}`,
    }, { status: 502 });
  }

  try { await zk.disconnect(); } catch {}

  // ── Audit log ──────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, created_at)
     VALUES (?, ?, ?, ?, 'LOCAL', 'local', 'initiated', NOW())`,
    [schoolId, student_id, uid, Math.max(0, Math.min(9, parseInt(String(finger), 10) || 0))],
  ).catch(() => {});

  return NextResponse.json({
    success: true,
    uid,
    student_name: studentName,
    device_ip,
    message: `Direct Connection Established. K40 Triggered for ${studentName} (UID ${uid}). Please scan finger now.`,
  });
}
