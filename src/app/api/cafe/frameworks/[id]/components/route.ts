/**
 * GET  /api/cafe/frameworks/:id/components  → list components
 * POST /api/cafe/frameworks/:id/components  → add a component (cafe.manage)
 *
 * Per-component updates / deletes are handled by the framework PATCH endpoint
 * via the embedded `components` array to keep client round-trips low; this
 * sub-route exists only for the create-one path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listComponents, createComponent } from '@/lib/cafe/frameworks';
import type { ComponentInput } from '@/lib/cafe/types';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const components = await listComponents(Number(id));
  return NextResponse.json({ success: true, components });
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
  const body = (await req.json().catch(() => null)) as ComponentInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const componentId = await createComponent({ frameworkId: Number(id), schoolId: session.schoolId, input: body });
    return NextResponse.json({ success: true, id: componentId }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
