/**
 * PATCH  /api/tahfiz/enrollments/[id]   { action: 'suspend'|'reactivate'|'withdraw'|'complete' }
 * DELETE /api/tahfiz/enrollments/[id]   soft-delete (remove from Tahfiz)
 *
 * NEVER touches the canonical students row — only this participation record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { checkModule } from '@/lib/auth/requireModule';

const ACTION_TO_STATUS: Record<string, string> = {
  suspend: 'suspended', reactivate: 'active', withdraw: 'withdrawn', complete: 'completed',
};

async function gate(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const modDenied = await checkModule(session.schoolId, 'tahfiz');
  if (modDenied) return { error: modDenied };
  try { await requirePermission(session.userId, session.schoolId, 'tahfiz.records.manage', session.isSuperAdmin); }
  catch (e: any) { return { error: NextResponse.json({ error: e.message }, { status: 403 }) }; }
  return { session };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate(req); if ('error' in g) return g.error;
  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  const status = ACTION_TO_STATUS[body?.action];
  if (!status) return NextResponse.json({ error: "action must be suspend|reactivate|withdraw|complete" }, { status: 400 });

  // Scope to the staff member's school. left_date set when leaving, cleared when reactivating.
  const leftClause = status === 'active' ? 'left_date = NULL' : "left_date = COALESCE(left_date, CURDATE())";
  const res: any = await query(
    `UPDATE tahfiz_enrollments SET status = ?, ${leftClause}, updated_at = NOW()
      WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
    [status, id, g.session.schoolId],
  );
  if (!res?.affectedRows) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  return NextResponse.json({ success: true, id, status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate(req); if ('error' in g) return g.error;
  const id = Number((await params).id);
  const reason = new URL(req.url).searchParams.get('reason');
  // Soft-delete ONLY — the student record is never touched.
  const res: any = await query(
    `UPDATE tahfiz_enrollments
        SET deleted_at = NOW(), deleted_by = ?, delete_reason = ?, status = 'withdrawn', left_date = COALESCE(left_date, CURDATE())
      WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
    [g.session.userId, reason, id, g.session.schoolId],
  );
  if (!res?.affectedRows) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  return NextResponse.json({ success: true, id, removed: true });
}
