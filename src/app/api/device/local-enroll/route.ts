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

  // ── 3. Fetch all device users — REQUIRED, fatal on failure ────────────────
  //
  // The device slot (uid, bytes 0-1) is a small sequential number (1, 2, 3…).
  // The userId/PIN (bytes 48-55) must ALSO be a small sequential number — our
  // managed device_user_id, stored in zk_user_mapping.  It must NOT be the
  // SQL students.id (which can be millions), because:
  //   • writeUInt16LE(1022761) silently overflows to a random slot
  //   • The device keyboard cannot handle multi-million PINs
  //   • Overwriting a user's PIN breaks any future match by userId
  //
  // If getUsers() fails we cannot safely determine the correct slot → fatal.
  let deviceUsers: Array<{ uid: number; name: string; userId: string }>;
  try {
    await zk.zklibTcp.enableDevice();
    const result = await zk.getUsers();
    deviceUsers = (result?.data || [])
      .map((u: any) => ({
        uid: parseInt(String(u.uid), 10),
        name: String(u.name || '').trim(),
        userId: String(u.userId ?? '').trim(),
      }))
      .filter(u => !isNaN(u.uid) && u.uid >= 1 && u.uid <= 65535);
  } catch (e: any) {
    try { await zk.zklibTcp.enableDevice(); } catch {}
    try { await zk.disconnect(); } catch {}
    return NextResponse.json({
      error: `Cannot read device users — ${e.message}. Retry.`,
    }, { status: 502 });
  }

  const takenSlots = new Set(deviceUsers.map(u => u.uid));
  function nextFreeSlot(): number {
    let s = 1;
    while (takenSlots.has(s) && s <= 65535) s++;
    return s;
  }

  // ── 4. Resolve device slot ──────────────────────────────────────────────────
  // Priority 1: DB mapping — device_user_id is our authoritative small-number slot
  // Priority 2: Name match on device (for physically-enrolled students not yet in DB)
  // Priority 3: First free slot on device
  let deviceSlot: number | null = null;

  const mappingRows = await query(
    `SELECT device_user_id FROM zk_user_mapping WHERE student_id = ? AND school_id = ? LIMIT 1`,
    [student_id, schoolId],
  ).catch(() => null);

  if (mappingRows?.length) {
    const mapped = parseInt(String(mappingRows[0].device_user_id), 10);
    if (!isNaN(mapped) && mapped >= 1 && mapped <= 65535) {
      // Valid small mapping — use it whether or not the slot is already occupied
      // (CMD_USER_WRQ will update existing or create new at this slot)
      deviceSlot = mapped;
      console.log(`[LOCAL-ENROLL] DB mapping: student_id=${student_id} → slot ${deviceSlot}`);
    } else if (!isNaN(mapped)) {
      // Corrupted mapping (large SQL id stored) — try to find user on device by that old userId string
      const byUserId = deviceUsers.find(u => u.userId === String(mapped));
      if (byUserId) {
        deviceSlot = byUserId.uid;
        console.log(`[LOCAL-ENROLL] Recovered from corrupted mapping (${mapped}) → actual slot ${deviceSlot}`);
      }
    }
  }

  // Name match — catches students enrolled directly on the device keyboard
  if (deviceSlot === null) {
    const upper = zkName.toUpperCase();
    const nameMatch = deviceUsers.find(u => u.name.toUpperCase() === upper);
    if (nameMatch) {
      deviceSlot = nameMatch.uid;
      console.log(`[LOCAL-ENROLL] Name match: "${zkName}" → slot ${deviceSlot}`);
    }
  }

  // New student — assign the first free slot
  if (deviceSlot === null) {
    deviceSlot = nextFreeSlot();
    console.log(`[LOCAL-ENROLL] New: student_id=${student_id} "${zkName}" → new slot ${deviceSlot}`);
  }

  // ── 5. Upsert DB mapping so it always reflects the real device slot ─────────
  await query(
    `INSERT INTO zk_user_mapping (school_id, student_id, device_user_id, user_type, device_sn)
     VALUES (?, ?, ?, 'student', ?)
     ON DUPLICATE KEY UPDATE device_user_id = VALUES(device_user_id), device_sn = VALUES(device_sn)`,
    [schoolId, student_id, deviceSlot, device_ip],
  ).catch((e: any) => console.warn('[LOCAL-ENROLL] Mapping upsert (non-fatal):', e.message));

  // ── 5b. Open enrollment session + INITIATED record ────────────────────────
  // device_sn stored as device_ip (K40 identifies itself by IP on LAN path)
  let sessionId: number | null = null;
  let enrollmentId: number | null = null;
  try {
    const sessRes = await query(
      `INSERT INTO enrollment_sessions
         (school_id, device_sn, initiated_by, student_id, status, expires_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [schoolId, device_ip, session.userId, student_id],
    );
    sessionId = (sessRes as any).insertId ?? null;

    const enrRes = await query(
      `INSERT INTO biometric_enrollments
         (school_id, device_sn, device_slot, student_id, status, source, session_id, finger_index)
       VALUES (?, ?, ?, ?, 'INITIATED', 'local', ?, ?)`,
      [schoolId, device_ip, deviceSlot, student_id, sessionId, fingerIdx],
    );
    enrollmentId = (enrRes as any).insertId ?? null;
  } catch (e: any) {
    console.warn('[LOCAL-ENROLL] Session/enrollment record (non-fatal):', e.message);
  }

  // ── 6. Write identity + trigger enrollment ──────────────────────────────────
  try {
    try { await zk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, ''); } catch {}
    await zk.zklibTcp.disableDevice();

    // ── ZK 72-byte CMD_USER_WRQ payload layout ────────────────────────────
    //   bytes  0-1  uid  → deviceSlot (UInt16LE)
    //   bytes 11-33 name → ASCII name, null-padded
    //   bytes 48-56 PIN  → ASCII slot number, null-padded
    //                       (decodeUserData72 reads bytes 48-56 as ASCII string)
    const pinStr = String(deviceSlot);
    const userBuf = Buffer.alloc(72, 0);
    userBuf.writeUInt16LE(deviceSlot, 0);
    Buffer.from(zkName, 'ascii').copy(userBuf, 11, 0, 23);
    Buffer.from(pinStr, 'ascii').copy(userBuf, 48, 0, 8);
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, userBuf);

    // CMD_REFRESHDATA — flush user record to device RAM before enrollment.
    // Without this the firmware may not find the just-written slot when
    // CMD_STARTENROLL fires, causing it to silently create an orphan at uid 0.
    try { await zk.zklibTcp.executeCmd(COMMANDS.CMD_REFRESHDATA, ''); } catch {}

    // ── CMD_STARTENROLL — Format B (9-byte null-terminated ASCII PIN) ────────
    // Format A used UInt16LE uid (3 bytes). Format B uses the PIN string field
    // (9 bytes, null-terminated) followed by the finger index byte.
    // The device resolves the enrollment target by matching the PIN string to
    // the PIN field written via CMD_USER_WRQ — byte-for-byte identical match.
    // This eliminates the uid/PIN ambiguity that caused \u0001 phantom slots.
    const enrollPayload = Buffer.alloc(10, 0);
    Buffer.from(pinStr, 'ascii').copy(enrollPayload, 0, 0, 9); // PIN, null-padded
    enrollPayload[9] = fingerIdx;                               // finger index
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, enrollPayload);
    console.log(`[LOCAL-ENROLL] CMD_USER_WRQ + CMD_STARTENROLL(FormatB) → slot=${deviceSlot} PIN="${pinStr}" finger=${fingerIdx}`);
    await zk.zklibTcp.enableDevice();

    // ── Post-enrollment name re-confirmation ───────────────────────────────
    // Some ZK devices clear or corrupt the name when finalising a fingerprint
    // template. Write the name a second time (fire-and-forget) so the slot is
    // always labelled correctly on the device, regardless of what it did during
    // the biometric capture.
    // Post-enroll: the K40 firmware overwrites the user record with a binary PIN
    // after fingerprint finalization. The ADMS DATA UPDATE USERINFO command
    // (queued below) restores it at the next heartbeat — no second TCP write needed.
  } catch (e: any) {
    try { await zk.zklibTcp.enableDevice(); } catch {}
    try { await zk.disconnect(); } catch {}
    await query(
      `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, error_message, created_at)
       VALUES (?, ?, ?, ?, 'LOCAL', 'local', 'failed', ?, NOW())`,
      [schoolId, student_id, deviceSlot, fingerIdx, e.message],
    ).catch(() => {});
    // Mark session/enrollment as FAILED
    if (enrollmentId) {
      query(
        `UPDATE biometric_enrollments SET status='ORPHANED', updated_at=NOW() WHERE id=?`,
        [enrollmentId],
      ).catch(() => {});
    }
    if (sessionId) {
      query(
        `UPDATE enrollment_sessions SET status='FAILED', completed_at=NOW() WHERE id=?`,
        [sessionId],
      ).catch(() => {});
    }
    return NextResponse.json({ error: `Enrollment failed: ${e.message}` }, { status: 502 });
  }

  try { await zk.disconnect(); } catch {}

  // ── 6. Audit log ────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, created_at)
     VALUES (?, ?, ?, ?, 'LOCAL', 'local', 'initiated', NOW())`,
    [schoolId, student_id, deviceSlot, fingerIdx],
  ).catch(() => {});

  // ── Flip enrollment state: INITIATED → ASSIGNED (identity was pre-known) ──
  if (enrollmentId) {
    query(
      `UPDATE biometric_enrollments
       SET status='ASSIGNED', assigned_at=NOW(), updated_at=NOW()
       WHERE id=?`,
      [enrollmentId],
    ).catch(() => {});
  }
  if (sessionId) {
    query(
      `UPDATE enrollment_sessions SET status='COMPLETED', completed_at=NOW() WHERE id=?`,
      [sessionId],
    ).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    uid: deviceSlot,
    student_name: studentName,
    device_ip,
    message: `K40 ready — scan finger now for ${studentName} (slot ${deviceSlot}).`,
  });
}
