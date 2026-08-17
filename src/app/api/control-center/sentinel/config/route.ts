/**
 * Control Center — Sentinel alert configuration.
 *   GET  → current alert phone (masked) + enabled flag.
 *   POST { phone, enabled } → set them.
 * Deliberately restricted to XHENVOLT_SUPER_ADMIN specifically (not just
 * sentinel.manage) — this controls who gets paged at 3am, which is more
 * sensitive than acknowledging an incident.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { getAlertPhone, setAlertPhone, alertingEnabled, SENTINEL_ALERT_ENABLED_KEY } from '@/lib/sentinel/alert';
import { setSetting } from '@/lib/control/platform-settings';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const [phone, enabled] = await Promise.all([getAlertPhone(), alertingEnabled()]);
  return NextResponse.json({ success: true, phoneMasked: phone ? phone.replace(/\d(?=\d{3})/g, '•') : null, configured: !!phone, enabled });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (user.role !== 'XHENVOLT_SUPER_ADMIN') {
    return NextResponse.json({ error: 'Only a Super Admin may configure the Sentinel alert number' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const phone = body?.phone != null ? String(body.phone).trim().slice(0, 20) : null;
  const enabled = body?.enabled !== false;

  if (phone !== undefined) await setAlertPhone(phone || null);
  await setSetting(SENTINEL_ALERT_ENABLED_KEY, enabled ? '1' : '0');

  await controlAudit(user.id, 'sentinel_config_updated', 'sentinel:config', { configured: !!phone, enabled }, clientIp(req)).catch(() => {});
  return NextResponse.json({ success: true });
}
