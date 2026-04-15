export const runtime = "nodejs";

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/students/list
 * 
 * ⚠️ CRITICAL: This endpoint returns ALL STUDENTS (600+) for the school.
 * NO enrollment join filtering - admission and enrollment are SEPARATE concerns.
 * 
 * OPTIONAL QUERY PARAMETERS:
 * - search: Search by name or admission_no (LIKE %search%)
 * - status: Filter by status (active, left, graduated, suspended)
 * - view: "all" | "enrolled" | "admitted" (default: "all")
 * 
 * REMOVED: pagination, classId filtering (use separate endpoints)
 * Frontend will handle pagination if needed.
 * 
 * Security:
 * - Requires authentication
 * - Filters by school_id = ? (MANDATORY on all queries, NOexceptions)
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
    const view = req.nextUrl.searchParams.get('view') || 'all'; // all | enrolled | admitted

    // Build base WHERE clause (NO enrollment dependency)
    let whereClause = 's.school_id = ? AND s.deleted_at IS NULL';
    const params: any[] = [schoolId];

    // Apply search filter (works independently of enrollment)
    if (search.trim()) {
      whereClause += ` AND (
        LOWER(p.first_name) LIKE LOWER(?) 
        OR LOWER(p.last_name) LIKE LOWER(?) 
        OR s.admission_no LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Apply status filter
    if (status.trim() && ['active', 'left', 'graduated', 'suspended'].includes(status)) {
      whereClause += ' AND s.status = ?';
      params.push(status);
    }

    // Get total count (BEFORE pagination, full dataset)
    let countQuery = `SELECT COUNT(DISTINCT s.id) as total FROM students s
                      JOIN people p ON s.person_id = p.id`;

    if (view === 'enrolled') {
      countQuery += ` INNER JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id`;
    } else if (view === 'admitted') {
      countQuery += ` LEFT JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id`;
      whereClause += ' AND e.id IS NULL';
    }

    countQuery += ` WHERE ${whereClause}`;

    const [countResult]: any = await conn.execute(countQuery, params);
    const total = countResult[0].total;

    // Get students (NO PAGINATION - return all matching records)
    let selectQuery = `SELECT DISTINCT
        s.id,
        s.person_id,
        s.admission_no,
        s.status,
        s.admission_date,
        p.first_name,
        p.last_name,
        p.gender,
        p.date_of_birth,
        p.photo_url,
        (SELECT COUNT(*) FROM enrollments WHERE student_id = s.id AND school_id = s.school_id) as enrollment_count,
        (SELECT COUNT(*) FROM results WHERE student_id = s.id AND school_id = s.school_id) as result_count
      FROM students s
      JOIN people p ON s.person_id = p.id`;

    if (view === 'enrolled') {
      selectQuery += ` INNER JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id`;
    } else if (view === 'admitted') {
      selectQuery += ` LEFT JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id`;
    }

    selectQuery += ` WHERE ${whereClause}
      ORDER BY p.first_name ASC, p.last_name ASC`;

    const [rows]: any = await conn.execute(selectQuery, params);

    // Validation: log counts for debugging
    console.log(`[STUDENTS LIST] school_id=${schoolId}, view=${view}, search='${search}', status='${status}', returned=${rows.length}, total=${total}`);

    return NextResponse.json({
      success: true,
      view,
      total,
      returned: rows.length,
      school_id: schoolId,
      data: rows
    });
  } catch (error: any) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch students' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
