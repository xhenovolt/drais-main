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
    const studentId = searchParams.get('student_id');

    connection = await getConnection();

    let sql = `
      SELECT 
        d.id,
        d.owner_id as student_id,
        d.document_type_id,
        d.file_name,
        d.file_url,
        d.mime_type,
        d.file_size,
        d.issued_by,
        d.issue_date,
        d.notes,
        d.uploaded_at,
        dt.code as document_type_code,
        dt.label as document_type_label,
        p.first_name,
        p.last_name,
        s.admission_no,
        cl.name as class_name
      FROM documents d
      JOIN document_types dt ON d.document_type_id = dt.id
      JOIN students s ON d.owner_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes cl ON e.class_id = cl.id
      WHERE d.school_id = ? AND d.owner_type = 'student' AND d.deleted_at IS NULL
    `;

    const params = [schoolId];

    if (studentId) {
      sql += ' AND d.owner_id = ?';
      params.push(parseInt(studentId, 10));
    }

    sql += ' ORDER BY COALESCE(p.last_name, \'\') ASC, COALESCE(p.first_name, \'\') ASC, d.uploaded_at DESC';

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows
    });

  } catch (error: any) {
    console.error('Documents fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch documents'
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

    const formData = await req.formData();
    const studentId = parseInt(formData.get('student_id', 10) as string);
    const documentTypeId = parseInt(formData.get('document_type_id', 10) as string);
    const issuedBy = formData.get('issued_by') as string;
    const issueDate = formData.get('issue_date') as string;
    const notes = formData.get('notes') as string;
    const file = formData.get('file') as File;

    if (!studentId || !documentTypeId || !file) {
      return NextResponse.json({
        success: false,
        error: 'Student ID, document type, and file are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Get school ID from student
    const [studentRows] = await connection.execute(
      'SELECT school_id FROM students WHERE id = ?',
      [studentId]
    );

    if (!Array.isArray(studentRows) || studentRows.length === 0) {
      throw new Error('Student not found');
    }

    // Verify student belongs to this school
    if (studentRows[0].school_id !== schoolId) {
      return NextResponse.json({ success: false, error: 'Student not found in your school' }, { status: 404 });
    }

    // TODO: Implement actual file upload logic
    const fileName = file.name;
    const fileUrl = `/uploads/documents/${Date.now()}_${fileName}`;
    const mimeType = file.type;
    const fileSize = file.size;

    await connection.execute(`
      INSERT INTO documents (
        school_id, owner_type, owner_id, document_type_id, 
        file_name, file_url, mime_type, file_size, 
        issued_by, issue_date, notes
      ) VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      schoolId, studentId, documentTypeId, fileName, fileUrl,
      mimeType, fileSize, issuedBy, issueDate, notes
    ]);

    return NextResponse.json({
      success: true,
      message: 'Document uploaded successfully'
    });

  } catch (error: any) {
    console.error('Document upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to upload document'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
