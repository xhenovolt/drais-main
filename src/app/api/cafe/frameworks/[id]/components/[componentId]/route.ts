/**
 * PATCH  /api/cafe/frameworks/:id/components/:componentId
 * DELETE /api/cafe/frameworks/:id/components/:componentId
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { updateComponent, deleteComponent } from '@/lib/cafe/frameworks';
import type { ComponentInput } from '@/lib/cafe/types';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; componentId: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id, componentId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Partial<ComponentInput> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const ok = await updateComponent({ id: Number(componentId), frameworkId: Number(id), schoolId: session.schoolId, input: body });
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string; componentId: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id, componentId } = await ctx.params;
  const ok = await deleteComponent({ id: Number(componentId), frameworkId: Number(id), schoolId: session.schoolId });
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
