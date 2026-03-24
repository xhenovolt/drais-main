export const runtime = "nodejs";

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/students/list
 * 
 * Returns paginated list of students with search and filtering.
 * Supports bulk selection for batch operations.
 * 
 * OPTIONAL QUERY PARAMETERS:
 * - search: Search by name or admission_no (LIKE %search%)
 * - status: Filter by status (active, left, graduated, suspended)
 * - class_id: Filter by class
 * - page: Page number (default 1, 50 per page)
 * - limit: Records per page (default 50, max 500)
 * 
 * Security:
 * - Requires authentication
 * - Filters by school_id directly
 * - Respects soft deletes (deleted_at IS NULL)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    
    // Query parameters
    const search = req.nextUrl.searchParams.get('search') || '';
    const status = req.nextUrl.searchParams.get('status') || '';
    const classId = req.nextUrl.searchParams.get('class_id') || '';
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'));
    const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') || '50'));

    // Build WHERE clause
    let whereClause = 's.school_id = ? AND s.deleted_at IS NULL';
    const params: any[] = [schoolId];

    if (search.trim()) {
      whereClause += ` AND (p.first_name LIKE ? OR p.last_name LIKE ? OR s.admission_no LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (status.trim()) {
      whereClause += ' AND s.status = ?';
      params.push(status);
    }

    if (classId.trim()) {
      whereClause += ` AND e.class_id = ? AND e.status = 'active'`;
      params.push(parseInt(classId));
    }

    // Get total count
    const [countResult]: any = await conn.execute(
      `SELECT COUNT(DISTINCT s.id) as total FROM students s
       LEFT JOIN people p ON s.person_id = p.id
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id
       WHERE ${whereClause}`,
      params
    );

    const total = countResult[0].total;
    const pages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Get paginated students
    const [rows]: any = await conn.execute(`
      SELECT DISTINCT
        s.id,
        s.admission_no,
        s.status,
        s.enrollment_date,
        s.left_at,
        s.left_reason,
        p.first_name,
        p.last_name,
        p.gender,
        p.photo_url,
        c.name AS class_name,
        c.id AS class_id,
        st.name AS stream_name,
        (SELECT COUNT(*) FROM results r 
         WHERE r.student_id = s.id AND r.school_id = s.school_id) AS result_count
      FROM students s
      LEFT JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id 
        AND e.school_id = s.school_id 
        AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      WHERE ${whereClause}
      GROUP BY s.id
      ORDER BY p.last_name, p.first_name
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      pages,
      data: rows
    });
  } catch (error: any) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch students' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
