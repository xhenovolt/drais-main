import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * POST /api/sync/trigger-adms
 * Inserts DATA QUERY commands into zk_device_commands so that the ADMS push
 * endpoint (on the device) will reply with its full user + template data.
 * The device will push responses back to /api/attendance/zk/postdata (ADMS).
 *
 * Body: { device_sn?: string }
 * If device_sn is omitted, queues for all active devices of the school.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const requestedSn = (body.device_sn as string) || null;

  // Resolve target devices
  const deviceRows = await query<{ sn: string; device_name: string }[]>(
    `SELECT sn, device_name FROM devices
     WHERE school_id = ? AND status = 'active'
     ${requestedSn ? 'AND sn = ?' : ''}
     ORDER BY last_seen DESC`,
    requestedSn ? [session.schoolId, requestedSn] : [session.schoolId],
  );

  if (deviceRows.length === 0) {
    return NextResponse.json(
      { error: requestedSn ? `Device ${requestedSn} not found or inactive.` : 'No active devices found for this school.' },
      { status: 404 },
    );
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10-minute expiry
  const commandsQueued: { device_sn: string; commands: string[] }[] = [];

  for (const device of deviceRows) {
    const cmds = ['DATA QUERY user', 'DATA QUERY templatev10'];
    for (const cmd of cmds) {
      await query(
        `INSERT INTO zk_device_commands
           (school_id, device_sn, command, status, priority, max_retries, created_by, expires_at)
         VALUES (?, ?, ?, 'pending', 5, 3, ?, ?)`,
        [session.schoolId, device.sn, cmd, session.userId, expiresAt],
      );
    }
    commandsQueued.push({ device_sn: device.sn, commands: cmds });
  }

  return NextResponse.json({
    success: true,
    strategy: 'adms',
    message: `Queued DATA QUERY commands for ${deviceRows.length} device(s). The device will push data when it next checks in.`,
    devices: commandsQueued,
  });
}
