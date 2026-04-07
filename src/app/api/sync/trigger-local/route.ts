import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const BRIDGE_URL    = process.env.BRIDGE_URL    || 'http://127.0.0.1:7430';
const BRIDGE_SECRET = process.env.DR_BRIDGE_SECRET || '';

/**
 * POST /api/sync/trigger-local
 * Tells the local bridge to pull all users + templates from the ZKTeco device
 * then POST them to /api/sync/manual-upload for merging into the DB.
 *
 * Body: { device_ip?: string, device_port?: number }
 * If device_ip is omitted, falls back to the school's registered device IP.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  // Resolve device IP — caller may provide one, or we look up from DB
  let deviceIp: string = (body.device_ip as string) || '';
  const devicePort: number = Number(body.device_port || 4370);

  if (!deviceIp) {
    const rows = await query(
      `SELECT ip_address FROM devices WHERE school_id = ? AND status = 'active' ORDER BY last_seen DESC LIMIT 1`,
      [session.schoolId],
    );
    deviceIp = rows[0]?.ip_address || '';
  }

  if (!deviceIp) {
    return NextResponse.json({ error: 'No device IP found. Register a device or pass device_ip in the request body.' }, { status: 422 });
  }

  // Build the cloud base URL so the bridge knows where to POST results
  const origin =
    process.env.NEXTAUTH_URL ||
    process.env.APP_URL ||
    `${req.headers.get('x-forwarded-proto') ?? 'http'}://${req.headers.get('host')}`;

  const bridgeCallUrl = `${BRIDGE_URL}/sync`;
  let bridgeRes: Response;
  try {
    bridgeRes = await fetch(bridgeCallUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BRIDGE_SECRET}`,
      },
      body: JSON.stringify({ deviceIp, devicePort, cloudUrl: origin }),
      signal: AbortSignal.timeout(120_000), // 2-minute threshold for large templates
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Bridge unreachable: ${err.message}. Ensure drais-local-bridge is running on this machine.` },
      { status: 502 },
    );
  }

  const data = await bridgeRes.json().catch(() => ({}));
  if (!bridgeRes.ok) {
    return NextResponse.json(
      { error: data?.error || 'Bridge returned an error', detail: data },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    strategy: 'local',
    device_ip: deviceIp,
    users_pulled: data.users_pulled ?? 0,
    templates_pulled: data.templates_pulled ?? 0,
    merge_result: data.cloud_response,
  });
}
