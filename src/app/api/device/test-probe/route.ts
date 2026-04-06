/**
 * POST /api/device/test-probe
 * ─────────────────────────────────────────────────────────────────────────────
 * DIAGNOSTIC endpoint — NOT for production enrollment.
 *
 * Purpose: test the two ZK protocol assumptions before wiring them into the
 * main enrollment flow:
 *
 *   Test A — "uid write + enroll":
 *     Write CMD_USER_WRQ at uid=10 with name="mubeezi ashraf", then fire
 *     CMD_STARTENROLL for uid=10.  Physical proof: K40 screen must show
 *     "mubeezi ashraf" while asking for finger.
 *
 *   Test B — "name update only":
 *     Only write CMD_USER_WRQ at a given uid (no enrollment command).
 *     Read back all users and confirm the name was stored correctly.
 *     Tests whether we can update an existing slot.
 *
 * Body (all optional, defaults shown):
 *   {
 *     device_ip?:  "192.168.1.197"    -- K40 on the LAN
 *     device_port?: 4370
 *     uid?:        10                 -- device slot to test
 *     name?:       "mubeezi ashraf"   -- name to write
 *     finger?:     0                  -- finger slot for enroll (Test A only)
 *     test?:       "enroll" | "name"  -- which test to run (default: "enroll")
 *   }
 *
 * Returns:
 *   {
 *     test, uid, name,
 *     steps: [ { label, ok, detail } ],
 *     device_user_after: { uid, name, userId } | null,
 *     enrolled: boolean
 *   }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');

function isValidLanIP(ip: string): boolean {
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const o = [+match[1], +match[2], +match[3], +match[4]];
  if (o.some(n => n > 255)) return false;
  if (o[0] === 127 || o[0] === 0) return false;
  if (o[0] === 169 && o[1] === 254) return false;
  return true;
}

function buildUserBuf(deviceUid: number, name: string, userId: string): Buffer {
  // ZK 72-byte user record:
  //   [0-1]  uid       UInt16 LE  — device-assigned slot number
  //   [2]    role      0x00 (regular user)
  //   [3-10] password  8 bytes, zero-padded
  //   [11-34] name     23 bytes ASCII + null terminator
  //   [35-38] cardno   UInt32 LE = 0
  //   [39-47] padding
  //   [48-55] userId   8 bytes ASCII (PIN — DRAIS student ID, NOT the device slot)
  //   [56-71] padding
  const buf = Buffer.alloc(72, 0);
  buf.writeUInt16LE(deviceUid, 0);
  Buffer.from(name.slice(0, 23), 'ascii').copy(buf, 11);
  Buffer.from(userId.slice(0, 8),  'ascii').copy(buf, 48);
  return buf;
}

export async function POST(req: NextRequest) {
  // Auth: accept either a valid browser session OR the RELAY_KEY header for CLI/terminal use
  const session = await getSessionSchoolId(req);
  const relayKey = req.headers.get('x-relay-key') || '';
  const validKey = process.env.RELAY_KEY || 'DRAIS-355DF9C35EB60899009C01DD948EAD14';
  if (!session && relayKey !== validKey) {
    return NextResponse.json({ error: 'Not authenticated. Pass a valid session cookie or X-Relay-Key header.' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const device_ip  = body.device_ip  || '192.168.1.197';
  const device_port = Number(body.device_port) || 4370;
  const uid        = Math.max(1, Math.min(65535, parseInt(String(body.uid ?? 10), 10) || 10));
  const rawName    = String(body.name || 'mubeezi ashraf');
  const name       = rawName.replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim();
  // userId (PIN) = explicit param OR default to String(uid)
  const userId     = String(body.user_id ?? body.userId ?? uid).replace(/[^\x20-\x7E]/g, '').slice(0, 8).trim();
  const finger     = Math.max(0, Math.min(9, parseInt(String(body.finger ?? 0), 10) || 0));
  const test       = ['name','dump','enroll','delete'].includes(body.test) ? body.test : 'enroll';

  if (!isValidLanIP(device_ip)) {
    return NextResponse.json({ error: 'device_ip must be a LAN IPv4 address' }, { status: 400 });
  }

  const steps: Array<{ label: string; ok: boolean; detail: string }> = [];

  // ── Connect ───────────────────────────────────────────────────────────────
  const zk = new ZKLib(device_ip, device_port, 8000, 5200);
  try {
    await zk.createSocket();
    steps.push({ label: `Connect ${device_ip}:${device_port}`, ok: true, detail: 'Socket created' });
  } catch (e: any) {
    return NextResponse.json({
      error: `Cannot reach device at ${device_ip}:${device_port} — ${e.message}`,
      hint: 'Is the K40 powered on and on the same LAN as the server?',
    }, { status: 502 });
  }

  let deviceUserAfter: { uid: number; name: string; userId: string } | null = null;
  let enrolled = false;

  try {
    // ── DUMP mode: just read all users and return them ─────────────────────
    if (test === 'dump') {
      const result = await zk.getUsers();
      const allUsers = (result?.data || []).map((u: any) => ({
        uid:    parseInt(String(u.uid), 10),
        name:   u.name   || '',
        userId: u.userId || '',
        role:   u.role   ?? 0,
      }));
      try { await zk.disconnect(); } catch {}
      return NextResponse.json({
        test: 'dump',
        total: allUsers.length,
        users: allUsers.sort((a: any, b: any) => a.uid - b.uid),
        note: 'Empty name = dash-ID / anonymous fingerprint.',
      });
    }

    // ── DELETE mode: remove a user slot by uid ────────────────────────────
    if (test === 'delete') {
      const delBuf = Buffer.alloc(2);
      delBuf.writeUInt16LE(uid, 0);
      try {
        await zk.zklibTcp.executeCmd(72 /* CMD_DELETEUSER */, delBuf);
        try { await zk.disconnect(); } catch {}
        return NextResponse.json({ test: 'delete', uid, ok: true, detail: `User uid=${uid} deleted` });
      } catch (e: any) {
        try { await zk.disconnect(); } catch {}
        return NextResponse.json({ test: 'delete', uid, ok: false, detail: e.message });
      }
    }

    // ── Read existing slot ─────────────────────────────────────────────────
    try {
      const existing = await zk.getUsers();
      const slot = (existing?.data || []).find((u: any) => parseInt(String(u.uid), 10) === uid);
      if (slot) {
        steps.push({ label: `Read UID ${uid} (before)`, ok: true, detail: `name="${slot.name || '(empty)'}" userId="${slot.userId || ''}"` });
      } else {
        steps.push({ label: `Read UID ${uid} (before)`, ok: true, detail: 'slot not found on device (new user)' });
      }
    } catch (e: any) {
      steps.push({ label: `Read UID ${uid} (before)`, ok: false, detail: e.message });
    }

    // ── Step 1: Write identity ─────────────────────────────────────────────
    try {
      await zk.zklibTcp.disableDevice();
      steps.push({ label: 'CMD_DISABLEDEVICE', ok: true, detail: '' });
    } catch (e: any) {
      steps.push({ label: 'CMD_DISABLEDEVICE', ok: false, detail: e.message });
    }

    try {
      const userBuf = buildUserBuf(uid, name, userId);
      await zk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, userBuf);
      steps.push({ label: `CMD_USER_WRQ uid=${uid} name="${name}" userId="${userId}"`, ok: true, detail: `72-byte record written` });
    } catch (e: any) {
      steps.push({ label: `CMD_USER_WRQ uid=${uid} name="${name}" userId="${userId}"`, ok: false, detail: e.message });
      // re-enable and abort
      try { await zk.zklibTcp.enableDevice(); } catch {}
      try { await zk.disconnect(); } catch {}
      return NextResponse.json({ test, uid, name, steps, device_user_after: null, enrolled: false });
    }

    // ── Re-enable BEFORE reading back (device won't respond to getUsers while disabled) ─
    try { await zk.zklibTcp.enableDevice(); } catch {}
    steps.push({ label: 'CMD_ENABLEDEVICE (before verify read)', ok: true, detail: '' });

    // ── Read back to confirm write persisted ───────────────────────────────
    try {
      const after = await zk.getUsers();
      const allUsers: any[] = after?.data || [];
      const slot = allUsers.find((u: any) => parseInt(String(u.uid), 10) === uid);
      if (slot) {
        deviceUserAfter = { uid: parseInt(String(slot.uid), 10), name: slot.name || '', userId: slot.userId || '' };
        const nameMatch = (slot.name || '').trim() === name;
        steps.push({
          label: `Read UID ${uid} (after write)`,
          ok: nameMatch,
          detail: `name="${slot.name || '(empty)'}" userId="${slot.userId || ''}" total_users=${allUsers.length} — ${nameMatch ? 'NAME CONFIRMED ✓' : `MISMATCH — device stored "${slot.name}"`}`,
        });
      } else {
        // UID not found — also report ALL uids to diagnose numbering mismatch
        const presentIds = allUsers.map((u: any) => u.uid).slice(0, 20);
        steps.push({
          label: `Read UID ${uid} (after write)`,
          ok: false,
          detail: `slot not found. Total users=${allUsers.length}. Present UIDs=[${presentIds.join(',')}${allUsers.length > 20 ? '…' : ''}]. CMD_USER_WRQ may use userId-based lookup, not uid slot.`,
        });
      }
    } catch (e: any) {
      steps.push({ label: `Read UID ${uid} (after write)`, ok: false, detail: e.message });
    }

    // ── Step 2: Trigger enrollment (only for test=enroll) ─────────────────
    if (test === 'enroll') {
      try {
        await zk.zklibTcp.disableDevice();
        const payload = Buffer.alloc(3);
        payload.writeUInt16LE(uid, 0);
        payload.writeUInt8(finger, 2);
        await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, payload);
        await zk.zklibTcp.enableDevice();
        enrolled = true;
        steps.push({ label: `CMD_STARTENROLL uid=${uid} finger=${finger}`, ok: true, detail: `K40 screen should now show "${name}" — place finger on sensor` });
      } catch (e: any) {
        steps.push({ label: `CMD_STARTENROLL uid=${uid} finger=${finger}`, ok: false, detail: e.message });
        try { await zk.zklibTcp.enableDevice(); } catch {}
      }
    }

  } finally {
    try { await zk.disconnect(); } catch {}
  }

  const allOk = steps.filter(s => s.label !== 'CMD_DISABLEDEVICE' && s.label !== 'CMD_ENABLEDEVICE').every(s => s.ok);

  return NextResponse.json({
    test,
    uid,
    name,
    finger: test === 'enroll' ? finger : undefined,
    steps,
    device_user_after: deviceUserAfter,
    enrolled,
    summary: allOk
      ? (test === 'enroll'
        ? `SUCCESS — identity written + scan prompt active. K40 shows "${name}".`
        : `SUCCESS — name "${name}" confirmed stored in device slot ${uid}.`)
      : 'PARTIAL — check steps for failures',
  });
}
