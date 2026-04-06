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
  const fingerIdx = Math.max(0, Math.min(9, parseInt(String(finger), 10) || 0));

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

  const zkName = studentName.replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim() || `S${student_id}`;

  // ── 2. Connect to device ────────────────────────────────────────────────────
  const zk = new ZKLib(device_ip, port, 8000, 5200);
  try {
    await zk.createSocket();
  } catch (e: any) {
    return NextResponse.json({
      error: `Cannot reach device at ${device_ip}:${port} — ${e.message}`,
      hint: 'Ensure device is on same LAN as the server',
    }, { status: 502 });
  }

  // ── 3. Fetch device users — resolve the CORRECT device slot (uid) ──────────
  //
  // Why this is required (not optional):
  //   userId (ZK bytes 48-55) = DRAIS student_id stored as ASCII PIN.
  //   uid    (ZK bytes  0- 1) = device-assigned slot number (≠ student_id).
  //
  // Physically-enrolled students may have uid=1 but userId="9" (student_id=9).
  // If we send CMD_STARTENROLL with uid=9 (wrong slot), the device creates a
  // NEW anonymous slot 9 — the "phantom" — and the fingerprint goes there.
  //
  // getUsers() failure is therefore FATAL: we must not guess.
  let deviceUid: number;
  try {
    await zk.zklibTcp.enableDevice();
    const zkUsers = await zk.getUsers();
    const users: Array<{ uid: any; name: string; userId: any }> = zkUsers?.data || [];

    // Match by userId (PIN) = DRAIS student_id
    const existing = users.find(u => String(u.userId ?? '').trim() === String(student_id));

    if (existing) {
      deviceUid = parseInt(String(existing.uid), 10);
      console.log(`[LOCAL-ENROLL] Found: student_id=${student_id} → device uid=${deviceUid} name="${existing.name}"`);
    } else {
      // Student not on device yet — find a free slot.
      // Prefer using student_id as the slot number (clean 1:1 mapping),
      // fall back to first unused slot if that slot is already taken.
      const taken = new Set(
        users.map(u => parseInt(String(u.uid), 10)).filter(n => n > 0 && !isNaN(n)),
      );
      let candidate = parseInt(String(student_id), 10);
      if (isNaN(candidate) || candidate < 1 || taken.has(candidate)) {
        candidate = 1;
        while (taken.has(candidate) && candidate <= 65535) candidate++;
      }
      deviceUid = candidate;
      console.log(`[LOCAL-ENROLL] New: student_id=${student_id} → assigning device uid=${deviceUid}`);
    }
  } catch (e: any) {
    try { await zk.zklibTcp.enableDevice(); } catch {}
    try { await zk.disconnect(); } catch {}
    return NextResponse.json({
      error: `Cannot read device users — ${e.message}. Please retry.`,
    }, { status: 502 });
  }

  // ── 4. Sync DB mapping to resolved device uid ───────────────────────────────
  // Store the ACTUAL device slot so relay-enroll has a correct fallback uid.
  await query(
    `INSERT INTO zk_user_mapping (school_id, student_id, device_user_id, user_type, device_sn)
     VALUES (?, ?, ?, 'student', ?)
     ON DUPLICATE KEY UPDATE device_user_id = VALUES(device_user_id), device_sn = VALUES(device_sn)`,
    [schoolId, student_id, deviceUid, device_ip],
  ).catch((e: any) => console.warn('[LOCAL-ENROLL] Mapping upsert failed (non-fatal):', e.message));

  // ── 5. Write identity + trigger enrollment ──────────────────────────────────
  try {
    try { await zk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, ''); } catch {}
    await zk.zklibTcp.disableDevice();

    // ZK 72-byte record layout:
    //   bytes  0-1  : uid (device slot — what CMD_STARTENROLL uses)
    //   bytes  2    : role (0 = regular user)
    //   bytes  3-10 : password (zeros)
    //   bytes 11-33 : name (ASCII, null-padded)
    //   bytes 35-38 : cardno (zeros)
    //   bytes 48-55 : userId (PIN = DRAIS student_id as ASCII) ← device PRIMARY KEY
    const userBuf = Buffer.alloc(72, 0);
    userBuf.writeUInt16LE(deviceUid, 0);
    Buffer.from(zkName, 'ascii').copy(userBuf, 11, 0, 23);
    Buffer.from(String(student_id), 'ascii').copy(userBuf, 48, 0, 8);
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, userBuf);

    const payload = Buffer.alloc(3);
    payload.writeUInt16LE(deviceUid, 0);
    payload.writeUInt8(fingerIdx, 2);
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, payload);
    await zk.zklibTcp.enableDevice();
  } catch (e: any) {
    try { await zk.zklibTcp.enableDevice(); } catch {}
    try { await zk.disconnect(); } catch {}
    await query(
      `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, error_message, created_at)
       VALUES (?, ?, ?, ?, 'LOCAL', 'local', 'failed', ?, NOW())`,
      [schoolId, student_id, deviceUid, fingerIdx, e.message],
    ).catch(() => {});
    return NextResponse.json({ error: `Enrollment failed: ${e.message}` }, { status: 502 });
  }

  try { await zk.disconnect(); } catch {}

  // ── 6. Audit log ────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, created_at)
     VALUES (?, ?, ?, ?, 'LOCAL', 'local', 'initiated', NOW())`,
    [schoolId, student_id, deviceUid, fingerIdx],
  ).catch(() => {});

  return NextResponse.json({
    success: true,
    uid: deviceUid,
    student_name: studentName,
    device_ip,
    message: `K40 ready — scan finger now for ${studentName} (slot ${deviceUid}).`,
  });
}
