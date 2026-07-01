/** POST /api/visitation/verify — { card_uid, device_sn?, event_type? } → verdict */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { verifyCard } from '@/lib/passouts/visitation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'visitation.gate.verify', session.isSuperAdmin); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const b = await req.json().catch(() => null);
  if (!b?.card_uid?.trim()) return NextResponse.json({ error: 'card_uid is required' }, { status: 400 });
  try {
    const result = await verifyCard(session.schoolId, String(b.card_uid).trim(), b.device_sn ?? null, b.event_type || 'visit');
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
