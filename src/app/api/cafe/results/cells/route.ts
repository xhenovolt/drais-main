/**
 * POST /api/cafe/results/cells   { cells: CellInput[] }
 *   → { written, skipped: [{ cell, reason }] }
 *
 * Bulk upsert for the entry grid. Each cell is validated against the
 * scoring model configured for its component; failed cells are reported
 * in `skipped` rather than aborting the batch.
 *
 * Permission: cafe.manage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { saveCells, type CellInput } from '@/lib/cafe/component-entry';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { cells?: CellInput[] } | null;
  if (!Array.isArray(body?.cells)) return NextResponse.json({ error: 'cells[] required' }, { status: 400 });

  try {
    const result = await saveCells({
      schoolId:  session.schoolId,
      enteredBy: session.userId ?? null,
      cells:     body!.cells,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
