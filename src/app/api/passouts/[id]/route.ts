/** PATCH /api/passouts/[id] — { action: 'approve'|'reject'|'cancel' } */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { setPassoutStatus } from '@/lib/passouts/store';

export const runtime = 'nodejs';

const PERM: Record<string, string> = { approve: 'passouts.slip.approve', reject: 'passouts.slip.reject', cancel: 'passouts.slip.cancel' };
const NEXT: Record<string, 'approved' | 'rejected' | 'cancelled'> = { approve: 'approved', reject: 'rejected', cancel: 'cancelled' };

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
    await setPassoutStatus(session.schoolId, Number(id), NEXT[action], session.userId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
