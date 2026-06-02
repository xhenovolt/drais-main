/**
 * GET /api/staff/[id]/teaching-load
 *
 * Phase G — read-only "what does this teacher teach" view. Returns
 * the full (class × subject) allocation graph for one staff member,
 * scoped to the caller's school. Used by /staff/[id] for the
 * Teaching load section.
 *
 * Returns an empty array when the staff member is not allocated to
 * any class_subjects — this includes admin / support / non-teaching
 * staff. Never errors on "they teach nothing".
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const staffId = Number((await params).id);
  if (!staffId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Confirm the staff member belongs to the caller's school before
  // disclosing their teaching graph. Returns 404 (not 403) on
  // cross-tenant lookups so attackers can't probe ids.
  const staffRows = (await query(
    `SELECT id FROM staff WHERE id = ? AND school_id = ? LIMIT 1`,
    [staffId, session.schoolId],
  )) as Array<{ id: number }>;
  if (staffRows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = (await query(
    `SELECT cs.id              AS allocation_id,
            c.id               AS class_id,
            c.name             AS class_name,
            c.level            AS class_level,
            c.program_name,
            sub.id             AS subject_id,
            sub.name           AS subject_name,
            sub.code           AS subject_code,
            sub.subject_type,
            sub.academic_type,
            cs.custom_initials
       FROM class_subjects cs
       JOIN classes  c  ON c.id  = cs.class_id
       JOIN subjects sub ON sub.id = cs.subject_id
      WHERE cs.teacher_id = ?
        AND c.school_id   = ?
      ORDER BY c.name, sub.name`,
    [staffId, session.schoolId],
  )) as Array<{
    allocation_id: number; class_id: number; class_name: string; class_level: string | null;
    program_name: string | null;
    subject_id: number; subject_name: string; subject_code: string | null;
    subject_type: string | null; academic_type: string | null;
    custom_initials: string | null;
  }>;

  return NextResponse.json({
    allocations: rows.map(r => ({
      allocationId: r.allocation_id,
      classId:      r.class_id,
      className:    r.class_name,
      classLevel:   r.class_level,
      programName:  r.program_name,
      subjectId:    r.subject_id,
      subjectName:  r.subject_name,
      subjectCode:  r.subject_code,
      subjectType:  r.subject_type,
      academicType: r.academic_type,
      initials:     r.custom_initials,
    })),
    count: rows.length,
  });
}
