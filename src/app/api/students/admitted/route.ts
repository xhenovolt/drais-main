import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getCurrentTerm } from '@/lib/terms';

/**
 * GET /api/students/admitted
 *
 * Returns students who have been admitted but are NOT enrolled in the
 * current active term. Used by the "Admitted" tab in the students module.
 * School isolation enforced: only returns data for authenticated school.
 *
 * Query params:
 *   search  — filter by name or admission_no (optional)
 *
 * ALL results returned (no backend pagination — frontend handles).
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search')?.trim();

  const conn = await getConnection();
  try {
    // Resolve current term for this school
    const currentTerm = await getCurrentTerm(schoolId);
    const currentTermId = currentTerm?.id ?? null;

    const conditions: string[] = ['s.school_id = ?', 's.deleted_at IS NULL'];
    const params: any[] = [schoolId];

    // Exclude students who have an active enrollment in the current term.
    // The subquery avoids e.school_id and e.deleted_at because these columns
    // may not exist before migration 020 has been applied.  Tenant isolation is
    // already enforced by the outer s.school_id = ? condition; term isolation
    // and status = 'active' are sufficient to identify enrolled students.
    if (currentTermId) {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.student_id = s.id
          AND e.term_id    = ?
          AND e.status     = 'active'
      )`);
      params.push(currentTermId);
    }

    if (search) {
      conditions.push('(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR s.admission_no LIKE ? OR LOWER(CONCAT(p.last_name, \' \', p.first_name)) LIKE ? OR LOWER(CONCAT(p.first_name, \' \', p.last_name)) LIKE ?)');
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like, like, like);
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    // Fetch all admitted students (no pagination — frontend handles)
    const [rows] = await conn.execute<any[]>(
      `SELECT
         s.id,
         s.person_id,
         s.admission_no,
         s.status,
         s.admission_date,
         p.first_name,
         p.last_name,
         p.other_name,
         p.gender,
         p.date_of_birth,
         p.photo_url,
         p.phone,
         p.email
       FROM students s
       LEFT JOIN people p ON s.person_id = p.id
       ${where}
       ORDER BY p.first_name ASC, p.last_name ASC`,
      [...params]
    );

    console.log(`[ADMITTED STUDENTS] school=${schoolId}, returned=${rows.length}, term=${currentTermId}`);

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        total: rows.length,
        current_term_id: currentTermId,
        current_term_name: currentTerm?.name ?? null,
      },
    });
  } catch (err) {
    console.error('[students/admitted] error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch admitted students' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
