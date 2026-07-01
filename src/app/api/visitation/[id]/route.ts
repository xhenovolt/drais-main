/** PATCH /api/visitation/[id] — { status: 'active'|'suspended'|'lost'|'expired' } */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { setCardStatus } from '@/lib/passouts/visitation';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'visitation.card.suspend', session.isSuperAdmin); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  if (!['active', 'suspended', 'lost', 'expired'].includes(b.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }
  try {
    await setCardStatus(session.schoolId, Number(id), b.status);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
