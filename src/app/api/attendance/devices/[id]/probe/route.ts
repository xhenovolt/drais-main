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
  const ip = access.device!.ipAddress;
  if (!ip) {
    return NextResponse.json({
      error: 'Device has no IP on record — cannot probe over TCP. Wait for a heartbeat to register the IP, or run an ADMS user sync instead.',
    }, { status: 422 });
  }

  // Optional body: { port }
  let port = 4370;
  try { const b = await req.json(); if (b?.port) port = Math.max(1, Math.min(65535, Number(b.port))); } catch { /* no body */ }

  const zk = new ZKLib(ip, port, 8000, 5200);
  try {
    await zk.createSocket();
  } catch (e: any) {
    return NextResponse.json({
      error: `Cannot reach device at ${ip}:${port} over TCP — ${e.message}. The server must be on the same LAN as the device to probe it directly.`,
    }, { status: 502 });
  }

  let userCount: number | null = null;
  let logCount: number | null = null;
  let capacity: number | null = null;
  try {
    const info = await zk.getInfo();
    userCount = Number(info?.userCounts);
    logCount = Number(info?.logCounts);
    capacity = Number(info?.logCapacity);
    if (!Number.isFinite(userCount)) userCount = null;
  } catch (e: any) {
    try { await zk.disconnect(); } catch {}
    return NextResponse.json({ error: `Device reachable but getInfo failed: ${e.message}` }, { status: 502 });
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
