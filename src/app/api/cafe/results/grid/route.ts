/**
 * GET /api/cafe/results/grid?class_id=&subject_id=&term_id=
 *   → { framework, students, values }
 *
 * Phase 3 entry-UI loader. Pulls the framework + components, the class
 * roster, and any existing entries so the grid can render in one round-trip.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { loadEntryGrid } from '@/lib/cafe/component-entry';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const classId   = Number(sp.get('class_id'));
  const subjectId = Number(sp.get('subject_id'));
  const termId    = Number(sp.get('term_id'));
  if (!classId || !subjectId || !termId) {
    return NextResponse.json({ error: 'class_id, subject_id, term_id required' }, { status: 400 });
  }

  const grid = await loadEntryGrid({ schoolId: session.schoolId, classId, subjectId, termId });
  return NextResponse.json({ success: true, ...grid });
}
