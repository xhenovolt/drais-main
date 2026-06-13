/**
 * POST /api/device/local-enroll
 * ─────────────────────────────
 * Hybrid Enrollment — Local (Direct TCP) path.
 *
 * Instead of queuing a device_command and waiting for the device to poll
 * (ADMS / cloud path), this endpoint connects directly to the ZKTeco device
 * on the LAN and sends CMD_STARTENROLL immediately.
 *
 * PHASE 1B REWRITE (attendance trust refactor)
 * --------------------------------------------
 * The audited version of this route had two critical violations:
 *
 *   1. It stored the device's LAN IP in `device_sn` columns. Every
 *      consumer of device_sn (the punch resolver, the template-capture
 *      mapping lookup, sync state) compares against the REAL ADMS
 *      serial number, so the IP-keyed rows matched nothing: punches
 *      showed "Unrecognized" and templates landed in
 *      fingerprint_orphans right after a "successful" enrollment.
 *      → The route now resolves the REAL serial number, preferring to
 *        ask the device itself over TCP (CMD_OPTIONS_RRQ
 *        ~SerialNumber), falling back to an explicit `device_sn` in
 *        the body, then to the registered device row matching the IP.
 *        If no serial can be established the request is rejected — we
 *        never write an IP where a serial belongs.
 *
 *   2. It marked the enrollment ASSIGNED/COMPLETED immediately after
 *      sending CMD_STARTENROLL — before any finger touched the sensor.
 *      → The route now writes a canonical biometric_enrollments row
 *        with status='pending_capture'. The ONLY transition to
 *        'active' happens in the zk-handler template path
 *        (completeEnrollmentCapture) when the fingerprint template
 *        actually arrives via ADMS OPERLOG/TEMPLATEV10. The UI polls
 *        GET /api/device/local-enroll/status?enrollment_id=… for the
 *        truth.
 *
 * Body: { student_id: number, device_ip: string, device_port?: number,
 *         finger?: number, device_sn?: string }
 * Returns: { success, uid, enrollment_id, device_sn, student_name, message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { upsertEnrollment, setCaptureStatus, looksLikeIpAddress } from '@/lib/biometric/enrollment-service';
import { ensureDevicesCanonicalSchema } from '@/lib/devices/migrations/devices-canonical-schema';

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

/**
 * Ask the connected device for its serial number via CMD_OPTIONS_RRQ.
 * Reply payload is "~SerialNumber=ABC1234567890\0…". Best-effort —
 * returns null on any failure so the caller can fall back.
 */
async function readDeviceSerial(zk: any): Promise<string | null> {
  try {
    const reply = await zk.zklibTcp.executeCmd(
      COMMANDS.CMD_OPTIONS_RRQ,
      '~SerialNumber\0',
    );
    if (!reply) return null;
    const text = Buffer.isBuffer(reply) ? reply.toString('ascii') : String(reply);
    const m = text.match(/~?SerialNumber=([\x21-\x7E]+)/);
    const sn = m?.[1]?.replace(/\0.*$/, '').trim();
    if (sn && sn.length >= 4 && !looksLikeIpAddress(sn)) return sn;
    return null;
  } catch {
    return null;
  }
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

  const { device_ip, device_port = 4370, finger = 0 } = body;
  const explicitSn: string | null =
    typeof body.device_sn === 'string' && body.device_sn.trim() && !looksLikeIpAddress(body.device_sn)
      ? body.device_sn.trim()
      : null;

  // Phase 2I — staff enrollment is first-class: pass student_id OR
  // staff_id (exactly one).
  const studentId = body.student_id ? Number(body.student_id) : null;
  const staffId = body.staff_id ? Number(body.staff_id) : null;
  if ((!studentId && !staffId) || (studentId && staffId)) {
    return NextResponse.json({ error: 'Pass exactly one of student_id or staff_id' }, { status: 400 });
  }
  const roleType: 'student' | 'staff' = studentId ? 'student' : 'staff';
  const roleRefId = (studentId ?? staffId) as number;

  if (!device_ip || !isValidLanIP(device_ip)) {
    return NextResponse.json({ error: 'Invalid device_ip — must be a LAN IPv4 address' }, { status: 400 });
  }

  const schoolId = session.schoolId;
  const port = Math.max(1, Math.min(65535, parseInt(String(device_port), 10) || 4370));
  const fingerIdx = Math.max(0, Math.min(9, parseInt(String(finger), 10) || 0));

  // ── 1. Resolve person name (school-scoped) ──────────────────────────────────
  let personName = roleType === 'student' ? 'Student' : 'Staff';
  try {
    const roleTable = roleType === 'student' ? 'students' : 'staff';
    const personRows = await query(
      `SELECT p.first_name, p.last_name
       FROM ${roleTable} r
       JOIN people p ON r.person_id = p.id
       WHERE r.id = ? AND r.school_id = ? AND r.deleted_at IS NULL
       LIMIT 1`,
      [roleRefId, schoolId],
    );
    if (!personRows?.length) {
      return NextResponse.json({ error: `${roleType === 'student' ? 'Student' : 'Staff member'} not found` }, { status: 404 });
    }
    personName = `${personRows[0].first_name ?? ''} ${personRows[0].last_name ?? ''}`.trim() || personName;
  } catch (e: any) {
    return NextResponse.json({ error: `DB error: ${e.message}` }, { status: 500 });
  }

  const zkName = personName.replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim() || `${roleType === 'student' ? 'S' : 'T'}${roleRefId}`;

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

  // ── 2b. Resolve the REAL device serial number (Phase 1B) ───────────────────
  // Priority: device's own answer (TCP) → explicit body.device_sn →
  // registered device row matching this LAN IP. Never the IP itself.
  let deviceSn: string | null = await readDeviceSerial(zk);
  if (!deviceSn && explicitSn) deviceSn = explicitSn;
  if (!deviceSn) {
    try {
      const bySnRows = await query(
        `SELECT sn FROM devices
          WHERE ip_address = ? AND school_id = ? AND sn IS NOT NULL AND deleted_at IS NULL
          ORDER BY last_seen DESC
          LIMIT 1`,
        [device_ip, schoolId],
      );
      const candidate = bySnRows?.[0]?.sn ? String(bySnRows[0].sn).trim() : null;
      if (candidate && !looksLikeIpAddress(candidate)) deviceSn = candidate;
    } catch { /* devices table shape drift — fall through */ }
  }
  if (!deviceSn) {
    try { await zk.disconnect(); } catch {}
    return NextResponse.json({
      error: 'Could not determine the device serial number.',
      hint: 'Pass device_sn explicitly, or let the device heartbeat to DRAIS once (Comm → ADMS) so it registers, then retry. The serial is required — enrollments are never keyed by IP address.',
    }, { status: 422 });
  }

  // Register/refresh the device row so the serial↔school binding exists.
  try {
    await ensureDevicesCanonicalSchema();
    await query(
      `INSERT INTO devices (sn, ip_address, school_id, status, last_seen)
       VALUES (?, ?, ?, 'active', NOW())
       ON DUPLICATE KEY UPDATE
         ip_address = VALUES(ip_address),
         school_id = COALESCE(school_id, VALUES(school_id)),
         last_seen = NOW(),
         updated_at = CURRENT_TIMESTAMP`,
      [deviceSn, device_ip, schoolId],
    );
  } catch (e: any) {
    console.warn('[LOCAL-ENROLL] device upsert (non-fatal):', e.message);
  }

  // ── 3. Fetch all device users — REQUIRED, fatal on failure ────────────────
  //
  // The device slot (uid, bytes 0-1) is a small sequential number (1, 2, 3…).
  // The userId/PIN (bytes 48-55) must ALSO be a small sequential number — our
  // managed PIN, stored canonically in biometric_enrollments. It must NOT be
  // the SQL students.id (which can be millions), because:
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
  // Canonical PINs already allocated in this school must not be reused
  // for a different person, even if the device doesn't know them yet.
  try {
    const pinRows = await query(
      `SELECT pin_value FROM biometric_enrollments
        WHERE school_id = ? AND status IN ('active','pending_capture')`,
      [schoolId],
    );
    for (const r of pinRows || []) {
      const p = Number(r.pin_value);
      if (Number.isFinite(p) && p >= 1 && p <= 65535) takenSlots.add(p);
    }
  } catch { /* canonical table ensured lazily — fine on first run */ }

  function nextFreeSlot(): number {
    let s = 1;
    while (takenSlots.has(s) && s <= 65535) s++;
    return s;
  }

  // ── 4. Resolve device slot/PIN ──────────────────────────────────────────────
  // Priority 1: canonical enrollment — the student already has a PIN
  // Priority 2: legacy zk_user_mapping row (transition window)
  // Priority 3: Name match on device (physically-enrolled, not yet in DB)
  // Priority 4: First free slot
  let deviceSlot: number | null = null;

  try {
    const canonical = await query(
      `SELECT pin_value FROM biometric_enrollments
        WHERE school_id = ? AND role_type = ? AND role_ref_id = ?
          AND status IN ('active','pending_capture')
        LIMIT 1`,
      [schoolId, roleType, roleRefId],
    );
    const pin = Number(canonical?.[0]?.pin_value);
    if (Number.isFinite(pin) && pin >= 1 && pin <= 65535) {
      deviceSlot = pin;
      console.log(`[LOCAL-ENROLL] Canonical enrollment: ${roleType}=${roleRefId} → PIN ${deviceSlot}`);
    }
  } catch { /* fall through */ }

  if (deviceSlot === null) {
    const roleColumn = roleType === 'student' ? 'student_id' : 'staff_id';
    const mappingRows = await query(
      `SELECT device_user_id FROM zk_user_mapping WHERE ${roleColumn} = ? AND school_id = ? LIMIT 1`,
      [roleRefId, schoolId],
    ).catch(() => null);
    if (mappingRows?.length) {
      const mapped = parseInt(String(mappingRows[0].device_user_id), 10);
      if (!isNaN(mapped) && mapped >= 1 && mapped <= 65535) {
        deviceSlot = mapped;
        console.log(`[LOCAL-ENROLL] Legacy mapping: ${roleType}=${roleRefId} → slot ${deviceSlot}`);
      } else if (!isNaN(mapped)) {
        // Corrupted mapping (large SQL id stored) — recover via device userId
        const byUserId = deviceUsers.find(u => u.userId === String(mapped));
        if (byUserId) {
          deviceSlot = byUserId.uid;
          console.log(`[LOCAL-ENROLL] Recovered from corrupted mapping (${mapped}) → actual slot ${deviceSlot}`);
        }
      }
    }
  }

  // Name match — catches students enrolled directly on the device keyboard
  if (deviceSlot === null) {
    const upper = zkName.toUpperCase();
    const nameMatches = deviceUsers.filter(u => u.name.toUpperCase() === upper);
    if (nameMatches.length === 1) {
      deviceSlot = nameMatches[0].uid;
      console.log(`[LOCAL-ENROLL] Name match: "${zkName}" → slot ${deviceSlot}`);
    } else if (nameMatches.length > 1) {
      // Phase 1E — two device users share this name; choosing one would
      // risk stealing another person's slot/fingerprint. Allocate fresh.
      console.warn(`[LOCAL-ENROLL] Ambiguous device name "${zkName}" (${nameMatches.length} slots) — allocating a fresh slot instead`);
    }
  }

  // New person — assign the first free slot
  if (deviceSlot === null) {
    deviceSlot = nextFreeSlot();
    console.log(`[LOCAL-ENROLL] New: ${roleType}=${roleRefId} "${zkName}" → new slot ${deviceSlot}`);
  }

  // ── 5. Canonical enrollment (pending_capture) + legacy mirror ──────────────
  // upsertEnrollment writes biometric_enrollments with the REAL serial
  // and mirrors zk_user_mapping. status='pending_capture' — the
  // zk-handler flips it to 'active' when the template arrives.
  // capture_status='command_sent': we are about to drive the device
  // synchronously over TCP (no queue step on the local path).
  const enrollment = await upsertEnrollment({
    schoolId,
    roleType,
    roleRefId,
    pin: deviceSlot,
    deviceSn,
    status: 'pending_capture',
    captureStatus: 'command_sent',
    source: 'local_tcp_enroll',
    enrolledBy: (session as any).userId ?? null,
  });
  if (!enrollment.ok) {
    try { await zk.disconnect(); } catch {}
    return NextResponse.json({
      error: `Cannot bind PIN ${deviceSlot} to this ${roleType}: ${enrollment.reason}${enrollment.detail ? ` (${enrollment.detail})` : ''}`,
      hint: enrollment.reason === 'pin_conflict'
        ? 'The PIN is actively held by another person. Resolve the conflict in the mapping screen, or retry to allocate a fresh slot.'
        : undefined,
    }, { status: 409 });
  }
  const enrollmentId = enrollment.enrollmentId ?? null;

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
    // The device resolves the enrollment target by matching the PIN string to
    // the PIN field written via CMD_USER_WRQ — byte-for-byte identical match.
    const enrollPayload = Buffer.alloc(10, 0);
    Buffer.from(pinStr, 'ascii').copy(enrollPayload, 0, 0, 9); // PIN, null-padded
    enrollPayload[9] = fingerIdx;                               // finger index
    await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, enrollPayload);
    console.log(`[LOCAL-ENROLL] CMD_USER_WRQ + CMD_STARTENROLL(FormatB) → sn=${deviceSn} slot=${deviceSlot} PIN="${pinStr}" finger=${fingerIdx}`);
    await zk.zklibTcp.enableDevice();
  } catch (e: any) {
    try { await zk.zklibTcp.enableDevice(); } catch {}
    try { await zk.disconnect(); } catch {}
    await query(
      `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, 'local', 'failed', ?, NOW())`,
      [schoolId, studentId, deviceSlot, fingerIdx, deviceSn, e.message],
    ).catch(() => {});
    // The enrollment stays 'pending_capture' (identity intact, retry
    // reuses the same PIN); capture_status records the failure.
    if (enrollmentId) {
      await setCaptureStatus(schoolId, enrollmentId, 'failed', {
        reason: `start-enroll failed: ${String(e.message).slice(0, 200)}`,
        updatedBy: (session as any).userId ?? null,
      });
    }
    return NextResponse.json({ error: `Enrollment failed: ${e.message}` }, { status: 502 });
  }

  try { await zk.disconnect(); } catch {}

  // Device acknowledged CMD_STARTENROLL — now genuinely waiting for a
  // finger on the sensor.
  if (enrollmentId) {
    await setCaptureStatus(schoolId, enrollmentId, 'awaiting_capture', {
      updatedBy: (session as any).userId ?? null,
    });
  }

  // ── 7. Audit log ────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'local', 'initiated', NOW())`,
    [schoolId, studentId, deviceSlot, fingerIdx, deviceSn],
  ).catch(() => {});

  // NOTE: deliberately NOT marked complete here. Completion is the
  // template's arrival (zk-handler → completeEnrollmentCapture). Poll
  // GET /api/device/local-enroll/status?enrollment_id=… for the truth.
  return NextResponse.json({
    success: true,
    uid: deviceSlot,
    enrollment_id: enrollmentId,
    device_sn: deviceSn,
    role_type: roleType,
    student_name: personName,
    person_name: personName,
    device_ip,
    status: 'awaiting_capture',
    message: `Device ready — ${personName} should scan their finger now (slot ${deviceSlot}). Enrollment completes when the fingerprint template reaches DRAIS.`,
  });
}
