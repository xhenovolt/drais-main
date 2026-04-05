import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getCurrentTerm } from '@/lib/terms';

/**
 * GET /api/results/filtered
 * 
 * REQUIRED QUERY PARAMETERS:
 * - academic_year_id: The academic year (required)
 * - term_id: The term within that year (required)
 * 
 * OPTIONAL QUERY PARAMETERS:
 * - student_id: Filter by specific student
 * - class_id: Filter by specific class
 * - subject_id: Filter by specific subject
 * 
 * Returns detailed exam results filtered by term and academic year.
 * 
 * Security:
 * - Requires authentication
 * - Filters by school_id directly
 * - Academic year and term are REQUIRED (no unfiltered queries)
 * 
 * Response:
 * {
 *   "academic_year_id": 501,
 *   "academic_year_name": "2026",
 *   "term_id": 1001,
 *   "term_name": "Term 1",
 *   "results": [
 *     {
 *       "id": 5001,
 *       "student_id": 668,
 *       "admission_no": "ADM-001",
 *       "first_name": "John",
 *       "last_name": "Doe",
 *       "class_name": "Primary 5",
 *       "subject_name": "Mathematics",
 *       "score": 85,
 *       "grade": "A",
 *       "exam_name": "Mid Term"
 *     }
 *   ]
 * }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    
    // REQUIRED: academic_year_id and term_id
    const academicYearId = req.nextUrl.searchParams.get('academic_year_id');
    const termId = req.nextUrl.searchParams.get('term_id');
    
    if (!academicYearId || !termId) {
      return NextResponse.json(
        { 
          error: 'Missing required parameters: academic_year_id and term_id',
          hint: 'Use /api/academic/current-term to get defaults'
        },
        { status: 400 }
      );
    }

    const ayId = parseInt(academicYearId, 10);
    const tId = parseInt(termId, 10);

    // OPTIONAL filters
    const studentId = req.nextUrl.searchParams.get('student_id');
    const classId = req.nextUrl.searchParams.get('class_id');
    const subjectId = req.nextUrl.searchParams.get('subject_id');

    let whereClause = `
      WHERE cr.school_id = ?
        AND cr.academic_year_id = ?
        AND cr.term_id = ?
    `;
    const params: any[] = [schoolId, ayId, tId];

    if (studentId) {
      whereClause += ' AND cr.student_id = ?';
      params.push(parseInt(studentId, 10));
    }
    if (classId) {
      whereClause += ' AND cr.class_id = ?';
      params.push(parseInt(classId, 10));
    }
    if (subjectId) {
      whereClause += ' AND cr.subject_id = ?';
      params.push(parseInt(subjectId, 10));
    }

    // Get academic year and term names
    const [ayData]: any = await conn.execute(
      'SELECT id, name FROM academic_years WHERE id = ? AND school_id = ?',
      [ayId, schoolId]
    );
    const [tData]: any = await conn.execute(
      'SELECT id, name FROM terms WHERE id = ? AND academic_year_id = ? AND school_id = ?',
      [tId, ayId, schoolId]
    );

    if (!ayData.length || !tData.length) {
      return NextResponse.json(
        { error: 'Invalid academic year or term for this school' },
        { status: 404 }
      );
    }

    const academicYearName = ayData[0].name;
    const termName = tData[0].name;

    // Fetch results with required school_id, academic_year_id, and term_id filters
    const [rows]: any = await conn.execute(`
      SELECT
        cr.id,
        cr.student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.gender,
        p.photo_url,
        cr.class_id,
        c.name AS class_name,
        cr.subject_id,
        sub.name AS subject_name,
        sub.code AS subject_code,
        sub.subject_type,
        cr.score,
        cr.grade,
        cr.remarks,
        st.name AS stream_name,
        ex.exam_date,
        rt.name AS result_type_name
      FROM class_results cr
      JOIN students s ON cr.student_id = s.id AND s.school_id = ?
      JOIN people p ON s.person_id = p.id
      LEFT JOIN classes c ON cr.class_id = c.id
      LEFT JOIN subjects sub ON cr.subject_id = sub.id
      LEFT JOIN streams st ON cr.stream_id = st.id
      LEFT JOIN exams ex ON ex.term_id = cr.term_id 
        AND ex.class_id = cr.class_id 
        AND ex.subject_id = cr.subject_id
      LEFT JOIN result_types rt ON cr.result_type_id = rt.id
      ${whereClause}
      ORDER BY p.last_name, p.first_name, sub.name
    `, [schoolId, ...params]);

    // Group by student for summary statistics
    const studentMap: Record<number, any> = {};
    for (const row of rows) {
      if (!studentMap[row.student_id]) {
        studentMap[row.student_id] = {
          student_id: row.student_id,
          admission_no: row.admission_no,
          first_name: row.first_name,
          last_name: row.last_name,
          gender: row.gender,
          photo_url: row.photo_url,
          class_name: row.class_name,
          stream_name: row.stream_name,
          results: []
        };
      }
      studentMap[row.student_id].results.push({
        id: row.id,
        subject_name: row.subject_name,
        subject_code: row.subject_code,
        score: row.score,
        grade: row.grade,
        remarks: row.remarks,
        result_type: row.result_type_name,
        exam_date: row.exam_date
      });
    }

    return NextResponse.json({
      academic_year_id: ayId,
      academic_year_name: academicYearName,
      term_id: tId,
      term_name: termName,
      school_id: schoolId,
      total_students: Object.keys(studentMap).length,
      results: Object.values(studentMap)
    });
  } catch (error) {
    console.error('Error fetching filtered results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch results' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
