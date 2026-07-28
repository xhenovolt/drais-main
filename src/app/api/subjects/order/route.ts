/**
 * GET  /api/subjects/order?class_id=&result_type_id= — every school subject,
 *      ordered per the resolved rules for that scope (or the school default
 *      when class_id/result_type_id are omitted), plus which rules exist.
 * POST /api/subjects/order — bulk reorder for one scope.
 *      Body: { subjectIds: number[], classId?: number|null, resultTypeId?: number|null }
 * DELETE /api/subjects/order?id= — remove one rule (reverts to the next
 *      less-specific tier — school default, or alphabetical if none).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { query } from '@/lib/db';
import { orderSubjects } from '@/lib/reports/subjectOrder';
import { listSubjectOrderRulesWithNames, setSubjectOrderBulk, deleteSubjectOrderRule } from '@/lib/reports/subjectOrder.server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('class_id') ? Number(searchParams.get('class_id')) : null;
  const resultTypeId = searchParams.get('result_type_id') ? Number(searchParams.get('result_type_id')) : null;

  const [subjects, rules] = await Promise.all([
    query(
      `SELECT id, name, subject_type FROM subjects WHERE school_id = ? AND deleted_at IS NULL ORDER BY name`,
      [session.schoolId],
    ) as Promise<Array<{ id: number; name: string; subject_type: string | null }>>,
    listSubjectOrderRulesWithNames(session.schoolId),
  ]);

  const ordered = orderSubjects(subjects, rules, classId, resultTypeId);
  return NextResponse.json({
    success: true,
    subjects: ordered.map((s) => ({ id: s.id, name: s.name, subjectType: s.subject_type })),
    rules, // full rule set (all scopes) — the UI groups these to show what's configured where
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const b = await req.json().catch(() => null);
  const subjectIds = Array.isArray(b?.subjectIds) ? b.subjectIds.map(Number).filter(Number.isFinite) : null;
  if (!subjectIds || !subjectIds.length) return NextResponse.json({ error: 'subjectIds[] is required' }, { status: 400 });
  const classId = b.classId != null ? Number(b.classId) : null;
  const resultTypeId = b.resultTypeId != null ? Number(b.resultTypeId) : null;

  await setSubjectOrderBulk(session.schoolId, subjectIds, classId, resultTypeId, session.userId);
  void logAudit({
    schoolId: session.schoolId, userId: session.userId, action: AuditAction.SETTINGS_CHANGED,
    entityType: 'subject_report_order',
    details: { op: 'reorder', classId, resultTypeId, count: subjectIds.length },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  await deleteSubjectOrderRule(session.schoolId, id);
  return NextResponse.json({ success: true });
}
