import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { denied } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import { isValidDatabaseSettingsPasskey, resetDatabaseSettingsPasskey } from '@/lib/control/db-settings-passkey';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Control Center sign-in required' }, { status: 401 });
  if (!controlCan(user, 'database.view')) return denied('database.view');

  const body = await req.json().catch(() => null);
  const nextPasskey = String(body?.passkey || '');
  if (!isValidDatabaseSettingsPasskey(nextPasskey)) {
    return NextResponse.json({ error: 'Passkey must be 12 to 200 characters' }, { status: 400 });
  }

  await resetDatabaseSettingsPasskey(nextPasskey);
  await controlAudit(user.id, 'database_settings_passkey_reset', 'platform_settings:database_settings_passkey_hash', null, clientIp(req));
  return NextResponse.json({ success: true });
}
