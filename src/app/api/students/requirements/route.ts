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
    const termId = searchParams.get('term_id');
    const studentId = searchParams.get('student_id');
    // class_id was already being SENT by the page's filter dropdown but
    // silently ignored here — never actually filtered anything.
    const classId = searchParams.get('class_id');
    const status = searchParams.get('status'); // 'brought' | 'not_brought'
    const search = searchParams.get('q');
    // No LIMIT at all previously — every requirement row for every student
    // in the school, on a 30s poll, filtered client-side. Same shape of bug
    // that froze /finance/fees. Paginated + filters moved server-side.
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = (page - 1) * limit;

    connection = await getConnection();

    const baseFrom = `
      FROM student_requirements sr
      JOIN students s ON sr.student_id = s.id AND s.deleted_at IS NULL
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN terms t ON sr.term_id = t.id
      LEFT JOIN requirements_master rm ON sr.requirement_id = rm.id
      WHERE s.school_id = ?
    `;
    const params: any[] = [schoolId];
    let filters = '';

    if (termId) { filters += ' AND sr.term_id = ?'; params.push(parseInt(termId, 10)); }
    if (studentId) { filters += ' AND sr.student_id = ?'; params.push(parseInt(studentId, 10)); }
    if (classId) { filters += ' AND c.id = ?'; params.push(parseInt(classId, 10)); }
    if (status === 'brought') filters += ' AND sr.brought = 1';
    else if (status === 'not_brought') filters += ' AND (sr.brought = 0 OR sr.brought IS NULL)';
    if (search) {
      filters += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR rm.name LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const [countRows]: any = await connection.execute(`SELECT COUNT(*) AS total ${baseFrom}${filters}`, params);
    const total = Number(countRows?.[0]?.total || 0);

    const sql = `
      SELECT
        sr.id,
        sr.student_id,
        sr.term_id,
        sr.requirement_id,
        sr.brought,
        sr.date_reported,
        sr.notes,
        p.first_name,
        p.last_name,
        c.name as class_name,
        t.name as term_name,
        rm.name as requirement_name,
        rm.description as requirement_description
      ${baseFrom}${filters}
      ORDER BY COALESCE(p.last_name, '') ASC, COALESCE(p.first_name, '') ASC, t.name
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });

  } catch (error: any) {
    console.error('Requirements fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch requirements'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    const body = await req.json();
    const { student_id, term_id, requirement_id, brought, notes } = body;

    if (!student_id || !term_id || !requirement_id) {
      return NextResponse.json({
        success: false,
        error: 'Student ID, term ID, and requirement ID are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    await connection.execute(`
      INSERT INTO student_requirements (student_id, term_id, requirement_id, brought, date_reported, notes)
      VALUES (?, ?, ?, ?, CURDATE(), ?)
      ON DUPLICATE KEY UPDATE 
        brought = VALUES(brought),
        date_reported = CURDATE(),
        notes = VALUES(notes)
    `, [student_id, term_id, requirement_id, brought || 0, notes || null]);

    return NextResponse.json({
      success: true,
      message: 'Requirement updated successfully'
    });

  } catch (error: any) {
    console.error('Requirements update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update requirement'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
