/**
 * GET  /api/cafe/scoring-models/:id/grades
 * POST /api/cafe/scoring-models/:id/grades   (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listGradeMappings, createGradeMapping } from '@/lib/cafe/scoring';
import type { GradeMappingInput } from '@/lib/cafe/types';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const grades = await listGradeMappings(Number(id));
  return NextResponse.json({ success: true, grades });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as GradeMappingInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const newId = await createGradeMapping({ scoringModelId: Number(id), schoolId: session.schoolId, input: body });
    return NextResponse.json({ success: true, id: newId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
