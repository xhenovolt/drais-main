/**
 * PATCH /api/admin/parent-links/{id}   body: { action: 'approve' | 'reject' | 'revoke' }
 *
 * Staff approves / rejects / revokes a parent→learner link. School-scoped:
 * a staff member can only act on links belonging to their own school, which
 * keeps the approval power inside the tenant boundary. Gated by students.manage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'students.manage', session.isSuperAdmin);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (!['approve', 'reject', 'revoke'].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve', 'reject', or 'revoke'" }, { status: 400 });
  }

  // Scope check: the link must belong to THIS school.
  const rows = (await query(
    `SELECT id, status FROM parent_student_links WHERE id = ? AND school_id = ? LIMIT 1`,
    [id, session.schoolId],
  )) as any[];
  if (!rows.length) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  if (action === 'approve') {
    await query(
      `UPDATE parent_student_links
          SET status = 'active', approved_by = ?, approved_at = NOW(), revoked_at = NULL, revoked_by = NULL
        WHERE id = ?`,
      [session.userId, id],
    );
    return NextResponse.json({ success: true, id, status: 'active' });
  }

  // reject (a pending request) and revoke (an active link) both → revoked
  await query(
    `UPDATE parent_student_links
        SET status = 'revoked', revoked_by = ?, revoked_at = NOW()
      WHERE id = ?`,
    [session.userId, id],
  );
  return NextResponse.json({ success: true, id, status: 'revoked' });
}
