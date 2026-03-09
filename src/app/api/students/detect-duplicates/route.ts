import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * Detect potential duplicate learners by name and class
 * POST /api/students/detect-duplicates
 */
export async function POST(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { first_name, last_name, class_id, exclude_id } = body;

    if (!first_name || !last_name) {
      return NextResponse.json(
        { success: false, error: 'First and last names are required' },
        { status: 400 }
      );
    }

    const connection = await getConnection();
    try {
      // Search for students with same name
      let sql = `
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
          e.class_id
        FROM students s
        JOIN people p ON s.person_id = p.id
        LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
        LEFT JOIN classes c ON e.class_id = c.id
        WHERE s.school_id = ?
          AND LOWER(p.first_name) = LOWER(?)
          AND LOWER(p.last_name) = LOWER(?)
          AND s.deleted_at IS NULL
      `;
      
      const params: any[] = [schoolId, first_name, last_name];

      // Exclude current student if provided
      if (exclude_id) {
        sql += ` AND s.id != ?`;
        params.push(exclude_id);
      }

      // Filter by class if provided
      if (class_id) {
        sql += ` AND (e.class_id = ? OR e.class_id IS NULL)`;
        params.push(class_id);
      }

      sql += ` ORDER BY s.admission_date DESC`;

      const [duplicates] = await connection.execute(sql, params);

      return NextResponse.json({
        success: true,
        found: Array.isArray(duplicates) && duplicates.length > 0,
        count: Array.isArray(duplicates) ? duplicates.length : 0,
        duplicates: duplicates || [],
      });
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Error detecting duplicates:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
