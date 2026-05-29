/**
 * PATCH  /api/cafe/scoring-models/:id/grades/:gradeId
 * DELETE /api/cafe/scoring-models/:id/grades/:gradeId
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { updateGradeMapping, deleteGradeMapping } from '@/lib/cafe/scoring';
import type { GradeMappingInput } from '@/lib/cafe/types';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; gradeId: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id, gradeId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Partial<GradeMappingInput> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const ok = await updateGradeMapping({ id: Number(gradeId), scoringModelId: Number(id), schoolId: session.schoolId, input: body });
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; gradeId: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id, gradeId } = await ctx.params;
  try {
    const ok = await deleteGradeMapping({ id: Number(gradeId), scoringModelId: Number(id), schoolId: session.schoolId });
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
