/**
 * GET   /api/finance/import/[batchId]        — batch + its rows
 * PATCH /api/finance/import/[batchId]?row=ID — resolve a row (action / student)
 *
 * The wizard uses PATCH to set action='import' + matched_student_id on an
 * ambiguous (name-matched) row after the operator picks the right learner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ batchId: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const { batchId } = await ctx.params;

  const batch = (await query(
    `SELECT * FROM finance_import_batches WHERE id = ? AND school_id = ? LIMIT 1`,
    [batchId, session.schoolId],
  )) as any[];
  if (!batch[0]) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

  const rows = (await query(
    `SELECT * FROM finance_import_rows WHERE batch_id = ? AND school_id = ? ORDER BY row_no`,
    [batchId, session.schoolId],
  )) as any[];

  return NextResponse.json({ success: true, batch: batch[0], rows });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ batchId: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { batchId } = await ctx.params;
  const rowId = Number(new URL(req.url).searchParams.get('row'));
  if (!rowId) return NextResponse.json({ error: 'row query param required' }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  const sets: string[] = [];
  const params: any[] = [];
  if (body.action && ['import', 'skip', 'pending'].includes(body.action)) { sets.push('action = ?'); params.push(body.action); }
  if (body.matched_student_id !== undefined) {
    sets.push('matched_student_id = ?'); params.push(body.matched_student_id ? Number(body.matched_student_id) : null);
    // Resolving to a concrete student promotes an ambiguous row to matched.
    if (body.matched_student_id) { sets.push("match_status = 'matched'"); }
  }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  params.push(rowId, batchId, session.schoolId);

  await query(
    `UPDATE finance_import_rows SET ${sets.join(', ')} WHERE id = ? AND batch_id = ? AND school_id = ?`,
    params,
  );
  return NextResponse.json({ success: true });
}
