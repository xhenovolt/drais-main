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
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

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
        return NextResponse.json({
          success: true,
          connectionType: 'TCP',
          data: (result.data || []).slice(-100), // last 100
          total: (result.data || []).length,
          error: result.err ? String(result.err) : null,
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
