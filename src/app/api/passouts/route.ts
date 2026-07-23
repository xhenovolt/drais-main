/**
 * GET  /api/passouts?status=&student_id=  — list pass-outs
 * GET  /api/passouts?dashboard=1          — dashboard counts
 * POST /api/passouts                       — create (auto-approves if the creator can approve)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { userCan } from '@/lib/rbac';
import { createPassout, listPassouts, passoutDashboard } from '@/lib/passouts/store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'passouts.slip.view', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  if (sp.get('dashboard')) {
    return NextResponse.json({ success: true, dashboard: await passoutDashboard(session.schoolId) });
  }
  const rows = await listPassouts(session.schoolId, {
    status: sp.get('status') || undefined,
    student_id: sp.get('student_id') ? Number(sp.get('student_id')) : undefined,
  });
  return NextResponse.json({ success: true, rows });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'passouts.slip.create', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  if (!b?.student_id) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });

  // Auto-approve only if the creator can approve (or is super-admin) and asked
  // to — and never in two-step mode, which always requires two distinct users.
  const canApprove = session.isSuperAdmin || await userCan(session.userId, session.schoolId, 'passouts.slip.approve');
  const { getPassoutSettings } = await import('@/lib/passouts/settings');
  const settings = await getPassoutSettings(session.schoolId);
  const autoApprove = !!b.approve_now && canApprove && settings.approval_mode === 'single';
  const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;
  try {
    const created = await createPassout(session.schoolId, b, session.userId, autoApprove, ip);
    return NextResponse.json({ success: true, ...created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
