/**
 * DELETE /api/admin/holidays/[id]
 *
 * Removes a holiday. Ownership-guarded by school_id; national rows
 * (school_id IS NULL) require super-admin.
 *
 * Deletion does NOT touch attendance_records that were evaluated as
 * 'holiday' for this date — those rows stay until a fresh
 * evaluateDay re-runs (e.g. a backdated punch). Reports will
 * therefore show the holiday verdict for past evaluations until then.
 * This is intentional: attendance_records is the historical truth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const rows = (await query(
    `SELECT school_id FROM holidays WHERE id = ? LIMIT 1`,
    [id],
  )) as Array<{ school_id: number | null }>;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Holiday not found' }, { status: 404 });
  }

  const owner = rows[0].school_id;
  if (owner === null && !session.isSuperAdmin) {
    return NextResponse.json(
      { error: 'National holidays can only be deleted by super-admin' },
      { status: 403 },
    );
  }
  if (owner !== null && owner !== session.schoolId && !session.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = (await query(
    `DELETE FROM holidays WHERE id = ?`,
    [id],
  )) as { affectedRows?: number };

  return NextResponse.json({ success: true, deleted: Number(result?.affectedRows ?? 0) });
}
