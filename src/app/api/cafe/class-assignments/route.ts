/**
 * GET  /api/cafe/class-assignments[?class_id=&term_id=]
 * POST /api/cafe/class-assignments   { classId, frameworkId, termId, subjectId? }
 *                                   (cafe.manage)
 * DELETE /api/cafe/class-assignments?class_id=&term_id=&subject_id=
 *                                   (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listAssignments, assignFrameworkToClass, unassignFramework } from '@/lib/cafe/resolver';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const classId = sp.get('class_id') ? Number(sp.get('class_id')) : undefined;
  const termId  = sp.get('term_id')  ? Number(sp.get('term_id'))  : undefined;
  const assignments = await listAssignments({ schoolId: session.schoolId, classId, termId });
  return NextResponse.json({ success: true, assignments });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    classId: number; frameworkId: number; termId: number; subjectId?: number | null;
  } | null;
  if (!body?.classId || !body.frameworkId || !body.termId) {
    return NextResponse.json({ error: 'classId, frameworkId, termId required' }, { status: 400 });
  }
  try {
    await assignFrameworkToClass({
      schoolId: session.schoolId, createdBy: session.userId ?? null,
      classId: body.classId, frameworkId: body.frameworkId, termId: body.termId,
      subjectId: body.subjectId ?? null,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const classId   = Number(sp.get('class_id'));
  const termId    = Number(sp.get('term_id'));
  const subjectRaw = sp.get('subject_id');
  const subjectId = subjectRaw == null || subjectRaw === '' ? null : Number(subjectRaw);
  if (!classId || !termId) return NextResponse.json({ error: 'class_id + term_id required' }, { status: 400 });
  const ok = await unassignFramework({ schoolId: session.schoolId, classId, termId, subjectId });
  return NextResponse.json({ success: ok });
}
