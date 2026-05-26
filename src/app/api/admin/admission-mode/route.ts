import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getAdmissionMode, setAdmissionMode } from '@/lib/admissions/mode';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const mode = await getAdmissionMode(session.schoolId);
  return NextResponse.json({ success: true, mode });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'admissions.mode.manage', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { mode } = await req.json().catch(() => ({}));
  if (mode !== 'flexible' && mode !== 'structured') {
    return NextResponse.json({ error: "mode must be 'flexible' or 'structured'" }, { status: 400 });
  }
  await setAdmissionMode(session.schoolId, mode);
  return NextResponse.json({ success: true, mode });
}
