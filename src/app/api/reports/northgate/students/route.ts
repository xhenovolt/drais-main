import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// ============================================================================
// GET /api/reports/northgate/students
//
// Lists students for the Northgate report card generator UI.
// Returns students with their current class + stream enrollment.
//
// Query params:
//   class_id  (optional — filter by class)
//   term_id   (optional — filter enrollment by term)
//   query     (optional — search by name or admission_no)
// ============================================================================

const NORTHGATE_SCHOOL_ID = 6;

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.schoolId !== NORTHGATE_SCHOOL_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('class_id') ? Number(searchParams.get('class_id')) : null;
  const termId  = searchParams.get('term_id')  ? Number(searchParams.get('term_id'))  : null;
  const query   = searchParams.get('query')?.trim() ?? '';

  let conn: any;
  try {
    conn = await getConnection();

    // ── Classes for this school (for dropdown) ────────────────────────────────
    const [classRows]: any = await conn.execute(
      `SELECT c.id, c.name
       FROM classes c
       WHERE c.school_id = ?
       ORDER BY c.name ASC`,
      [NORTHGATE_SCHOOL_ID],
    );

    // ── Terms (for dropdown) ─────────────────────────────────────────────────
    const [termRows]: any = await conn.execute(
      `SELECT t.id, t.name, ay.name AS academic_year
       FROM terms t
       LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
       ORDER BY t.id DESC
       LIMIT 20`,
    );

    // ── Student list ─────────────────────────────────────────────────────────
    const params: any[] = [NORTHGATE_SCHOOL_ID];
    let where = 'WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.status = \'active\'';

    if (classId) {
      where += ' AND e.class_id = ?';
      params.push(classId);
    }
    if (termId) {
      where += ' AND e.term_id = ?';
      params.push(termId);
    }
    if (query) {
      where += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR s.admission_no LIKE ?)';
      const like = `%${query}%`;
      params.push(like, like, like);
    }

    const [studentRows]: any = await conn.execute(
      `SELECT s.id, s.admission_no,
              p.first_name, p.last_name, p.photo_url,
              COALESCE(c.name,  '') AS class_name,
              COALESCE(st.name, '') AS stream_name,
              e.class_id, e.term_id
       FROM students s
       JOIN   people     p  ON p.id  = s.person_id
       LEFT JOIN enrollments e  ON e.student_id = s.id
         AND e.id = (
           SELECT MAX(ei.id) FROM enrollments ei
           WHERE ei.student_id = s.id
             ${termId  ? 'AND ei.term_id = ' + Number(termId)  : ''}
             ${classId ? 'AND ei.class_id = ' + Number(classId) : ''}
         )
       LEFT JOIN classes   c  ON c.id  = e.class_id
       LEFT JOIN streams   st ON st.id = e.stream_id
       ${where}
       ORDER BY c.name ASC, p.last_name ASC, p.first_name ASC
       LIMIT 500`,
      params,
    );

    return NextResponse.json({
      success: true,
      classes: classRows,
      terms:   termRows,
      students: studentRows.map((s: any) => ({
        id:           s.id,
        admission_no: s.admission_no,
        full_name:    `${s.first_name} ${s.last_name}`,
        photo_url:    s.photo_url,
        class_name:   s.class_name,
        stream_name:  s.stream_name,
        class_id:     s.class_id,
        term_id:      s.term_id,
      })),
    });
  } catch (error: any) {
    console.error('[northgate/students]', error);
    return NextResponse.json({ error: 'Failed to load students' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
