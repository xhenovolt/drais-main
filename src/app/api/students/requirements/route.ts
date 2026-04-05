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

    connection = await getConnection();

    let sql = `
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
      FROM student_requirements sr
      JOIN students s ON sr.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN terms t ON sr.term_id = t.id
      LEFT JOIN requirements_master rm ON sr.requirement_id = rm.id
      WHERE s.school_id = ?
    `;

    const params = [schoolId];

    if (termId) {
      sql += ' AND sr.term_id = ?';
      params.push(parseInt(termId, 10));
    }

    if (studentId) {
      sql += ' AND sr.student_id = ?';
      params.push(parseInt(studentId, 10));
    }

    sql += ' ORDER BY COALESCE(p.last_name, \'\') ASC, COALESCE(p.first_name, \'\') ASC, t.name';

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows
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
