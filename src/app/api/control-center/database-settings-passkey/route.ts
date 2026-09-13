import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { isValidDatabaseSettingsPasskey, resetDatabaseSettingsPasskey } from '@/lib/control/db-settings-passkey';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Control Center sign-in required' }, { status: 401 });
  if (user.role !== 'XHENVOLT_SUPER_ADMIN') return NextResponse.json({ error: 'Xhenvolt Super Admin only' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const nextPasskey = String(body?.passkey || '');
  if (!isValidDatabaseSettingsPasskey(nextPasskey)) {
    return NextResponse.json({ error: 'Passkey must be 12 to 200 characters' }, { status: 400 });
  }

  await resetDatabaseSettingsPasskey(nextPasskey);
  await controlAudit(user.id, 'database_settings_passkey_reset', 'platform_settings:database_settings_passkey_hash', null, clientIp(req));
  return NextResponse.json({ success: true });
}
