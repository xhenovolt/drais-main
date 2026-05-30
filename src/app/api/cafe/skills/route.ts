/**
 * GET  /api/cafe/skills?student_id=&term_id=
 *      → list a single learner's generic skills for one term.
 * POST /api/cafe/skills          (cafe.manage) — upsert one entry
 * DELETE /api/cafe/skills?student_id=&term_id=&code=   (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listSkillsForStudent, upsertSkill, deleteSkill, type SkillInput } from '@/lib/cafe/skills-projects';

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

  const skills = await listSkillsForStudent({ schoolId: session.schoolId, studentId, termId });
  return NextResponse.json({ success: true, skills });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const body = (await req.json().catch(() => null)) as SkillInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const id = await upsertSkill({ schoolId: session.schoolId, enteredBy: session.userId ?? null, input: body });
    return NextResponse.json({ success: true, id });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const sp = req.nextUrl.searchParams;
  const studentId = Number(sp.get('student_id'));
  const termId    = Number(sp.get('term_id'));
  const code      = sp.get('code');
  if (!studentId || !termId || !code) return NextResponse.json({ error: 'student_id, term_id, code required' }, { status: 400 });
  const ok = await deleteSkill({ schoolId: session.schoolId, studentId, termId, code });
  return NextResponse.json({ success: ok });
}
