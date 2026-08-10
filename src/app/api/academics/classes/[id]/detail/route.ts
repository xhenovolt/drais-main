/**
 * GET /api/academics/classes/[id]/detail
 *
 * Phase G — read-only class detail view. Returns:
 *   - class metadata (name, level, capacity)
 *   - subjects allocated to the class (joined with teacher + custom
 *     initials when present)
 *   - current + historical class-teacher assignments
 *
 * Single round-trip so the page can render without N+1 fetches.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { listClassTeachers } from '@/lib/services/class-teachers';
import { checkModule } from '@/lib/auth/requireModule';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;
  const classId = Number((await params).id);
  if (!classId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // 1. Class row
  const [classRows] = [(await query(
    `SELECT id, name, level, capacity, program_name, deleted_at
       FROM classes
      WHERE id = ? AND school_id = ?
      LIMIT 1`,
    [classId, session.schoolId],
  )) as Array<{ id: number; name: string; level: string | null; capacity: number | null; program_name: string | null; deleted_at: string | null }>];
  if (classRows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const cls = classRows[0];

  // 2. Allocations (subjects × teachers × custom initials) for this class
  const subjectRows = (await query(
    `SELECT cs.id           AS allocation_id,
            sub.id          AS subject_id,
            sub.name        AS subject_name,
            sub.code        AS subject_code,
            sub.subject_type,
            sub.academic_type,
            cs.teacher_id,
            cs.custom_initials,
            CONCAT_WS(' ', p.first_name, p.last_name) AS teacher_name,
            CONCAT(UPPER(LEFT(p.first_name, 1)), UPPER(LEFT(p.last_name, 1))) AS auto_initials
       FROM class_subjects cs
       JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN staff  s  ON s.id  = cs.teacher_id
       LEFT JOIN people p  ON p.id  = s.person_id
      WHERE cs.class_id = ?
        AND sub.school_id = ?
      ORDER BY sub.name`,
    [classId, session.schoolId],
  )) as Array<{
    allocation_id: number; subject_id: number; subject_name: string; subject_code: string | null;
    subject_type: string | null; academic_type: string | null;
    teacher_id: number | null; custom_initials: string | null;
    teacher_name: string | null; auto_initials: string | null;
  }>;

  // 3. Class-teacher history
  const classTeachers = await listClassTeachers({ classId, schoolId: session.schoolId });

  // 4. Enrollment count (active learners)
  const [enrolRows] = [(await query(
    `SELECT COUNT(*) AS n
       FROM enrollments
      WHERE class_id = ? AND status = 'active'`,
    [classId],
  )) as Array<{ n: number }>];

  return NextResponse.json({
    class: {
      id:          cls.id,
      name:        cls.name,
      level:       cls.level,
      capacity:    cls.capacity,
      programName: cls.program_name,
      deletedAt:   cls.deleted_at,
      activeEnrollments: Number(enrolRows[0]?.n ?? 0),
    },
    subjects: subjectRows.map(r => ({
      allocationId:  r.allocation_id,
      subjectId:     r.subject_id,
      subjectName:   r.subject_name,
      subjectCode:   r.subject_code,
      subjectType:   r.subject_type,
      academicType:  r.academic_type,
      teacherId:     r.teacher_id,
      teacherName:   r.teacher_name,
      initials:      r.custom_initials || r.auto_initials,
    })),
    classTeachers,
  });
}
