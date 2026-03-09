import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
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
    const classId = searchParams.get('class_id');
    const date = searchParams.get('date');
    const status = searchParams.get('status');
    const academicYearId = searchParams.get('academic_year_id');
    const termId = searchParams.get('term_id');

    connection = await getConnection();

    let sql = `
      SELECT 
        s.id,
        s.school_id,
        s.class_id,
        s.stream_id,
        s.term_id,
        s.academic_year_id,
        s.subject_id,
        s.teacher_id,
        s.session_date,
        s.session_start_time,
        s.session_end_time,
        s.session_type,
        s.attendance_type,
        s.status,
        s.notes,
        s.submitted_at,
        s.submitted_by,
        s.finalized_at,
        s.created_at,
        c.name as class_name,
        st.name as stream_name,
        t.name as term_name,
        ay.name as academic_year_name,
        subj.name as subject_name,
        CONCAT(p.first_name, ' ', p.last_name) as teacher_name,
        COUNT(DISTINCT sa.student_id) as students_count,
        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN sa.status = 'late' THEN 1 END) as late_count,
        COUNT(CASE WHEN sa.status = 'excused' THEN 1 END) as excused_count
      FROM attendance_sessions s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN streams st ON s.stream_id = st.id
      LEFT JOIN terms t ON s.term_id = t.id
      LEFT JOIN academic_years ay ON s.academic_year_id = ay.id
      LEFT JOIN subjects subj ON s.subject_id = subj.id
      LEFT JOIN users u ON s.teacher_id = u.id
      LEFT JOIN people p ON u.id = p.id
      LEFT JOIN student_attendance sa ON s.id = sa.attendance_session_id
      WHERE s.school_id = ?
    `;

    const params: any[] = [schoolId];

    if (classId) {
      sql += ` AND s.class_id = ?`;
      params.push(classId);
    }

    if (date) {
      sql += ` AND s.session_date = ?`;
      params.push(date);
    }

    if (status) {
      sql += ` AND s.status = ?`;
      params.push(status);
    }

    if (academicYearId) {
      sql += ` AND s.academic_year_id = ?`;
      params.push(academicYearId);
    }

    if (termId) {
      sql += ` AND s.term_id = ?`;
      params.push(termId);
    }

    sql += ` GROUP BY s.id ORDER BY s.session_date DESC, s.session_start_time DESC`;

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows || []
    });

  } catch (error: any) {
    console.error('Attendance sessions fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch attendance sessions'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { class_id,
      stream_id,
      term_id,
      academic_year_id,
      subject_id,
      teacher_id,
      session_date,
      session_start_time,
      session_end_time,
      session_type = 'lesson',
      attendance_type = 'manual',
      notes } = body;

    if (!class_id || !session_date) {
      return NextResponse.json({
        success: false,
        error: 'class_id and session_date are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(
      `INSERT INTO attendance_sessions (
        school_id, class_id, stream_id, term_id, academic_year_id, subject_id,
        teacher_id, session_date, session_start_time, session_end_time,
        session_type, attendance_type, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NOW())`,
      [
        schoolId, class_id, stream_id, term_id, academic_year_id, subject_id,
        teacher_id, session_date, session_start_time, session_end_time,
        session_type, attendance_type, notes
      ]
    );

    const sessionId = (result as any).insertId;

    return NextResponse.json({
      success: true,
      message: 'Attendance session created successfully',
      data: {
        id: sessionId,
        class_id,
        session_date,
        status: 'draft'
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Attendance session creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create attendance session'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
