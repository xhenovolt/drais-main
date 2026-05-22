import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

/**
 * GET /api/admin/staff/[id]/workload
 *
 * Returns every subject×class allocation for a teacher plus any classes
 * where they are the assigned class teacher this term.
 *
 * Phase G — powers the teaching-assignments panel on staff profile pages.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const staffId = Number(id);
  if (!Number.isFinite(staffId) || staffId <= 0) {
    return NextResponse.json({ error: 'Invalid staff id' }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const termId = sp.get('term_id') ? Number(sp.get('term_id')) : null;

  // Verify staff belongs to caller's school
  const owned = (await query(
    `SELECT 1 FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [staffId, session.schoolId],
  )) as Array<{ '1': number }>;
  if (!owned.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Subject × class allocations
  const allocations = (await query(
    `SELECT
       cs.id         AS allocation_id,
       c.id          AS class_id,
       c.name        AS class_name,
       s.id          AS subject_id,
       s.name        AS subject_name,
       s.subject_type,
       cs.custom_initials
     FROM class_subjects cs
     JOIN classes c  ON c.id  = cs.class_id
     JOIN subjects s ON s.id  = cs.subject_id
     WHERE cs.teacher_id = ?
       AND c.school_id   = ?
       AND c.deleted_at  IS NULL
       AND s.deleted_at  IS NULL
     ORDER BY c.name, s.name`,
    [staffId, session.schoolId],
  )) as Array<{
    allocation_id: number;
    class_id: number;
    class_name: string;
    subject_id: number;
    subject_name: string;
    subject_type: string;
    custom_initials: string | null;
  }>;

  // Class teacher assignments (optionally filtered by term)
  const ctWhere: string[] = [
    'ct.staff_id  = ?',
    'ct.school_id = ?',
    'ct.valid_until IS NULL',
  ];
  const ctParams: unknown[] = [staffId, session.schoolId];
  if (termId) {
    ctWhere.push('ct.term_id = ?');
    ctParams.push(termId);
  }

  const classTeacherOf = (await query(
    `SELECT
       ct.id           AS assignment_id,
       c.id            AS class_id,
       c.name          AS class_name,
       str.name        AS stream_name,
       t.name          AS term_name,
       ct.assigned_at
     FROM class_teachers ct
     JOIN classes c   ON c.id  = ct.class_id
     JOIN terms   t   ON t.id  = ct.term_id
     LEFT JOIN streams str ON str.id = ct.stream_id
     WHERE ${ctWhere.join(' AND ')}
       AND c.deleted_at IS NULL
     ORDER BY c.name`,
    ctParams,
  )) as Array<{
    assignment_id: number;
    class_id: number;
    class_name: string;
    stream_name: string | null;
    term_name: string;
    assigned_at: string;
  }>;

  // Summary counts
  const uniqueClasses  = new Set(allocations.map(a => a.class_id)).size;
  const uniqueSubjects = new Set(allocations.map(a => a.subject_id)).size;

  return NextResponse.json({
    success: true,
    staffId,
    summary: {
      classCount:        uniqueClasses,
      subjectCount:      uniqueSubjects,
      allocationCount:   allocations.length,
      classTeacherCount: classTeacherOf.length,
    },
    allocations,
    classTeacherOf,
  });
}
