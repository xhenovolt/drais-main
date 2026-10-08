import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
import { getDbMode } from '@/lib/db/db-mode';

/**
 * local-sqlite branch — Phase 7 sub-effort 35, same §25a pattern. Unlike
 * every prior Students sub-page, `class_results` is LARGE_EXCLUDED from
 * the lean export (sub-effort 23) — the same fact /students/[id]/
 * previous-enrollment's branch already documents — so `academic_results`
 * is always `[]`/zero-averages offline, in every mode (grid summary, list,
 * and per-student detail). That's not a gap this branch introduces, it's
 * the same real limitation every result-reading page in this phase has
 * inherited; a real student with no exam data looks identical. What IS
 * real and DOES work offline: `enrollment_history` (translated the same
 * way previous-enrollment's branch does) and the student list/search used
 * to build the grid. `student_history` mirrors the online fix above —
 * always `[]`, since that query was dead everywhere, not just offline.
 */
async function offlineGetHistory(schoolId: number, searchParams: URLSearchParams) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const db = getSqliteDb();
  const studentId = searchParams.get('student_id');

  if (!studentId) {
    const search = searchParams.get('q');
    const view = searchParams.get('view') === 'list' ? 'list' : 'grid';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(view === 'list' ? 200 : 100, Math.max(1, parseInt(searchParams.get('limit') || (view === 'list' ? '50' : '24'), 10) || 24));
    const offset = (page - 1) * limit;

    if (view === 'list') {
      // class_results is LARGE_EXCLUDED — always empty offline, same as online
      // would be for a school with zero results recorded.
      return NextResponse.json({ success: true, data: { academic_results: [] }, pagination: { page, limit, total: 0, pages: 1 } });
    }

    const where = `WHERE s.school_id = ? AND s.deleted_at IS NULL${search ? ' AND (p.first_name LIKE ? OR p.last_name LIKE ?)' : ''}`;
    const params: any[] = search ? [schoolId, `%${search}%`, `%${search}%`] : [schoolId];
    const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM students s JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL ${where}`).get(...params) as any;
    const total = Number(totalRow?.total || 0);
    const summaryRows = db.prepare(`
      SELECT s.id AS student_id, p.first_name, p.last_name, s.admission_no,
        0 AS result_count, NULL AS average_score, NULL AS last_result_at
      FROM students s JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      ${where}
      ORDER BY COALESCE(p.last_name, '') ASC, COALESCE(p.first_name, '') ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return NextResponse.json({
      success: true,
      data: { student_summaries: summaryRows },
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  }

  const enrollmentRows = db.prepare(`
    SELECT
      e.id AS enrollment_id, e.student_id,
      c.id AS class_id, c.name AS class_name, c.class_level AS class_level,
      st.name AS stream_name,
      ay.id AS academic_year_id, ay.name AS academic_year_name,
      t.name AS term_name,
      e.status AS enrollment_status, e.enrollment_date, e.end_date, e.end_reason
    FROM enrollments e
    JOIN students s ON e.student_id = s.id AND s.deleted_at IS NULL
    LEFT JOIN classes c ON e.class_id = c.id
    LEFT JOIN streams st ON e.stream_id = st.id
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    LEFT JOIN terms t ON e.term_id = t.id
    WHERE s.school_id = ? AND e.student_id = ?
    ORDER BY ay.start_date DESC, e.id DESC
  `).all(schoolId, studentId);

  return NextResponse.json({
    success: true,
    data: { academic_results: [], student_history: [], enrollment_history: enrollmentRows },
  });
}

export async function GET(req: NextRequest) {
  let connection;

  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const studentId = searchParams.get('student_id');

    if (getDbMode() === 'local-sqlite') {
      return offlineGetHistory(schoolId, searchParams);
    }

    connection = await getConnection();

    // Without a student_id, this previously returned EVERY class_results row
    // for EVERY student in the whole school (every subject × every term ×
    // every student — the worst-case multiplier of any route in this sweep),
    // plus every student_history and enrollment row, all with NO limit, on a
    // 30s poll, then grouped client-side into a "browse all students" grid.
    // Same shape of bug that froze /finance/fees, at a much larger scale.
    // Fixed: the "browse all" case now returns a compact, paginated PER-
    // STUDENT SUMMARY (one row per student, aggregated server-side) instead
    // of raw rows — the page only needs counts/averages for the grid, and
    // fetches full detail via the (already scoped, already safe) student_id
    // path below when an operator drills into one student.
    if (!studentId) {
      const search = searchParams.get('q');
      const view = searchParams.get('view') === 'list' ? 'list' : 'grid';
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
      const limit = Math.min(view === 'list' ? 200 : 100, Math.max(1, parseInt(searchParams.get('limit') || (view === 'list' ? '50' : '24'), 10) || 24));
      const offset = (page - 1) * limit;

      if (view === 'list') {
        // List mode wants individual RESULT rows (student/subject/term/score),
        // not a per-student aggregate — paginate the same query the detail
        // path below uses, rather than dumping every row for every student.
        const baseFrom = `
          FROM class_results cr
          JOIN students s ON cr.student_id = s.id AND s.deleted_at IS NULL
          JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
          LEFT JOIN classes c ON cr.class_id = c.id
          LEFT JOIN subjects sub ON cr.subject_id = sub.id
          LEFT JOIN terms t ON cr.term_id = t.id
          LEFT JOIN result_types rt ON cr.result_type_id = rt.id
          LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
          WHERE s.school_id = ?
        `;
        const params: any[] = [schoolId];
        let filters = '';
        if (search) {
          filters += ' AND (p.first_name LIKE ? OR p.last_name LIKE ?)';
          const like = `%${search}%`;
          params.push(like, like);
        }
        const [countRows]: any = await connection.execute(`SELECT COUNT(*) AS total ${baseFrom}${filters}`, params);
        const total = Number(countRows?.[0]?.total || 0);
        const [rows] = await connection.execute(
          `SELECT cr.id, cr.student_id, cr.class_id, cr.subject_id, cr.term_id, cr.score, cr.grade, cr.remarks, cr.created_at,
                  p.first_name, p.last_name, s.admission_no, c.name AS class_name,
                  sub.name AS subject_name, sub.code AS subject_code, t.name AS term_name,
                  rt.name AS result_type_name, ay.name AS academic_year
             ${baseFrom}${filters}
            ORDER BY cr.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`,
          params,
        );
        return NextResponse.json({
          success: true,
          data: { academic_results: rows },
          pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
        });
      }

      const baseFrom = `
        FROM students s
        JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
        WHERE s.school_id = ? AND s.deleted_at IS NULL
      `;
      const params: any[] = [schoolId];
      let filters = '';
      if (search) {
        filters += ' AND (p.first_name LIKE ? OR p.last_name LIKE ?)';
        const like = `%${search}%`;
        params.push(like, like);
      }

      const [countRows]: any = await connection.execute(`SELECT COUNT(*) AS total ${baseFrom}${filters}`, params);
      const total = Number(countRows?.[0]?.total || 0);

      const [summaryRows] = await connection.execute(
        `SELECT s.id AS student_id, p.first_name, p.last_name, s.admission_no,
                COUNT(cr.id) AS result_count,
                ROUND(AVG(cr.score), 1) AS average_score,
                MAX(cr.created_at) AS last_result_at
           ${baseFrom}${filters}
           LEFT JOIN class_results cr ON cr.student_id = s.id
          GROUP BY s.id, p.first_name, p.last_name, s.admission_no
          ORDER BY COALESCE(p.last_name, '') ASC, COALESCE(p.first_name, '') ASC
          LIMIT ${limit} OFFSET ${offset}`,
        params,
      );

      return NextResponse.json({
        success: true,
        data: { student_summaries: summaryRows },
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      });
    }

    // Get academic history from class_results
    let sql = `
      SELECT 
        cr.id,
        cr.student_id,
        cr.class_id,
        cr.subject_id,
        cr.term_id,
        cr.score,
        cr.grade,
        cr.remarks,
        cr.created_at,
        p.first_name,
        p.last_name,
        s.admission_no,
        c.name as class_name,
        sub.name as subject_name,
        sub.code as subject_code,
        t.name as term_name,
        rt.name as result_type_name,
        ay.name as academic_year
      FROM class_results cr
      JOIN students s ON cr.student_id = s.id AND s.deleted_at IS NULL
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN classes c ON cr.class_id = c.id
      LEFT JOIN subjects sub ON cr.subject_id = sub.id
      LEFT JOIN terms t ON cr.term_id = t.id
      LEFT JOIN result_types rt ON cr.result_type_id = rt.id
      LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
      WHERE s.school_id = ?
    `;

    const params = [schoolId];

    if (studentId) {
      sql += ' AND cr.student_id = ?';
      params.push(parseInt(studentId, 10));
    }

    sql += ' ORDER BY COALESCE(p.last_name, \'\') ASC, COALESCE(p.first_name, \'\') ASC, t.name DESC, sub.name';

    const [academicRows] = await connection.execute(sql, params);

    // `student_history` here is dead: this used to query
    // no_of_juzus_memorized/previous_school/previous_school_year/
    // previous_class_theology/previous_class_secular, none of which exist
    // on the real `student_history` table (confirmed live against TiDB —
    // that table is actually an action/details/performed_by audit log, a
    // different feature entirely) or anywhere else in the schema. The
    // frontend destructures `student_history` but never renders it. This
    // previously 500'd the WHOLE response (including the academic_results
    // and enrollment_history the page DOES use) any time a studentId was
    // passed. Fixed by dropping the broken query rather than guessing at
    // columns that were never migrated — returns an empty array, which is
    // what every caller already effectively got (via the 500) anyway.
    const historyRows: unknown[] = [];

    // Get enrollment history (for lifecycle tracking)
    let enrollmentSQL = `
      SELECT
        e.id AS enrollment_id,
        e.student_id,
        c.id AS class_id,
        c.name AS class_name,
        c.level AS class_level,
        st.name AS stream_name,
        ay.id AS academic_year_id,
        ay.name AS academic_year_name,
        t.name AS term_name,
        e.status AS enrollment_status,
        e.enrollment_date,
        e.end_date,
        e.end_reason
      FROM enrollments e
      JOIN students s ON e.student_id = s.id AND s.deleted_at IS NULL
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      LEFT JOIN terms t ON e.term_id = t.id
      WHERE s.school_id = ?
    `;
    const enrollParams: any[] = [schoolId];

    if (studentId) {
      enrollmentSQL += ' AND e.student_id = ?';
      enrollParams.push(parseInt(studentId, 10));
    }

    enrollmentSQL += ' ORDER BY ay.start_date DESC, e.id DESC';

    const [enrollmentRows] = await connection.execute(enrollmentSQL, enrollParams);

    return NextResponse.json({
      success: true,
      data: {
        academic_results: academicRows,
        student_history: historyRows,
        enrollment_history: enrollmentRows
      }
    });

  } catch (error: any) {
    console.error('Academic history fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch academic history'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
