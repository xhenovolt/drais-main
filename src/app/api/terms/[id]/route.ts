import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { archiveEntity, TrashError } from '@/lib/trash/service';
import { query } from '@/lib/db';

/**
 * DELETE /api/terms/[id]
 *   Archives a term (soft-delete via trash service).
 *   Super-admin or admin required.
 *
 * PATCH  /api/terms/[id]
 *   Update term fields (name, start_date, end_date, status).
 */

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const termId = Number(id);
  if (!Number.isFinite(termId) || termId <= 0) {
    return NextResponse.json({ error: 'Invalid term id' }, { status: 400 });
  }

  try {
    await archiveEntity({
      code:     'term',
      id:       termId,
      schoolId: session.schoolId,
      userId:   session.userId,
      reason:   null,
      ip:       req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
    });
    return NextResponse.json({ success: true, message: 'Term archived' });
  } catch (e: unknown) {
    if (e instanceof TrashError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    }
    console.error('Term archive error:', e);
    return NextResponse.json({ error: 'Failed to archive term' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const termId = Number(id);
  if (!Number.isFinite(termId) || termId <= 0) {
    return NextResponse.json({ error: 'Invalid term id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (body.name       !== undefined) { sets.push('name = ?');       vals.push(body.name); }
  if (body.start_date !== undefined) { sets.push('start_date = ?'); vals.push(body.start_date); }
  if (body.end_date   !== undefined) { sets.push('end_date = ?');   vals.push(body.end_date); }
  if (body.status     !== undefined) { sets.push('status = ?');     vals.push(body.status); }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  vals.push(termId, session.schoolId);
  await query(
    `UPDATE terms SET ${sets.join(', ')} WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
    vals,
  );
  return NextResponse.json({ success: true });
}
