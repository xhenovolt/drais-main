/**
 * Single custom field — get / update / archive.
 *
 * GET    /api/admin/custom-fields/:id
 * PATCH  /api/admin/custom-fields/:id  body: Partial<FieldInput>
 * DELETE /api/admin/custom-fields/:id  → soft-delete (is_active = 0)
 *
 * Authorization: school-scoped session; mutations require
 * `custom_fields.manage` (super-admin bypasses).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  getFieldById, updateField, archiveField, type FieldInput,
} from '@/lib/custom-fields';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const fieldId = Number(id);
  if (!Number.isFinite(fieldId) || fieldId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const f = await getFieldById(fieldId, session.schoolId);
  if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, field: f });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'custom_fields.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const fieldId = Number(id);
  if (!Number.isFinite(fieldId) || fieldId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as Partial<FieldInput> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  try {
    const ok = await updateField({ id: fieldId, schoolId: session.schoolId, input: body });
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = (e as Error).message ?? 'Failed to update field';
    const status = (e as { code?: string }).code === 'ER_DUP_ENTRY' ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'custom_fields.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const fieldId = Number(id);
  if (!Number.isFinite(fieldId) || fieldId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const ok = await archiveField(fieldId, session.schoolId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
