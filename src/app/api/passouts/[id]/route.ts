/**
 * PATCH /api/passouts/[id] — { action: 'approve'|'reject'|'cancel' }
 * approve runs the school's configured workflow (single or two-step);
 * every transition is audit-logged with the acting user + IP.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { approvePassout, setPassoutStatus } from '@/lib/passouts/store';

export const runtime = 'nodejs';

const PERM: Record<string, string> = { approve: 'passouts.slip.approve', reject: 'passouts.slip.reject', cancel: 'passouts.slip.cancel' };

const clientIp = (req: NextRequest) =>
  (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const action = b.action as string;
  if (!PERM[action]) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  try {
    await requirePermission(session.userId, session.schoolId, PERM[action], session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  try {
    const ip = clientIp(req);
    if (action === 'approve') {
      const res = await approvePassout(session.schoolId, Number(id), session.userId, ip);
      if (!res.ok) return NextResponse.json({ error: res.reason || 'Cannot approve' }, { status: 409 });
      return NextResponse.json({
        success: true,
        final: res.final,
        message: res.final ? 'Pass-out approved' : 'First approval recorded — awaiting second approver',
      });
    }
    await setPassoutStatus(session.schoolId, Number(id), action === 'reject' ? 'rejected' : 'cancelled', session.userId, ip);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
