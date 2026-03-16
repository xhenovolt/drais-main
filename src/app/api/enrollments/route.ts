import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Enrollments API
 * GET /api/enrollments — List enrollments with filters
 * POST /api/enrollments — Create new enrollment (for promotion or new year)
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const studentId = req.nextUrl.searchParams.get('student_id');
    const classId = req.nextUrl.searchParams.get('class_id');
    const academicYearId = req.nextUrl.searchParams.get('academic_year_id');
    const status = req.nextUrl.searchParams.get('status');

    let where = 'WHERE e.school_id = ?';
    const params: any[] = [schoolId];

    if (studentId) {
      where += ' AND e.student_id = ?';
      params.push(studentId);
    }
    if (classId) {
      where += ' AND e.class_id = ?';
      params.push(classId);
    }
    if (academicYearId) {
      where += ' AND e.academic_year_id = ?';
      params.push(academicYearId);
    }
    if (status) {
      where += ' AND e.status = ?';
      params.push(status);
    }

    const [rows]: any = await conn.execute(`
      SELECT
        e.id AS enrollment_id,
        e.student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        e.class_id,
        c.name AS class_name,
        c.level AS class_level,
        e.stream_id,
        st.name AS stream_name,
        e.academic_year_id,
        ay.name AS academic_year_name,
        e.term_id,
        t.name AS term_name,
        e.status,
        e.enrollment_date,
        e.end_date,
        e.end_reason
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      LEFT JOIN terms t ON e.term_id = t.id
      ${where}
      ORDER BY ay.start_date DESC, e.id DESC
    `, params);

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    return NextResponse.json({ error: 'Failed to fetch enrollments' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

/**
 * POST - Create enrollment for promotion or new academic year
 * Body: { student_id, class_id, stream_id?, academic_year_id, term_id?,
 *         close_previous?: boolean }
 * 
 * If close_previous is true, marks previous active enrollment as 'completed'
 */
export async function POST(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const { student_id, class_id, stream_id, academic_year_id, term_id, close_previous } = body;

    if (!student_id || !class_id) {
      return NextResponse.json({ error: 'student_id and class_id are required' }, { status: 400 });
    }

    await conn.execute('START TRANSACTION');

    try {
      // Close previous active enrollments if requested
      if (close_previous) {
        await conn.execute(`
          UPDATE enrollments
          SET status = 'completed', end_date = CURDATE(), end_reason = 'promoted'
          WHERE student_id = ? AND school_id = ? AND status = 'active'
        `, [student_id, schoolId]);
      }

      // Create new enrollment
      const now = Math.floor(Date.now() / 1000);
      const [result]: any = await conn.execute(`
        INSERT INTO enrollments
          (school_id, student_id, class_id, stream_id, academic_year_id, term_id, status, enrollment_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', CURDATE(), ?)
      `, [schoolId, student_id, class_id, stream_id || null, academic_year_id || null, term_id || null, now]);

      await conn.execute('COMMIT');

      return NextResponse.json({
        success: true,
        data: { enrollment_id: result.insertId },
        message: 'Enrollment created'
      });
    } catch (txError) {
      await conn.execute('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Error creating enrollment:', error);
    return NextResponse.json({ error: 'Failed to create enrollment' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
