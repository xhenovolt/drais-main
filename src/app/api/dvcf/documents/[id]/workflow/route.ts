/**
 * P4 — DRCE template workflow transition endpoint.
 *
 *   POST /api/dvcf/documents/:id/workflow
 *     body: { action: 'submit'|'approve'|'reject'|'publish'|'archive'|'unarchive', notes?: string }
 *
 * Each action is gated by a separate permission (see ACTION_PERMISSION in
 * src/lib/drce/workflow.ts) so a school can hand off "approve" to a Head
 * Teacher without giving them "edit" rights, or vice versa.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { applyTransition, ACTION_PERMISSION, type WorkflowAction } from '@/lib/drce/workflow';

const VALID: WorkflowAction[] = ['submit', 'approve', 'reject', 'publish', 'archive', 'unarchive'];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const documentId = Number(id);
  if (!Number.isFinite(documentId) || documentId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { action?: string; notes?: string } | null;
  if (!body?.action || !VALID.includes(body.action as WorkflowAction)) {
    return NextResponse.json({ error: `action must be one of ${VALID.join('|')}` }, { status: 400 });
  }
  const action = body.action as WorkflowAction;

  try {
    await requirePermission(session.userId, session.schoolId, ACTION_PERMISSION[action], session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const result = await applyTransition({
    documentId,
    schoolId: session.schoolId,
    userId:   session.userId,
    action,
    notes:    body.notes,
  });
  if (result.ok === false) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ success: true, status: result.nextStatus });
}
