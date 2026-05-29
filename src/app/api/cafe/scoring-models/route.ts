/**
 * GET  /api/cafe/scoring-models[?active_only=&include_global=]
 * POST /api/cafe/scoring-models                   (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listScoringModels, createScoringModel } from '@/lib/cafe/scoring';
import type { ScoringModelInput } from '@/lib/cafe/types';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const models = await listScoringModels({
    schoolId:      session.schoolId,
    activeOnly:    sp.get('active_only') !== '0',
    includeGlobal: sp.get('include_global') !== '0',
  });
  return NextResponse.json({ success: true, models });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as ScoringModelInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const id = await createScoringModel({ schoolId: session.schoolId, createdBy: session.userId ?? null, input: body });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string }).code;
    return NextResponse.json({ error: (e as Error).message }, { status: code === 'ER_DUP_ENTRY' ? 409 : 400 });
  }
}
