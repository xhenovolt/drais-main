/**
 * GET  /api/visitation — list cards
 * POST /api/visitation — issue a card
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { issueCard, listCards } from '@/lib/passouts/visitation';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'visitation.card.view', session.isSuperAdmin); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  return NextResponse.json({ success: true, rows: await listCards(session.schoolId) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'visitation.card.issue', session.isSuperAdmin); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const b = await req.json().catch(() => null);
  if (!b?.card_uid?.trim()) return NextResponse.json({ error: 'card_uid is required' }, { status: 400 });
  try {
    const id = await issueCard(session.schoolId, b, session.userId);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
