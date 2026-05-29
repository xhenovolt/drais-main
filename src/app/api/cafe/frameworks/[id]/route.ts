/**
 * GET    /api/cafe/frameworks/:id          → hydrated framework + components
 * PATCH  /api/cafe/frameworks/:id          → partial update (cafe.manage)
 * DELETE /api/cafe/frameworks/:id          → archive (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getFramework, updateFramework, archiveFramework } from '@/lib/cafe/frameworks';
import type { FrameworkInput } from '@/lib/cafe/types';

async function frameworkId(ctx: { params: Promise<{ id: string }> }): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid id');
  return n;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  let id: number;
  try { id = await frameworkId(ctx); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const framework = await getFramework(id, session.schoolId);
  if (!framework) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, framework });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  let id: number;
  try { id = await frameworkId(ctx); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const body = (await req.json().catch(() => null)) as Partial<FrameworkInput> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const ok = await updateFramework({ id, schoolId: session.schoolId, input: body });
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
  let id: number;
  try { id = await frameworkId(ctx); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const ok = await archiveFramework(id, session.schoolId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
