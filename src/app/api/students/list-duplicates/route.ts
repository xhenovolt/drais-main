import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * List all potential duplicate learners in the system
 * GET /api/students/list-duplicates?school_id=1
 */
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below

    const connection = await getConnection();
    try {
      // Find groups of students with same first and last names
      const [duplicateGroups]: any = await connection.execute(`
        SELECT 
          LOWER(p.first_name) as first_name_lower,
          LOWER(p.last_name) as last_name_lower,
          COUNT(*) as count,
          GROUP_CONCAT(s.id) as student_ids
        FROM students s
        JOIN people p ON s.person_id = p.id
        WHERE s.school_id = ?
          AND s.deleted_at IS NULL
        GROUP BY LOWER(p.first_name), LOWER(p.last_name)
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
      `, [schoolId]);

      // Fetch detailed information for each duplicate group
      const detailedDuplicates = await Promise.all(
        duplicateGroups.map(async (group: any) => {
          const ids = group.student_ids.split(',').map((id: string) => parseInt(id, 10));
          
          const [students]: any = await connection.execute(`
            SELECT 
              s.id,
              s.admission_no,
              s.school_id,
              s.admission_date,
              s.status,
              p.first_name,
              p.last_name,
              p.gender,
              p.date_of_birth,
              p.photo_url,
              c.name as class_name,
              e.class_id,
              e.status as enrollment_status
            FROM students s
            JOIN people p ON s.person_id = p.id
            LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
            LEFT JOIN classes c ON e.class_id = c.id
            WHERE s.id IN (${ids.join(',')})
              AND s.school_id = ?
              AND s.deleted_at IS NULL
            ORDER BY s.admission_date DESC
          `, [schoolId]);

          return {
            group_key: `${group.first_name_lower}|${group.last_name_lower}`,
            name: students[0]?.first_name + ' ' + students[0]?.last_name,
            count: group.count,
            students: students
          };
        })
      );

      return NextResponse.json({
        success: true,
        data: detailedDuplicates,
        total: detailedDuplicates.length
      });

    } finally {
      await connection.end();
    }

  } catch (error: any) {
    console.error('List duplicates error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to list duplicates'
    }, { status: 500 });
  }
}
