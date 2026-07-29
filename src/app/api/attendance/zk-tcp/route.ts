/**
 * ZKTeco Direct TCP SDK API
 * ═════════════════════════
 * Connects directly to device on port 4370 (same LAN or via relay).
 * Full control: get info, users, start enrollment, read templates, realtime events.
 *
 * ADMS Push Protocol = device calls us (limited command support).
 * TCP SDK Protocol   = WE call device (full control, CMD_STARTENROLL works).
 *
 * Two modes:
 *   1. Direct — DRAIS server on same LAN → TCP to device IP
 *   2. Relay  — DRAIS cloud + relay agent on school LAN → WebSocket bridge
 */
import { NextRequest, NextResponse } from 'next/server';
import { schoolLocalToday } from '@/lib/datetime/local-date';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveIdentity } from '@/lib/biometric/identity/resolve';
import { recordRawEvent } from '@/lib/attendance/engine';
import { decidePunchTime, getDeviceTimeContext, resolveTimePolicy, measureBatchOffsetSeconds, persistDeviceClockOffset } from '@/lib/attendance/device-clock';
import { normalizeDeviceDateTime } from '@/lib/attendance/adms-protocol';
import { beginAcquisition, stageRecords, finishAcquisition } from '@/lib/attendance/acquisition/service';
import { wallFromZkRecordTime, wallDate, decodeZkPackedTime, type DeviceWallTime } from '@/lib/attendance/acquisition/wall-time';
import { validateAcquisition } from '@/lib/attendance/acquisition/validate';

/** Probe the device's own wall clock (CMD_GET_TIME=201). Best-effort. */
async function probeDeviceWallTime(zk: any): Promise<DeviceWallTime | null> {
  try {
    const reply: Buffer = await zk.executeCmd(COMMANDS.CMD_GET_TIME, '');
    if (!reply || reply.length < 4) return null;
    // TCP replies carry an 8-byte header before payload; UDP replies don't.
    const packed = reply.length >= 12 ? reply.readUInt32LE(8) : reply.readUInt32LE(reply.length - 4);
    return decodeZkPackedTime(packed);
  } catch { return null; }
}

export const runtime = 'nodejs';

const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');

// ─── Connection Pool ──────────────────────────────────────────────────────────
// Keep connections alive for a short period to avoid reconnecting for every action.
// Key: device IP, Value: { zk, connectedAt, lastUsed }

interface PoolEntry {
  zk: any;
  connectedAt: number;
  lastUsed: number;
  ip: string;
}

const pool = new Map<string, PoolEntry>();
const POOL_TIMEOUT = 60_000; // 60s idle timeout

// Clean up idle connections every 30s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pool.entries()) {
    if (now - entry.lastUsed > POOL_TIMEOUT) {
      try { entry.zk.disconnect(); } catch {}
      pool.delete(key);
    }
  }
}, 30_000);

async function getConnection(ip: string, port = 4370, timeout = 10000): Promise<any> {
  const existing = pool.get(ip);
  if (existing) {
    existing.lastUsed = Date.now();
    // Test if still alive
    try {
      await existing.zk.getInfo();
      return existing.zk;
    } catch {
      // Dead connection, remove and reconnect
      try { existing.zk.disconnect(); } catch {}
      pool.delete(ip);
    }
  }

  const zk = new ZKLib(ip, port, timeout, 5200);
  await zk.createSocket();

  pool.set(ip, {
    zk,
    connectedAt: Date.now(),
    lastUsed: Date.now(),
    ip,
  });

  return zk;
}

// Helper: build joined attendance records (device users + DRAIS resolution)
async function buildJoinedAttendance(
  rawArr: any[],
  zk: any,
  ip: string,
  session: any,
  deviceSnParam?: string,
  maxRecords = 500,
  clockOffsetMinutes = 0,
) {
  // Build device PIN -> device name map
  const userNameMap: Record<string, string> = {};
  try {
    const usersResult = await zk.getUsers();
    for (const u of (usersResult?.data || [])) {
      const pin = String(u.userId ?? '');
      if (pin && u.name) userNameMap[pin] = String(u.name).trim();
    }
  } catch {}

  const resolvedSn: string = (deviceSnParam as string | undefined)
    || (await query('SELECT sn FROM devices WHERE lan_ip = ? AND school_id = ? LIMIT 1', [ip, session.schoolId]))?.[0]?.sn
    || '';

  const limited = rawArr.slice(-maxRecords);

  const timePolicy = await resolveTimePolicy(session.schoolId);
  const deviceCtx = await getDeviceTimeContext(resolvedSn || '');
  const effectiveOffsetMinutesForBatch = clockOffsetMinutes || (deviceCtx.tzOffsetMinutes ?? timePolicy.offsetMinutes);
  // Prefer THIS pull's own measured drift over a possibly stale persisted
  // scalar — a device's real drift moves over time (RTC crawl, reset,
  // battery swap), so correcting against an old measurement corrects the
  // wrong amount (e.g. still applying 5h when today it's only 2-3h).
  const batchOffsetSeconds = measureBatchOffsetSeconds(
    limited.map((rec: any) => {
      const rawDate = rec.recordTime instanceof Date ? rec.recordTime : new Date(rec.recordTime);
      return normalizeDeviceDateTime(rawDate instanceof Date ? formatDateTime(rawDate) : String(rec.recordTime)) || formatDateTime(rawDate);
    }),
    effectiveOffsetMinutesForBatch,
  );
  const storedOffsetSeconds = batchOffsetSeconds ?? deviceCtx.clockOffsetSeconds;
  if (batchOffsetSeconds != null && resolvedSn) persistDeviceClockOffset(resolvedSn, batchOffsetSeconds).catch(() => {});

  const out: any[] = [];
  for (const rec of limited) {
    const pin = String(rec.deviceUserId ?? '');
    const rawDate = rec.recordTime instanceof Date ? rec.recordTime : new Date(rec.recordTime);
    const normalizedCheckTime = normalizeDeviceDateTime(rawDate instanceof Date ? formatDateTime(rawDate) : String(rec.recordTime)) || formatDateTime(rawDate);
    const effectiveOffsetMinutes = clockOffsetMinutes || (deviceCtx.tzOffsetMinutes ?? timePolicy.offsetMinutes);
    const decision = decidePunchTime(
      normalizedCheckTime,
      storedOffsetSeconds,
      timePolicy,
      effectiveOffsetMinutes,
      Date.now(),
    );
    const adjusted = decision.punchInstant;
    const ts = adjusted.toISOString();

    let resolution = null;
    if (resolvedSn) {
      try {
        resolution = await resolveIdentity({
          schoolId: session.schoolId,
          deviceSn: resolvedSn,
          deviceUserId: pin,
        });
      } catch { resolution = null; }
    }

    // derive draisName from resolved role if possible
    let draisName: string | null = null;
    if (resolution?.resolved) {
      try {
        if (resolution.roleType === 'student' && resolution.studentId) {
          const r = await query('SELECT full_name FROM students WHERE id = ? AND school_id = ? LIMIT 1', [resolution.studentId, session.schoolId]);
          draisName = r?.[0]?.full_name ?? null;
        } else if (resolution.roleType === 'staff' && resolution.staffId) {
          const r = await query('SELECT full_name FROM staff WHERE id = ? AND school_id = ? LIMIT 1', [resolution.staffId, session.schoolId]);
          draisName = r?.[0]?.full_name ?? null;
        }
      } catch { draisName = null; }
    }

    out.push({
      deviceUserId: pin,
      deviceName: userNameMap[pin] || null,
      draisName,
      personId: resolution?.personId ?? null,
      roleType: resolution?.roleType ?? null,
      roleRefId: (resolution?.studentId ?? resolution?.staffId) ?? null,
      enrollmentId: resolution?.enrollmentId ?? null,
      resolutionPath: resolution?.path ?? null,
      matched: resolution?.resolved ?? false,
      recordTime: ts,
      record_date: formatDate(adjusted),
      record_time: formatTime(adjusted),
      verification: rec.verification || null,
      status: rec.status || null,
    });
  }

  return out;
}

async function disconnectDevice(ip: string) {
  const entry = pool.get(ip);
  if (entry) {
    try { await entry.zk.disconnect(); } catch {}
    pool.delete(ip);
  }
}

// ─── Resolve device IP from SN ───────────────────────────────────────────────

async function resolveDeviceIP(sn: string, schoolId: number): Promise<string | null> {
  const rows = await query(
    'SELECT ip_address FROM devices WHERE sn = ? AND school_id = ? LIMIT 1',
    [sn, schoolId],
  );
  return rows?.[0]?.ip_address || null;
}

// ─── Validate raw IP address (IPv4 private/LAN only) ─────────────────────────

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTime(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatDateTime(date: Date) {
  return `${formatDate(date)} ${formatTime(date)}`;
}

function isValidLanIP(ip: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4);
  if (!match) return false;
  const octets = [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10), parseInt(match[4], 10)];
  if (octets.some(o => o > 255)) return false;
  // Block loopback and link-local
  if (octets[0] === 127) return false;
  if (octets[0] === 169 && octets[1] === 254) return false;
  if (octets[0] === 0) return false;
  return true;
}

// ─── API Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/attendance/zk-tcp?device_sn=xxx&action=info|users|status
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const deviceSn = url.searchParams.get('device_sn');
  const directIp = url.searchParams.get('device_ip');
  const devicePort = parseInt(url.searchParams.get('device_port', 10) || '4370', 10);
  const action = url.searchParams.get('action') || 'info';

  // Resolve IP: prefer direct IP, fallback to SN lookup
  let ip: string | null = null;
  if (directIp) {
    if (!isValidLanIP(directIp)) {
      return NextResponse.json({ error: 'Invalid IP address' }, { status: 400 });
    }
    ip = directIp;
  } else if (deviceSn) {
    ip = await resolveDeviceIP(deviceSn, session.schoolId);
  }

  if (!ip) {
    return NextResponse.json({ error: 'Provide device_ip or a valid device_sn' }, { status: 400 });
  }

  try {
    const zk = await getConnection(ip, devicePort);

    switch (action) {
      case 'info': {
        const info = await zk.getInfo();
        let firmware = '', serialNumber = '', platform = '', deviceName = '';
        try { firmware = await zk.getFirmware(); } catch {}
        try { serialNumber = await zk.getSerialNumber(); } catch {}
        try { platform = await zk.getPlatform(); } catch {}
        try { deviceName = await zk.getDeviceName(); } catch {}

        return NextResponse.json({
          success: true,
          connectionType: 'TCP',
          ip,
          data: {
            ...info,
            firmware,
            serialNumber,
            platform,
            deviceName,
          },
        });
      }

      case 'users': {
        const result = await zk.getUsers();
        return NextResponse.json({
          success: true,
          connectionType: 'TCP',
          data: result.data || [],
          error: result.err ? String(result.err) : null,
        });
      }

      case 'status': {
        // Quick connectivity check — just getInfo
        const info = await zk.getInfo();
        return NextResponse.json({
          success: true,
          connectionType: 'TCP',
          reachable: true,
          ip,
          data: info,
        });
      }

      case 'attendance': {
        const result = await zk.getAttendances();
        const rawArr: any[] = (result.data || []);

        // Build a best-effort map of device PIN -> name from the device
        const userNameMap: Record<string, string> = {};
        try {
          const usersResult = await zk.getUsers();
          for (const u of (usersResult?.data || [])) {
            const pin = String(u.userId ?? '');
            if (pin && u.name) userNameMap[pin] = String(u.name).trim();
          }
        } catch { /* best-effort enrichment */ }

        // Resolve device SN for identity lookups when caller used direct IP
        const resolvedSn: string = (deviceSn as string | undefined)
          || (await query('SELECT sn FROM devices WHERE lan_ip = ? AND school_id = ? LIMIT 1', [ip, session.schoolId]))?.[0]?.sn
          || '';

        // Limit to the last 100 records for UI display and to bound DB calls
        const limited = rawArr.slice(-100);
        const enriched = await Promise.all(limited.map(async (rec: any) => {
          const pin = String(rec.deviceUserId ?? '');
          const ts = rec.recordTime instanceof Date ? rec.recordTime.toISOString() : new Date(rec.recordTime).toISOString();

          let resolution = null;
          if (resolvedSn) {
            try {
              resolution = await resolveIdentity({
                schoolId: session.schoolId,
                deviceSn: resolvedSn,
                deviceUserId: pin,
              });
            } catch { resolution = null; }
          }

          return {
            deviceUserId: pin,
            recordTime: ts,
            verification: rec.verification || null,
            status: rec.status || null,
            displayName: userNameMap[pin] || null,
            matched: resolution?.resolved ?? false,
            personId: resolution?.personId ?? null,
            roleType: resolution?.roleType ?? null,
            roleRefId: (resolution?.studentId ?? resolution?.staffId) ?? null,
            enrollmentId: resolution?.enrollmentId ?? null,
            resolutionPath: resolution?.path ?? null,
          };
        }));

        return NextResponse.json({
          success: true,
          connectionType: 'TCP',
          data: enriched,
          total: rawArr.length,
          error: result.err ? String(result.err) : null,
        });
      }

      case 'map_attendance': {
        const clockOffsetMinutes = parseInt(url.searchParams.get('clock_offset_minutes') || '0', 10) || 0;
        const attResult = await zk.getAttendances();
        const rawArr: any[] = (attResult.data || []);
        const joined = await buildJoinedAttendance(rawArr, zk, ip, session, deviceSn, 500, clockOffsetMinutes);
        return NextResponse.json({ success: true, data: joined, total: rawArr.length });
      }

      case 'attendance_csv': {
        const clockOffsetMinutes = parseInt(url.searchParams.get('clock_offset_minutes') || '0', 10) || 0;
        const attResult = await zk.getAttendances();
        const rawArr: any[] = (attResult.data || []);
        const joined = await buildJoinedAttendance(rawArr, zk, ip, session, deviceSn, 500, clockOffsetMinutes);

        const rows: string[] = [];
        rows.push('date,time,staff,device_user_id,device_name,drais_name,person_id,role_type,verification,status');

        const esc = (v: any) => {
          if (v === null || v === undefined) return '';
          const s = String(v).replace(/"/g, '""');
          return `"${s}"`;
        };

        for (const r of joined) {
          rows.push([
            r.record_date,
            r.record_time,
            'staff',
            r.deviceUserId,
            r.deviceName || '',
            r.draisName || '',
            r.personId || '',
            r.roleType || '',
            r.verification || '',
            r.status || '',
          ].map(esc).join(','));
        }

        const csv = rows.join('\n');
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="attendance_${Date.now()}.csv"`,
          },
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
      ip,
      hint: 'Ensure device is on same LAN and port 4370 is accessible',
    }, { status: 502 });
  }
}

/**
 * POST /api/attendance/zk-tcp
 *
 * Body: {
 *   device_sn: string,
 *   action: 'enroll' | 'cancel_enroll' | 'restart' | 'unlock' | 'disable' | 'enable' | 'disconnect' | 'write_lcd' | 'exec',
 *   // For enroll:
 *   uid?: number,     // user index (internal UID on device)
 *   finger?: number,  // finger index 0-9
 *   // For write_lcd:
 *   text?: string,
 *   // For exec (raw command):
 *   command?: number,
 *   data?: string,
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { device_sn, device_ip: directIpPost, device_port: directPortPost, action } = body;
  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  // Resolve IP: prefer direct IP, fallback to SN lookup
  let ip: string | null = null;
  const port = parseInt(directPortPost || '4370', 10);
  if (directIpPost) {
    if (!isValidLanIP(directIpPost)) {
      return NextResponse.json({ error: 'Invalid IP address' }, { status: 400 });
    }
    ip = directIpPost;
  } else if (device_sn) {
    ip = await resolveDeviceIP(device_sn, session.schoolId);
  }

  if (!ip) {
    return NextResponse.json({ error: 'Provide device_ip or a valid device_sn' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'disconnect': {
        await disconnectDevice(ip);
        return NextResponse.json({ success: true, message: 'Disconnected' });
      }

      case 'restart': {
        const zk = await getConnection(ip, port);
        await zk.executeCmd(COMMANDS.CMD_RESTART, '');
        pool.delete(ip); // Connection will be dead after restart
        return NextResponse.json({ success: true, message: 'Device restarting' });
      }

      case 'unlock': {
        const zk = await getConnection(ip, port);
        await zk.executeCmd(COMMANDS.CMD_UNLOCK, '');
        return NextResponse.json({ success: true, message: 'Door unlocked' });
      }

      case 'disable': {
        const zk = await getConnection(ip, port);
        await zk.disableDevice();
        return NextResponse.json({ success: true, message: 'Device disabled (FP/RFID/keyboard off)' });
      }

      case 'enable': {
        const zk = await getConnection(ip, port);
        await zk.enableDevice();
        return NextResponse.json({ success: true, message: 'Device enabled (normal work)' });
      }

      case 'write_lcd': {
        const text = body.text || '';
        if (!text) {
          return NextResponse.json({ error: 'text is required' }, { status: 400 });
        }
        const zk = await getConnection(ip, port);
        const buf = Buffer.from(text + '\0');
        await zk.executeCmd(COMMANDS.CMD_WRITE_LCD, buf);
        return NextResponse.json({ success: true, message: `LCD: "${text}"` });
      }

      case 'clear_lcd': {
        const zk = await getConnection(ip, port);
        await zk.executeCmd(COMMANDS.CMD_CLEAR_LCD, '');
        return NextResponse.json({ success: true, message: 'LCD cleared' });
      }

      case 'enroll': {
        // CMD_STARTENROLL requires: uid (2 bytes LE) + finger index (1 byte)
        const uid = parseInt(body.uid, 10);
        const finger = parseInt(body.finger ?? '0', 10);

        if (isNaN(uid) || uid < 1) {
          return NextResponse.json({ error: 'uid (device user index) is required and must be > 0' }, { status: 400 });
        }
        if (finger < 0 || finger > 9) {
          return NextResponse.json({ error: 'finger must be 0-9' }, { status: 400 });
        }

        const zk = await getConnection(ip, port);

        // Step 1: Cancel any ongoing capture
        try {
          await zk.executeCmd(COMMANDS.CMD_CANCELCAPTURE, '');
        } catch {}

        // Step 2: Send CMD_STARTENROLL with uid + finger
        // According to ZK protocol: data = uid (2 bytes LE) + finger_index (1 byte)
        const enrollData = Buffer.alloc(3);
        enrollData.writeUInt16LE(uid, 0);
        enrollData.writeUInt8(finger, 2);

        const result = await zk.executeCmd(COMMANDS.CMD_STARTENROLL, enrollData);

        // Check response command ID
        const replyCmd = result?.readUInt16LE?.(0);

        return NextResponse.json({
          success: true,
          message: `Enrollment started for UID=${uid}, finger=${finger}. Place finger on sensor.`,
          reply: replyCmd,
          replyHex: replyCmd !== undefined ? `0x${replyCmd.toString(16)}` : null,
        });
      }

      case 'cancel_enroll': {
        const zk = await getConnection(ip, port);
        await zk.executeCmd(COMMANDS.CMD_CANCELCAPTURE, '');
        return NextResponse.json({ success: true, message: 'Enrollment cancelled' });
      }

      case 'read_template': {
        // CMD_USERTEMP_RRQ(9): Read a specific fingerprint template from device
        // Payload: uid (2 bytes LE) + finger (1 byte)
        const uid = parseInt(body.uid, 10);
        const finger = parseInt(body.finger ?? '0', 10);

        if (isNaN(uid) || uid < 1) {
          return NextResponse.json({ error: 'uid is required' }, { status: 400 });
        }

        const zk = await getConnection(ip, port);
        const reqBuf = Buffer.alloc(3);
        reqBuf.writeUInt16LE(uid, 0);
        reqBuf.writeUInt8(finger, 2);

        const result = await zk.executeCmd(COMMANDS.CMD_USERTEMP_RRQ, reqBuf);
        const templateData = result ? result.toString('base64') : null;

        return NextResponse.json({
          success: true,
          uid,
          finger,
          templateSize: result?.length || 0,
          templateData,
        });
      }

      case 'capture_finger': {
        // CMD_CAPTUREFINGER(1009): One-shot capture (device shows "Place finger")
        const zk = await getConnection(ip, port);
        const result = await zk.executeCmd(COMMANDS.CMD_CAPTUREFINGER, '');
        const replyCmd = result?.readUInt16LE?.(0);

        return NextResponse.json({
          success: true,
          message: 'Capture mode active — place finger on sensor',
          reply: replyCmd,
        });
      }

      case 'save_template': {
        // After enrollment, read the template from device and save to DRAIS DB
        const uid = parseInt(body.uid, 10);
        const finger = parseInt(body.finger ?? '0', 10);
        const pin = body.pin || String(uid); // device PIN for mapping lookup

        if (isNaN(uid) || uid < 1) {
          return NextResponse.json({ error: 'uid is required' }, { status: 400 });
        }

        const zk = await getConnection(ip, port);

        // Read the template from device
        const reqBuf = Buffer.alloc(3);
        reqBuf.writeUInt16LE(uid, 0);
        reqBuf.writeUInt8(finger, 2);

        const result = await zk.executeCmd(COMMANDS.CMD_USERTEMP_RRQ, reqBuf);
        if (!result || result.length < 10) {
          return NextResponse.json({
            success: false,
            error: 'No template found on device for this UID/finger',
          }, { status: 404 });
        }

        const templateBase64 = result.toString('base64');

        // Look up student mapping
        const mapping = await query(
          `SELECT student_id FROM zk_user_mapping
           WHERE device_user_id = ? AND (device_sn = ? OR device_sn IS NULL)
           LIMIT 1`,
          [pin, device_sn],
        );

        const studentId = mapping?.[0]?.student_id || null;
        const fingerNames = ['thumb', 'index', 'middle', 'ring', 'pinky'];
        const fingerPosition = fingerNames[finger % 5] || 'unknown';
        const hand = finger < 5 ? 'right' : 'left';

        if (studentId) {
          const deviceRow = await query('SELECT id FROM devices WHERE sn = ? LIMIT 1', [device_sn]);
          const deviceId = deviceRow?.[0]?.id || null;

          await query(
            `INSERT INTO student_fingerprints
               (school_id, student_id, device_id, finger_position, hand, template_data,
                template_format, quality_score, enrollment_timestamp, is_active, status)
             VALUES (?, ?, ?, ?, ?, ?, 'ZK_TCP', ?, CURRENT_TIMESTAMP, 1, 'active')
             ON DUPLICATE KEY UPDATE
               template_data = VALUES(template_data),
               quality_score = VALUES(quality_score),
               enrollment_timestamp = CURRENT_TIMESTAMP,
               is_active = 1,
               status = 'active'`,
            [session.schoolId, studentId, deviceId, fingerPosition, hand, templateBase64, result.length],
          );

          return NextResponse.json({
            success: true,
            message: `Template saved for student ${studentId} (${hand} ${fingerPosition})`,
            studentId,
            finger,
            fingerPosition,
            hand,
            templateSize: result.length,
          });
        }

        return NextResponse.json({
          success: true,
          message: `Template read but no student mapping found for PIN=${pin}`,
          templateSize: result.length,
          pin,
          finger,
        });
      }

      case 'exec': {
        // Raw command execution — admin only
        const command = parseInt(body.command, 10);
        if (isNaN(command)) {
          return NextResponse.json({ error: 'command (numeric) is required' }, { status: 400 });
        }
        const data = body.data ? Buffer.from(body.data, 'hex') : '';
        const zk = await getConnection(ip, port);
        const result = await zk.executeCmd(command, data);

        return NextResponse.json({
          success: true,
          command,
          resultLength: result?.length,
          resultHex: result ? result.toString('hex').substring(0, 200) : null,
        });
      }

      // ── Phase 2: staging-only pull for one date ──────────────────────────
      // Pulls the device log, filters to the requested calendar DATE using
      // the verbatim device wall clock (day-boundary-safe — no UTC math),
      // stages the records, probes the device clock, and runs automatic
      // validation. ZERO writes to attendance_raw_events — persistence is
      // an explicit operator decision (Phase 4 committer).
      case 'stage_pull': {
        const dateStr: string | null = body.date || null; // YYYY-MM-DD
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return NextResponse.json({ error: 'date (YYYY-MM-DD) is required' }, { status: 400 });
        }

        const zk = await getConnection(ip, port);
        const stageStartMs = Date.now();
        const attResult = await zk.getAttendances();
        const allRecords: any[] = attResult?.data || [];
        let deviceInfo: any = {};
        try { deviceInfo = await zk.getInfo(); } catch {}
        const deviceWallNow = await probeDeviceWallTime(zk);

        // Device name map for the inspection screen.
        const userNameMap: Record<string, string> = {};
        try {
          const usersResult = await zk.getUsers();
          for (const u of (usersResult?.data || [])) {
            const pin = String(u.userId ?? '');
            if (pin && u.name) userNameMap[pin] = String(u.name).trim();
          }
        } catch { /* best-effort */ }

        const resolvedSn: string = (device_sn as string | undefined)
          || (await query('SELECT sn FROM devices WHERE lan_ip = ? AND school_id = ? LIMIT 1', [ip, session.schoolId]))?.[0]?.sn
          || '';

        const acquisitionId = await beginAcquisition({
          schoolId: session.schoolId,
          method: 'tcp_pull',
          deviceSn: resolvedSn || null,
          deviceIp: ip,
          requestedBy: session.userId ?? null,
          windowFrom: dateStr,
          windowTo: dateStr,
        });

        try {
          // Filter by the DEVICE's calendar date — verbatim wall, no UTC.
          const punches = allRecords
            .map((r: any) => ({
              seq: typeof r.userSn === 'number' ? r.userSn : null,
              deviceUserId: String(r.deviceUserId ?? ''),
              wallTime: wallFromZkRecordTime(r.recordTime)!,
              verifyType: r.verification ?? null,
              statusCode: r.status ?? null,
              displayName: userNameMap[String(r.deviceUserId ?? '')] || null,
            }))
            .filter((p: any) => p.wallTime && p.deviceUserId && wallDate(p.wallTime) === dateStr);

          const { staged, invalid } = await stageRecords(acquisitionId, punches);

          const deviceTz = await getDeviceTimeContext(resolvedSn || '');
          const timePolicy = await resolveTimePolicy(session.schoolId);
          const tzOffsetMinutes = deviceTz.tzOffsetMinutes ?? timePolicy.offsetMinutes;

          const validation = await validateAcquisition({
            schoolId: session.schoolId,
            acquisitionId,
            deviceSn: resolvedSn || null,
            tzOffsetMinutes,
            deviceWallNow,
          });

          await finishAcquisition(acquisitionId, {
            status: 'validated',
            deviceLogCount: deviceInfo?.logCounts ?? null,
            recordsReceived: punches.length,
            recordsStaged: staged,
            recordsFailed: invalid,
            durationMs: Date.now() - stageStartMs,
          });

          return NextResponse.json({
            success: true,
            acquisitionId,
            date: dateStr,
            deviceSn: resolvedSn || null,
            totalOnDevice: allRecords.length,
            staged,
            invalid,
            validation,
          });
        } catch (err: any) {
          await finishAcquisition(acquisitionId, {
            status: 'failed',
            errorMessage: String(err?.message || err).slice(0, 1000),
            durationMs: Date.now() - stageStartMs,
          }).catch(() => undefined);
          throw err;
        }
      }

      // ── Pull Attendance Logs ─────────────────────────────────────────────
      // Connects directly to the device over LAN TCP, downloads the full
      // attendance log buffer, optionally filters by date, resolves each
      // record's identity against biometric_enrollments / zk_user_mapping,
      // and inserts into attendance_raw_events (INSERT IGNORE — idempotent).
      // Unmapped PINs are stored with matched=false so they surface in the
      // Unmatched tab and can be reconciled by the administrator later.
      case 'pull_attendance': {
        const mode: 'today' | 'full' | 'range' = body.mode || 'today';
        const dateFrom: string | null = body.date_from || null;   // YYYY-MM-DD
        const dateTo: string | null   = body.date_to   || null;   // YYYY-MM-DD
        const clockOffsetMinutes      = parseInt(body.clock_offset_minutes ?? '0', 10) || 0;

        // Determine date filter boundaries (device timestamps are local time,
        // so we compare against the ISO date prefix rather than a UTC boundary).
        const filterFrom = mode === 'today'
          ? schoolLocalToday()
          : mode === 'range' ? (dateFrom ?? null) : null;
        const filterTo = mode === 'today'
          ? schoolLocalToday()
          : mode === 'range' ? (dateTo ?? null)   : null;

        const zk = await getConnection(ip, port);
        const pullStartedMs = Date.now();
        const attResult = await zk.getAttendances();
        const allRecords: any[] = attResult?.data || [];

        // Get device info for the forensic report
        let deviceInfo: any = {};
        try { deviceInfo = await zk.getInfo(); } catch {}

        // Phase 1 (acquisition backbone): every pull produces an audit batch
        // row + verbatim staged records. Best-effort — the pull itself must
        // never fail because audit logging did.
        let acquisitionId: number | null = null;
        try {
          acquisitionId = await beginAcquisition({
            schoolId: session.schoolId,
            method: 'tcp_pull',
            deviceSn: device_sn ?? null,
            deviceIp: ip,
            requestedBy: session.userId ?? null,
            windowFrom: filterFrom,
            windowTo: filterTo,
          });
        } catch (e) {
          console.warn('[zk-tcp] acquisition audit unavailable:', e instanceof Error ? e.message : e);
        }

        // Filter to the requested date window (device time, no UTC conversion —
        // node-zklib returns Date objects whose numeric value is local-time-as-UTC)
        const toLocalDateStr = (rt: any): string => {
          const iso = rt instanceof Date ? rt.toISOString() : new Date(rt).toISOString();
          // Apply caller-supplied clock offset if device time is known to drift
          if (clockOffsetMinutes) {
            return new Date(new Date(iso).getTime() + clockOffsetMinutes * 60000)
              .toISOString().slice(0, 10);
          }
          return iso.slice(0, 10);
        };

        const filtered = allRecords.filter(r => {
          if (!filterFrom && !filterTo) return true; // mode=full → keep all
          const d = toLocalDateStr(r.recordTime);
          if (filterFrom && d < filterFrom) return false;
          if (filterTo   && d > filterTo)   return false;
          return true;
        });

        // Pull user list to enrich display_name
        let userNameMap: Record<string, string> = {};
        try {
          const usersResult = await zk.getUsers();
          for (const u of (usersResult?.data || [])) {
            const pin = String(u.userId ?? '');
            if (pin && u.name) userNameMap[pin] = String(u.name).trim();
          }
        } catch { /* name enrichment is best-effort */ }

        // Resolve each record and insert
        let inserted = 0, duplicates = 0, failed = 0, unmatched = 0;
        const failures: Array<{ pin: string; ts: string; reason: string }> = [];

        // Resolve device SN from DB if we got here via lan_ip
        const resolvedSn: string = (device_sn as string | undefined)
          || (await query('SELECT sn FROM devices WHERE lan_ip = ? AND school_id = ? LIMIT 1', [ip, session.schoolId]))?.[0]?.sn
          || '';

        const timePolicy = await resolveTimePolicy(session.schoolId);
        const deviceCtx = await getDeviceTimeContext(resolvedSn || device_sn || '');
        const effectiveOffsetMinutesForBatch = clockOffsetMinutes || (deviceCtx.tzOffsetMinutes ?? timePolicy.offsetMinutes);
        // Prefer THIS pull's own measured drift over a possibly stale
        // persisted scalar — see measureBatchOffsetSeconds doc for why.
        const batchOffsetSeconds = measureBatchOffsetSeconds(
          filtered.map((rec: any) => {
            const rawDate = rec.recordTime instanceof Date ? rec.recordTime : new Date(rec.recordTime);
            return normalizeDeviceDateTime(rawDate instanceof Date ? formatDateTime(rawDate) : String(rec.recordTime)) || formatDateTime(rawDate);
          }),
          effectiveOffsetMinutesForBatch,
        );
        const storedOffsetSeconds = batchOffsetSeconds ?? deviceCtx.clockOffsetSeconds;
        if (batchOffsetSeconds != null && (resolvedSn || device_sn)) {
          persistDeviceClockOffset(resolvedSn || device_sn, batchOffsetSeconds).catch(() => {});
        }

        for (const rec of filtered) {
          const pin  = String(rec.deviceUserId ?? '');
          const rawDate = rec.recordTime instanceof Date ? rec.recordTime : new Date(rec.recordTime);
          const rawTs = rawDate.toISOString();

          if (!pin || !rawTs) {
            failed++;
            failures.push({ pin, ts: rawTs, reason: 'missing pin or timestamp' });
            continue;
          }

          const normalizedCheckTime = normalizeDeviceDateTime(rawDate instanceof Date ? formatDateTime(rawDate) : String(rec.recordTime)) || formatDateTime(rawDate);
          const effectiveOffsetMinutes = clockOffsetMinutes || (deviceCtx.tzOffsetMinutes ?? timePolicy.offsetMinutes);
          const decision = decidePunchTime(
            normalizedCheckTime,
            storedOffsetSeconds,
            timePolicy,
            effectiveOffsetMinutes,
            Date.now(),
          );
          const punchAt = decision.punchInstant;
          const displayName = userNameMap[pin] || null;

          // Identity resolution — never blocks insertion
          let resolution: Awaited<ReturnType<typeof resolveIdentity>> | null = null;
          if (resolvedSn) {
            try {
              resolution = await resolveIdentity({
                schoolId: session.schoolId,
                deviceSn: resolvedSn,
                deviceUserId: pin,
              });
            } catch { /* non-fatal */ }
          }

          const matched    = resolution?.resolved ?? false;
          const personId   = resolution?.personId ?? null;
          const roleType   = resolution?.roleType ?? null;
          const roleRefId  = (resolution?.studentId ?? resolution?.staffId) ?? null;
          const enrollId   = resolution?.enrollmentId ?? null;
          const resPath    = resolution?.path ?? null;

          if (!matched) unmatched++;

          try {
            const rawEventId = await recordRawEvent({
              schoolId:     session.schoolId,
              deviceSn:     resolvedSn || 'unknown',
              deviceUserId: parseInt(pin, 10),
              displayName,
              punchAt,
              deviceReportedTime: decision.deviceReportedTime,
              clockSkewSeconds: decision.skewSeconds,
              timeSource: decision.timeSource,
              timeConfidence: decision.timeConfidence,
              source: 'manual',
              matched,
              enrollmentId: enrollId,
              personId,
              roleType,
              roleRefId,
              resolutionPath: resPath,
              resolutionScore: resolution?.resolved ? 1.0 : null,
              legacyTable: 'zk_tcp_pull',
              legacyId: rec.userSn ?? null,
            });

            if (rawEventId) inserted++;
            else            duplicates++;
          } catch (err: any) {
            failed++;
            failures.push({ pin, ts: rawTs, reason: err.message });
          }
        }

        // Phase 1 — stage the verbatim raw punches + close the audit batch.
        if (acquisitionId != null) {
          try {
            const rawPunches = filtered.map((r: any) => ({
              seq: typeof r.userSn === 'number' ? r.userSn : null,
              deviceUserId: String(r.deviceUserId ?? ''),
              wallTime: wallFromZkRecordTime(r.recordTime)!,
              verifyType: r.verification ?? null,
              statusCode: r.status ?? null,
              displayName: userNameMap[String(r.deviceUserId ?? '')] || null,
            })).filter((p: any) => p.wallTime && p.deviceUserId);
            const { staged, invalid } = await stageRecords(acquisitionId, rawPunches);
            await finishAcquisition(acquisitionId, {
              status: failed === filtered.length && filtered.length > 0 ? 'failed' : 'committed',
              deviceLogCount: deviceInfo?.logCounts ?? null,
              recordsReceived: filtered.length,
              recordsStaged: staged,
              recordsCommitted: inserted,
              recordsDuplicate: duplicates,
              recordsUnmatched: unmatched,
              recordsFailed: failed + invalid,
              durationMs: Date.now() - pullStartedMs,
              warnings: invalid ? [`${invalid} record(s) had unparseable wall time`] : null,
            });
          } catch (e) {
            console.warn('[zk-tcp] acquisition audit close failed:', e instanceof Error ? e.message : e);
          }
        }

        return NextResponse.json({
          success: true,
          mode,
          filterFrom,
          filterTo,
          deviceIp: ip,
          deviceSn: resolvedSn || null,
          deviceLogCounts: deviceInfo?.logCounts ?? null,
          deviceUserCounts: deviceInfo?.userCounts ?? null,
          totalOnDevice: allRecords.length,
          filteredCount: filtered.length,
          inserted,
          duplicates,
          unmatched,
          failed,
          failures: failures.slice(0, 20), // cap at 20 for response size
          acquisitionId, // Phase 1 — audit batch reference (null if audit unavailable)
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    // If connection died, clear from pool
    pool.delete(ip);
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
      ip,
      hint: 'Ensure device is on same LAN and port 4370 is accessible',
    }, { status: 502 });
  }
}
