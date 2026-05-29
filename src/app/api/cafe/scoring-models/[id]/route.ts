/**
 * GET    /api/cafe/scoring-models/:id   → model + grades
 * PATCH  /api/cafe/scoring-models/:id   (cafe.manage)
 * DELETE /api/cafe/scoring-models/:id   → archive (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getScoringModel, updateScoringModel, archiveScoringModel } from '@/lib/cafe/scoring';
import type { ScoringModelInput } from '@/lib/cafe/types';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const model = await getScoringModel(Number(id), session.schoolId);
  if (!model) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, model });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Partial<ScoringModelInput> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const ok = await updateScoringModel({ id: Number(id), schoolId: session.schoolId, input: body });
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const ok = await archiveScoringModel(Number(id), session.schoolId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
