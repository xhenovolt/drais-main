/**
 * GET/POST /api/passouts/settings — school-configurable pass-out behaviour
 * (notification toggles + approval workflow). Stored in school_settings.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getPassoutSettings, savePassoutSettings } from '@/lib/passouts/settings';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'passouts.slip.view', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  return NextResponse.json({ success: true, settings: await getPassoutSettings(session.schoolId) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'passouts.slip.approve', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const patch: any = {};
  for (const k of ['notifications_disabled', 'notify_exit', 'notify_return', 'emergency_only'] as const) {
    if (typeof b[k] === 'boolean') patch[k] = b[k];
  }
  if (b.approval_mode === 'single' || b.approval_mode === 'two_step') patch.approval_mode = b.approval_mode;
  await savePassoutSettings(session.schoolId, patch);
  return NextResponse.json({ success: true, settings: await getPassoutSettings(session.schoolId) });
}
