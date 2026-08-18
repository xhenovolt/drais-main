/**
 * GET /api/cafe/school-settings  → school academic mode + defaults
 * PUT /api/cafe/school-settings  (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getSchoolSettings, updateSchoolSettings } from '@/lib/cafe/settings';
import type { SchoolSettingsInput } from '@/lib/cafe/types';
import { logAudit, AuditAction } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const settings = await getSchoolSettings(session.schoolId);
  return NextResponse.json({ success: true, settings });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as SchoolSettingsInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const settings = await updateSchoolSettings({ schoolId: session.schoolId, input: body });
    await logAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: AuditAction.SETTINGS_CHANGED, entityType: 'cafe_school_settings', entityId: session.schoolId,
      details: body as Record<string, unknown>,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });
    return NextResponse.json({ success: true, settings });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
