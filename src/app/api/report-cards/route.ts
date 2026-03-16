import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Report Cards API
 * GET /api/report-cards — List report cards with filters
 * POST /api/report-cards — Generate report cards from class_results
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const studentId = req.nextUrl.searchParams.get('student_id');
    const termId = req.nextUrl.searchParams.get('term_id');
    const academicYearId = req.nextUrl.searchParams.get('academic_year_id');
    const classId = req.nextUrl.searchParams.get('class_id');

    let where = 'WHERE s.school_id = ?';
    const params: any[] = [schoolId];

    if (studentId) {
      where += ' AND rc.student_id = ?';
      params.push(studentId);
    }
    if (termId) {
      where += ' AND rc.term_id = ?';
      params.push(termId);
    }
    if (academicYearId) {
      where += ' AND (rc.academic_year_id = ? OR t.academic_year_id = ?)';
      params.push(academicYearId, academicYearId);
    }
    if (classId) {
      where += ' AND (rc.class_id = ? OR e.class_id = ?)';
      params.push(classId, classId);
    }

    const [rows]: any = await conn.execute(`
      SELECT
        rc.id AS report_card_id,
        rc.student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.gender,
        p.photo_url,
        COALESCE(rc.class_id, e.class_id) AS class_id,
        c.name AS class_name,
        st.name AS stream_name,
        rc.term_id,
        t.name AS term_name,
        COALESCE(rc.academic_year_id, t.academic_year_id) AS academic_year_id,
        COALESCE(ay.name, ay2.name) AS academic_year_name,
        rc.overall_grade,
        rc.class_teacher_comment,
        rc.headteacher_comment,
        rc.dos_comment,
        rc.report_date,
        rc.status AS report_status,
        rcm.total_score,
        rcm.average_score,
        rcm.position,
        rcm.promoted
      FROM report_cards rc
      JOIN students s ON rc.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN terms t ON rc.term_id = t.id
      LEFT JOIN academic_years ay ON rc.academic_year_id = ay.id
      LEFT JOIN academic_years ay2 ON t.academic_year_id = ay2.id
      LEFT JOIN enrollments e ON rc.enrollment_id = e.id
      LEFT JOIN classes c ON COALESCE(rc.class_id, e.class_id) = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN report_card_metrics rcm ON rc.id = rcm.report_card_id
      ${where}
      ORDER BY ay.start_date DESC, t.start_date DESC, p.first_name ASC
    `, params);

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching report cards:', error);
    return NextResponse.json({ error: 'Failed to fetch report cards' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

/**
 * POST - Generate report cards from class_results for a given term/class
 * Body: { term_id, class_id, academic_year_id?, comments?: { student_id: { class_teacher, headteacher, dos } } }
 */
export async function POST(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const { term_id, class_id, academic_year_id, comments } = body;

    if (!term_id || !class_id) {
      return NextResponse.json({ error: 'term_id and class_id are required' }, { status: 400 });
    }

    // Get academic year from term if not provided
    let yearId = academic_year_id;
    if (!yearId) {
      const [termRows]: any = await conn.execute(
        'SELECT academic_year_id FROM terms WHERE id = ?', [term_id]
      );
      if (termRows.length > 0) yearId = termRows[0].academic_year_id;
    }

    // Get all students with results for this class/term
    const [students]: any = await conn.execute(`
      SELECT DISTINCT
        cr.student_id,
        e.id AS enrollment_id,
        ROUND(SUM(cr.score), 2) AS total_score,
        ROUND(AVG(cr.score), 2) AS average_score,
        MIN(cr.score) AS min_score,
        MAX(cr.score) AS max_score,
        COUNT(DISTINCT cr.subject_id) AS subject_count
      FROM class_results cr
      LEFT JOIN enrollments e ON cr.student_id = e.student_id
        AND e.class_id = cr.class_id
        AND (e.academic_year_id = ? OR e.academic_year_id IS NULL)
        AND e.status = 'active'
      WHERE cr.class_id = ? AND cr.term_id = ?
      GROUP BY cr.student_id, e.id
      ORDER BY total_score DESC
    `, [yearId, class_id, term_id]);

    if (students.length === 0) {
      return NextResponse.json({ error: 'No results found for this class/term' }, { status: 404 });
    }

    // Calculate positions
    const studentsWithPositions = students.map((s: any, idx: number) => ({
      ...s,
      position: idx + 1,
    }));

    let created = 0;
    let updated = 0;

    await conn.execute('START TRANSACTION');

    try {
      for (const stu of studentsWithPositions) {
        const studentComments = comments?.[stu.student_id] || {};

        // Check if report card already exists for this student/term
        const [existing]: any = await conn.execute(
          `SELECT id FROM report_cards WHERE student_id = ? AND term_id = ?`,
          [stu.student_id, term_id]
        );

        let reportCardId: number;

        if (existing.length > 0) {
          reportCardId = existing[0].id;
          // Update existing report card
          await conn.execute(`
            UPDATE report_cards SET
              academic_year_id = ?,
              enrollment_id = ?,
              class_id = ?,
              class_teacher_comment = COALESCE(?, class_teacher_comment),
              headteacher_comment = COALESCE(?, headteacher_comment),
              dos_comment = COALESCE(?, dos_comment),
              report_date = CURDATE(),
              status = 'generated',
              updated_at = NOW()
            WHERE id = ?
          `, [
            yearId, stu.enrollment_id, class_id,
            studentComments.class_teacher || null,
            studentComments.headteacher || null,
            studentComments.dos || null,
            reportCardId
          ]);
          updated++;
        } else {
          // Create new report card
          const [ins]: any = await conn.execute(`
            INSERT INTO report_cards
              (school_id, student_id, term_id, academic_year_id, enrollment_id, class_id,
               class_teacher_comment, headteacher_comment, dos_comment, report_date, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'generated')
          `, [
            schoolId, stu.student_id, term_id, yearId, stu.enrollment_id, class_id,
            studentComments.class_teacher || null,
            studentComments.headteacher || null,
            studentComments.dos || null,
          ]);
          reportCardId = ins.insertId;
          created++;
        }

        // Upsert report_card_metrics
        await conn.execute(`
          INSERT INTO report_card_metrics (report_card_id, total_score, average_score, min_score, max_score, position, computed_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            total_score = VALUES(total_score),
            average_score = VALUES(average_score),
            min_score = VALUES(min_score),
            max_score = VALUES(max_score),
            position = VALUES(position),
            computed_at = NOW()
        `, [reportCardId, stu.total_score, stu.average_score, stu.min_score, stu.max_score, stu.position]);

        // Generate report_card_subjects from class_results
        const [subjectResults]: any = await conn.execute(`
          SELECT
            cr.subject_id,
            SUM(CASE WHEN rt.name LIKE '%mid%' OR rt.name LIKE '%MID%' THEN cr.score ELSE 0 END) AS mid_term_score,
            SUM(CASE WHEN rt.name LIKE '%end%' OR rt.name LIKE '%END%' THEN cr.score ELSE 0 END) AS end_term_score,
            SUM(cr.score) AS total_score,
            cr.grade,
            cr.remarks
          FROM class_results cr
          LEFT JOIN result_types rt ON cr.result_type_id = rt.id
          WHERE cr.student_id = ? AND cr.class_id = ? AND cr.term_id = ?
          GROUP BY cr.subject_id, cr.grade, cr.remarks
        `, [stu.student_id, class_id, term_id]);

        for (const sr of subjectResults) {
          // Check if report_card_subjects row already exists
          const [existingSub]: any = await conn.execute(
            `SELECT id FROM report_card_subjects WHERE report_card_id = ? AND subject_id = ?`,
            [reportCardId, sr.subject_id]
          );

          if (existingSub.length > 0) {
            await conn.execute(`
              UPDATE report_card_subjects SET
                total_score = ?, mid_term_score = ?, end_term_score = ?,
                grade = ?, remarks = ?
              WHERE id = ?
            `, [sr.total_score, sr.mid_term_score, sr.end_term_score, sr.grade, sr.remarks, existingSub[0].id]);
          } else {
            await conn.execute(`
              INSERT INTO report_card_subjects
                (report_card_id, subject_id, total_score, mid_term_score, end_term_score, grade, remarks)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [reportCardId, sr.subject_id, sr.total_score, sr.mid_term_score, sr.end_term_score, sr.grade, sr.remarks]);
          }
        }

        // Compute overall grade from average
        let overallGrade = 'F9';
        const avg = stu.average_score || 0;
        if (avg >= 90) overallGrade = 'D1';
        else if (avg >= 80) overallGrade = 'D2';
        else if (avg >= 70) overallGrade = 'C3';
        else if (avg >= 60) overallGrade = 'C4';
        else if (avg >= 50) overallGrade = 'C5';
        else if (avg >= 44) overallGrade = 'C6';
        else if (avg >= 40) overallGrade = 'P7';
        else if (avg >= 34) overallGrade = 'P8';

        await conn.execute(
          'UPDATE report_cards SET overall_grade = ? WHERE id = ?',
          [overallGrade, reportCardId]
        );
      }

      await conn.execute('COMMIT');
    } catch (txError) {
      await conn.execute('ROLLBACK');
      throw txError;
    }

    return NextResponse.json({
      success: true,
      message: `Report cards generated: ${created} created, ${updated} updated`,
      data: { created, updated, total: studentsWithPositions.length }
    });
  } catch (error) {
    console.error('Error generating report cards:', error);
    return NextResponse.json({ error: 'Failed to generate report cards' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
