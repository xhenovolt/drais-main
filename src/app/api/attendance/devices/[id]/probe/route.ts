/**
 * POST /api/attendance/devices/[id]/probe
 *
 * Reads the REAL on-device user count straight from the device's own
 * counter via TCP (ZK getInfo().userCounts) and persists it to
 * devices.device_user_count. This is the source of truth for "how many
 * users are on the device" — the DB-derived figures (zk_user_mapping,
 * device_sync_state) drift badly (legacy/NULL-school rows, command-ack
 * proxies) and previously showed ~1230 for a device that really holds 45.
 *
 * getInfo() is reliable where getUsers() is flaky: it reads the device's
 * count registers rather than parsing the full user table.
 *
 * LAN-only: the server must be able to reach the device IP over TCP
 * (local / relay deployments). On a cloud host that cannot reach the
 * LAN device this returns 502 with a clear message; the stored count
 * from the last successful probe (or a fresh ADMS DATA QUERY USERINFO
 * sync) remains the displayed value.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';

export const runtime = 'nodejs';

const ZKLib = require('node-zklib');

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const sn = access.device!.sn;

  // IP resolution: devices.ip_address is the device's PUBLIC/WAN IP
  // (what ADMS records as the request source) — not reachable for a
  // direct TCP probe. The caller must supply the device's LAN IP
  // (same value used for local enrollment). We only fall back to the
  // stored IP when it is a private LAN address.
  const isPrivateLan = (s: string | null | undefined) =>
    !!s && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(s);

  // Optional body: { device_ip (LAN), port }
  let port = 4370;
  let bodyIp: string | null = null;
  try {
    const b = await req.json();
    if (b?.port) port = Math.max(1, Math.min(65535, Number(b.port)));
    if (typeof b?.device_ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(b.device_ip.trim())) bodyIp = b.device_ip.trim();
  } catch { /* no body */ }

  // Resolve LAN IP: body → persisted devices.lan_ip → private stored IP.
  let storedLan: string | null = null;
  try {
    const r = (await query(`SELECT lan_ip FROM devices WHERE sn = ? LIMIT 1`, [sn])) as Array<{ lan_ip: string | null }>;
    storedLan = r[0]?.lan_ip ?? null;
  } catch { /* column ensured by migration 012 */ }
  const ip = bodyIp || storedLan || (isPrivateLan(access.device!.ipAddress) ? access.device!.ipAddress : null);
  if (!ip) {
    return NextResponse.json({
      error: 'No LAN IP available to probe. The stored device IP is its public/WAN address (not reachable over TCP). Provide the device LAN IP (e.g. 192.168.1.x) — the same one used for local fingerprint enrollment.',
      need_lan_ip: true,
    }, { status: 422 });
  }
  // Persist a freshly-supplied LAN IP so future polls are automatic.
  if (bodyIp && bodyIp !== storedLan) {
    await query(`UPDATE devices SET lan_ip = ? WHERE sn = ?`, [bodyIp, sn]).catch(() => {});
  }

  // Hard timeout wrapper — node-zklib can hang indefinitely if the
  // device's single TCP slot is busy. We never let the request hang.
  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ]);

  const zk = new ZKLib(ip, port, 8000, 5200);
  let userCount: number | null = null;
  let logCount: number | null = null;
  let capacity: number | null = null;
  try {
    await withTimeout(zk.createSocket(), 9000, 'connect');
    // Mirror the proven local-enroll path: enable, then read. getInfo
    // reads the device's count registers (reliable); getUsers().length
    // is the fallback if the firmware doesn't answer getInfo.
    try { await withTimeout(zk.zklibTcp.enableDevice(), 5000, 'enable'); } catch { /* some firmware doesn't need it */ }
    try {
      const info: any = await withTimeout(zk.getInfo(), 8000, 'getInfo');
      userCount = Number(info?.userCounts);
      logCount = Number(info?.logCounts);
      capacity = Number(info?.logCapacity);
      if (!Number.isFinite(userCount)) userCount = null;
    } catch { /* fall back to getUsers */ }
    if (userCount === null) {
      const users: any = await withTimeout(zk.getUsers(), 12000, 'getUsers');
      const list = (users?.data || []) as unknown[];
      userCount = list.length;
    }
  } catch (e: any) {
    try { await zk.disconnect(); } catch {}
    return NextResponse.json({
      error: `Could not read the device over TCP at ${ip}:${port} — ${e.message}. The server must be on the same LAN as the device; if the device is busy, retry in a moment.`,
    }, { status: 502 });
  }
  try { await zk.disconnect(); } catch {}

  if (userCount === null) {
    return NextResponse.json({ error: 'Device did not report a user count' }, { status: 502 });
  }

  // Persist the real count + refresh liveness.
  await query(
    `UPDATE devices
        SET device_user_count = ?, device_user_count_at = NOW(),
            device_user_count_source = 'tcp_probe',
            ip_address = COALESCE(ip_address, ?), last_seen = NOW(), is_online = 1,
            updated_at = CURRENT_TIMESTAMP
      WHERE sn = ?`,
    [userCount, ip, sn],
  );

  // Keep device_sync_state's "last known device user count" honest too.
  try {
    await query(
      `INSERT INTO device_sync_state (id, device_sn, school_id, last_known_device_user_count, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_known_device_user_count = VALUES(last_known_device_user_count), updated_at = NOW()`,
      [sn, sn, access.schoolId, userCount],
    );
  } catch { /* sync_state optional */ }

  return NextResponse.json({
    success: true,
    device_sn: sn,
    device_user_count: userCount,
    log_count: logCount,
    log_capacity: capacity,
    probed_at: new Date().toISOString(),
    message: `Device reports ${userCount} enrolled user${userCount === 1 ? '' : 's'}.`,
  });
}
