/**
 * GET    /api/drce/blocks/[id]  — fetch one block (school-scoped)
 * PATCH  /api/drce/blocks/[id]  — update a school-owned block
 * DELETE /api/drce/blocks/[id]  — delete a school-owned block
 *
 * Globals (school_id NULL) are read-only via this tenant route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getBlock, updateBlock, deleteBlock, type BlockKind } from '@/lib/drce/blocks';
import { checkModule } from '@/lib/auth/requireModule';

const KINDS: BlockKind[] = ['header', 'footer', 'comment_rules', 'custom'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const block = await getBlock(id, session.schoolId);
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  return NextResponse.json({ success: true, block });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await getBlock(id, session.schoolId);
  if (!existing) return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  if (existing.school_id === null) {
    return NextResponse.json({ error: 'Global blocks are read-only from this endpoint' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  if (body.kind !== undefined && !KINDS.includes(body.kind)) {
    return NextResponse.json({ error: `kind must be one of ${KINDS.join(',')}` }, { status: 400 });
  }

  await updateBlock(id, session.schoolId, {
    name:        typeof body.name === 'string' ? body.name.slice(0, 120) : undefined,
    description: typeof body.description === 'string' ? body.description.slice(0, 255) : undefined,
    kind:        body.kind,
    section:     body.section,
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await getBlock(id, session.schoolId);
  if (!existing) return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  if (existing.school_id === null) {
    return NextResponse.json({ error: 'Global blocks cannot be deleted from this endpoint' }, { status: 403 });
  }
  await deleteBlock(id, session.schoolId);
  return NextResponse.json({ success: true });
}
