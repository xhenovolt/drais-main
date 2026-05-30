/**
 * GET  /api/cafe/projects?student_id=&term_id=
 * POST /api/cafe/projects               (cafe.manage)
 * PATCH /api/cafe/projects?id=          (cafe.manage)
 * DELETE /api/cafe/projects?id=         (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  listProjectsForStudent, createProject, updateProject, deleteProject,
  type ProjectInput,
} from '@/lib/cafe/skills-projects';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const studentId = Number(sp.get('student_id'));
  const termId    = Number(sp.get('term_id'));
  if (!studentId || !termId) return NextResponse.json({ error: 'student_id + term_id required' }, { status: 400 });

  const projects = await listProjectsForStudent({ schoolId: session.schoolId, studentId, termId });
  return NextResponse.json({ success: true, projects });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const body = (await req.json().catch(() => null)) as ProjectInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const id = await createProject({ schoolId: session.schoolId, enteredBy: session.userId ?? null, input: body });
    return NextResponse.json({ success: true, id });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Partial<ProjectInput> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const ok = await updateProject({ schoolId: session.schoolId, id, input: body });
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const ok = await deleteProject(session.schoolId, id);
  return NextResponse.json({ success: ok });
}
