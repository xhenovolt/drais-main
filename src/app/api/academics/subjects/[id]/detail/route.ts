/**
 * GET /api/academics/subjects/[id]/detail
 *
 * Phase G — read-only subject detail view. Returns:
 *   - subject metadata (name, code, academic + subject type)
 *   - every class the subject is allocated to, with teacher + initials
 *
 * Counterpart to /api/academics/classes/[id]/detail. Same single-
 * round-trip philosophy.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const subjectId = Number((await params).id);
  if (!subjectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // 1. Subject row
  const subjectRows = (await query(
    `SELECT id, name, code, subject_type, academic_type, deleted_at
       FROM subjects
      WHERE id = ? AND school_id = ?
      LIMIT 1`,
    [subjectId, session.schoolId],
  )) as Array<{ id: number; name: string; code: string | null; subject_type: string | null; academic_type: string | null; deleted_at: string | null }>;
  if (subjectRows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const subj = subjectRows[0];

  // 2. Classes this subject is taught in
  const classRows = (await query(
    `SELECT cs.id           AS allocation_id,
            c.id            AS class_id,
            c.name          AS class_name,
            c.level         AS class_level,
            c.program_name,
            cs.teacher_id,
            cs.custom_initials,
            CONCAT_WS(' ', p.first_name, p.last_name) AS teacher_name,
            CONCAT(UPPER(LEFT(p.first_name, 1)), UPPER(LEFT(p.last_name, 1))) AS auto_initials
       FROM class_subjects cs
       JOIN classes  c  ON c.id  = cs.class_id
       LEFT JOIN staff  s  ON s.id  = cs.teacher_id
       LEFT JOIN people p  ON p.id  = s.person_id
      WHERE cs.subject_id = ?
        AND c.school_id   = ?
      ORDER BY c.name`,
    [subjectId, session.schoolId],
  )) as Array<{
    allocation_id: number; class_id: number; class_name: string; class_level: string | null;
    program_name: string | null;
    teacher_id: number | null; custom_initials: string | null;
    teacher_name: string | null; auto_initials: string | null;
  }>;

  return NextResponse.json({
    subject: {
      id:           subj.id,
      name:         subj.name,
      code:         subj.code,
      subjectType:  subj.subject_type,
      academicType: subj.academic_type,
      deletedAt:    subj.deleted_at,
    },
    classes: classRows.map(r => ({
      allocationId: r.allocation_id,
      classId:      r.class_id,
      className:    r.class_name,
      classLevel:   r.class_level,
      programName:  r.program_name,
      teacherId:    r.teacher_id,
      teacherName:  r.teacher_name,
      initials:     r.custom_initials || r.auto_initials,
    })),
  });
}
