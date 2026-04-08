import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    // Fetch class_results (term-based) scoped to school via students.school_id
    const classResults = await query(
      `SELECT
         cr.id,
         cr.student_id,
         CONCAT(p.first_name, ' ', p.last_name) AS student_name,
         c.name AS class_name,
         sub.name AS subject_name,
         t.name AS term_name,
         rt.name AS result_type,
         cr.score,
         cr.grade,
         cr.remarks,
         'class_results' AS table_type,
         cr.class_id,
         cr.subject_id,
         cr.term_id,
         cr.result_type_id
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id AND s.school_id = ? AND s.deleted_at IS NULL
       JOIN people p ON p.id = s.person_id
       LEFT JOIN classes c ON c.id = cr.class_id
       LEFT JOIN subjects sub ON sub.id = cr.subject_id
       LEFT JOIN terms t ON t.id = cr.term_id
       LEFT JOIN result_types rt ON rt.id = cr.result_type_id
       ORDER BY p.first_name, p.last_name, sub.name
       LIMIT 500`,
      [schoolId]
    );

    return NextResponse.json({
      success: true,
      data: classResults
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch editable results'
    }, { status: 500 });
  }
}
