/**
 * POST /api/heartbeat — update last_activity_at for the current session
 * Called every 60 seconds from the client to signal "online" status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const SESSION_COOKIE = 'drais_session';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  // Detect device info from UA on first update
  const ua          = req.headers.get('user-agent') ?? null;
  const deviceInfo  = parseDeviceInfo(ua);

  await query(
    `UPDATE sessions
     SET last_activity_at = NOW(),
         device_info      = COALESCE(device_info, ?)
     WHERE session_token = ? AND is_active = TRUE AND expires_at > NOW()`,
    [deviceInfo, token],
  ).catch(() => {}); // Don't fail if this errors

  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}

/** Very lightweight UA parse for device info column (≤500 chars) */
function parseDeviceInfo(ua: string | null): string | null {
  if (!ua) return null;

  let browser = 'Unknown';
  let os      = 'Unknown';
  let device  = 'Desktop';

  if (/Edg\//.test(ua))           browser = 'Edge';
  else if (/Chrome\//.test(ua))   browser = 'Chrome';
  else if (/Firefox\//.test(ua))  browser = 'Firefox';
  else if (/Safari\//.test(ua))   browser = 'Safari';
  else if (/OPR\//.test(ua))      browser = 'Opera';

  if (/Android/.test(ua))         { os = 'Android'; device = 'Mobile'; }
  else if (/iPhone|iPad/.test(ua)){ os = 'iOS';     device = /iPad/.test(ua) ? 'Tablet' : 'Mobile'; }
  else if (/Windows/.test(ua))    os = 'Windows';
  else if (/Mac OS/.test(ua))     os = 'macOS';
  else if (/Linux/.test(ua))      os = 'Linux';

  return `${browser} / ${os} / ${device}`.slice(0, 500);
}
