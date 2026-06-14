/**
 * POST /api/attendance/devices/[id]/inventory
 *   Pull the device's CURRENT user list (its own truth) and snapshot it.
 *   Body: { device_ip?: string (LAN), port?: number, method?: 'tcp'|'adms' }
 *   - LAN IP present (or stored IP is private) → TCP getUsers pull (sync).
 *   - else → queue ADMS DATA QUERY USERINFO (async; completes when the
 *     device responds).
 *
 * GET /api/attendance/devices/[id]/inventory
 *   Latest inventory run + status for the device.
 *
 * The on-device user count the UI shows comes from the latest COMPLETED
 * run here — never from DRAIS-side tables.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import {
  runTcpInventory, queueAdmsInventory, getLatestInventoryRun,
} from '@/lib/biometric/inventory-service';
import { auditDirectoryAction } from '@/lib/biometric/reconciliation-service';

export const runtime = 'nodejs';

const isPrivateLan = (s: string | null | undefined) =>
  !!s && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(s);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const sn = access.device!.sn;
  const schoolId = access.schoolId!;

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const method = body?.method === 'adms' ? 'adms' : (body?.method === 'tcp' ? 'tcp' : null);
  let port = 4370;
  if (body?.port) port = Math.max(1, Math.min(65535, Number(body.port)));
  let lanIp: string | null = null;
  if (typeof body?.device_ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(body.device_ip.trim())) lanIp = body.device_ip.trim();
  if (!lanIp && isPrivateLan(access.device!.ipAddress)) lanIp = access.device!.ipAddress!;

  // Choose path: explicit method wins; else TCP if we have a LAN IP, else ADMS.
  const useTcp = method === 'tcp' || (method !== 'adms' && !!lanIp);

  try {
    if (useTcp) {
      if (!lanIp) {
        return NextResponse.json({
          error: 'No LAN IP to pull over TCP. Provide the device LAN IP (e.g. 192.168.1.x), or use method:"adms" to queue an over-the-air sync.',
          need_lan_ip: true,
        }, { status: 422 });
      }
      const result = await runTcpInventory({ schoolId, sn, lanIp, port, triggeredBy: session.userId });
      await auditDirectoryAction(schoolId, sn, null, 'inventory_tcp', session.userId,
        { runId: result.runId, status: result.status, users: result.usersReturned ?? null });
      if (!result.ok) {
        return NextResponse.json({
          error: `Inventory pull failed: ${result.error}. The server must share the device LAN; retry if the device was busy.`,
          run_id: result.runId,
        }, { status: 502 });
      }
      return NextResponse.json({
        success: true, method: 'tcp', run_id: result.runId,
        users_returned: result.usersReturned,
        users: (result.users ?? []).slice(0, 2000),
        message: `Device returned ${result.usersReturned} user${result.usersReturned === 1 ? '' : 's'}.`,
      });
    }

    // ADMS over-the-air
    const result = await queueAdmsInventory({ schoolId, sn, triggeredBy: session.userId });
    await auditDirectoryAction(schoolId, sn, null, 'inventory_adms_queued', session.userId, { runId: result.runId });
    return NextResponse.json({
      success: true, method: 'adms', run_id: result.runId, status: 'pending',
      message: 'Over-the-air user sync queued. The device returns its list on its next heartbeat (firmware-dependent on K40).',
    });
  } catch (err: any) {
    console.error('[inventory POST]', err);
    return NextResponse.json({ error: err.message || 'Inventory failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const run = await getLatestInventoryRun(access.device!.sn);
  return NextResponse.json({ success: true, latest_run: run });
}
