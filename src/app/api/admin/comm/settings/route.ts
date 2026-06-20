import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getCommSettings, updateCommSettings } from '@/lib/comm';
import { listProviders } from '@/lib/comm';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.settings.view', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const settings  = await getCommSettings(session.schoolId);
  const providers = listProviders();
  // Never return the raw API key to the client; send a mask if one is set.
  const masked = {
    ...settings,
    providerApiKey: settings.providerApiKey ? '********' : null,
    hasApiKey: !!settings.providerApiKey,
  };
  return NextResponse.json({ success: true, settings: masked, providers });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.settings.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  if (body.senderName !== undefined && body.senderName !== null && String(body.senderName).length > 11) {
    return NextResponse.json({ error: 'Sender name must be 11 chars or fewer (SMS limit)' }, { status: 400 });
  }
  // Empty string → NULL (means "use provider default")
  if (body.senderName === '') body.senderName = null;
  const settings = await updateCommSettings(session.schoolId, body);
  return NextResponse.json({ success: true, settings });
}
