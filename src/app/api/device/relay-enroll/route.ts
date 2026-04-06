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

  // ── 6. Name formatting (ZK 23-char limit, ASCII only) ──────────────────────
  const zkName = studentName.replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim() || `UID${uid}`;

  // ── 7. Local warm-up: if server can reach the device directly, skip relay ───
  // Look up device IP from devices table. If the Next.js server is on the same
  // LAN as the K40 (school on-prem deployment), use direct TCP for zero latency.
  // On failure, fall through to the relay queue path.
  const deviceIpRows = await query(
    'SELECT ip_address FROM devices WHERE sn = ? AND school_id = ? LIMIT 1',
    [device_sn, deviceSchoolId],
  ).catch(() => null) as Array<{ ip_address: string }> | null;
  const deviceIp = deviceIpRows?.[0]?.ip_address || null;

  if (deviceIp && isValidLanIP(deviceIp)) {
    let warmupDeviceUid = uid; // may be updated by fetch-first inside the try block
    try {
      const zk = new ZKLib(deviceIp, 4370, 8000, 5200);
      await zk.createSocket();
      try {
        try { await zk.zklibTcp.executeCmd(COMMANDS.CMD_CANCELCAPTURE, ''); } catch {}

        // ── Fetch-first: resolve device slot using DB mapping, name match, or free slot ──
        // PIN written to device = String(warmupDeviceUid) = the slot number itself.
        // Must NOT be String(student_id) — the SQL PK can be millions which overflows
        // writeUInt16LE and corrupts or phantoms the device record.
        try {
          await zk.zklibTcp.enableDevice();
          const zkUsers = await zk.getUsers();
          const deviceUsers = (zkUsers?.data || [])
            .map((u: any) => ({ uid: parseInt(String(u.uid), 10), name: String(u.name||'').trim(), userId: String(u.userId??'').trim() }))
            .filter((u: any) => !isNaN(u.uid) && u.uid >= 1 && u.uid <= 65535);
          // DB mapping uid match (device_user_id stores our small sequential number)
          const byUid = deviceUsers.find((u: any) => u.uid === warmupDeviceUid);
          if (!byUid) {
            // Name match fallback
            const upper = zkName.toUpperCase();
            const byName = deviceUsers.find((u: any) => u.name.toUpperCase() === upper);
            if (byName) {
              warmupDeviceUid = byName.uid;
              console.log(`[relay-enroll:warmup] Name match "${zkName}" → slot ${warmupDeviceUid}`);
            } else {
              // New — find first free slot
              const taken = new Set(deviceUsers.map((u: any) => u.uid));
              let s = warmupDeviceUid;
              if (taken.has(s)) { s = 1; while (taken.has(s) && s <= 65535) s++; }
              warmupDeviceUid = s;
            }
          }
        } catch {}
        await zk.zklibTcp.disableDevice();

        // Step 1: Pre-register identity
        // PIN (bytes 48-55) = String(warmupDeviceUid), the same small slot number.
        const userBuf = Buffer.alloc(72, 0);
        userBuf.writeUInt16LE(warmupDeviceUid, 0);
        Buffer.from(zkName, 'ascii').copy(userBuf, 11, 0, 23);
        Buffer.from(String(warmupDeviceUid), 'ascii').copy(userBuf, 48, 0, 8); // PIN = slot number
        console.log(`[relay-enroll:warmup] Step 1 — Registering ${zkName} slot=${warmupDeviceUid}…`);
        await zk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, userBuf);
        console.log(`[relay-enroll:warmup] Registering ${zkName}… Success.`);

        // Step 2: Trigger scan
        const payload = Buffer.alloc(3);
        payload.writeUInt16LE(warmupDeviceUid, 0);
        payload.writeUInt8(fingerIdx, 2);
        console.log(`[relay-enroll:warmup] Step 2 — Triggering Scan for ${zkName} (finger=${fingerIdx})…`);
        await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, payload);
        await zk.zklibTcp.enableDevice();
        console.log(`[relay-enroll:warmup] Triggering Scan… Success. K40 screen now shows "${zkName}".`);
      } finally {
        try { await zk.disconnect(); } catch {}
      }

      // Audit log for the local warm-up enrollment
      await query(
        `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'local', 'initiated', NOW())`,
        [session.schoolId, student_id, warmupDeviceUid, fingerIdx, device_sn],
      ).catch(() => {});

      console.log(`[relay-enroll:warmup] Identity Synchronized for ${studentName} (UID=${warmupDeviceUid}). Machine is ready for scanning.`);

      return NextResponse.json({
        success: true,
        uid: warmupDeviceUid,
        student_name: studentName,
        device_sn,
        local_warmup: true,
        message: `Identity Synchronized for ${studentName}. Machine is ready for scanning.`,
      });
    } catch (warmupErr: any) {
      // Local attempt failed — fall through to relay queue
      console.warn(`[relay-enroll:warmup] Local TCP failed (${warmupErr.message}), falling back to relay queue`);
    }
  }

  // ── 8. Queue relay command ──────────────────────────────────────────────────
  const insertResult = await query(
    `INSERT INTO relay_commands (device_sn, action, params, status, created_at)
     VALUES (?, 'enroll', ?, 'pending', NOW())`,
    [device_sn, JSON.stringify({ uid, finger: fingerIdx, name: zkName, student_id })],
  );
  const commandId = (insertResult as any)?.insertId;

  // ── 9. Audit log ────────────────────────────────────────────────────────────
  await query(
    `INSERT INTO enrollment_log (school_id, student_id, uid, finger, device_sn, path, status, relay_cmd_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'relay', 'initiated', ?, NOW())`,
    [session.schoolId, student_id, uid, fingerIdx, device_sn, commandId],
  ).catch((e: any) => console.warn('[relay-enroll] enrollment_log insert failed (non-fatal):', e.message));

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
