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
        sc.student_id,
        sc.contact_id,
        sc.relationship,
        sc.is_primary,
        c.id,
        c.contact_type,
        c.occupation,
        c.alive_status,
        cp.first_name as contact_first_name,
        cp.last_name as contact_last_name,
        cp.phone as contact_phone,
        cp.email as contact_email,
        cp.address as contact_address,
        sp.first_name as student_first_name,
        sp.last_name as student_last_name,
        s.admission_no,
        cl.name as class_name
      FROM student_contacts sc
      JOIN contacts c ON sc.contact_id = c.id
      JOIN people cp ON c.person_id = cp.id
      JOIN students s ON sc.student_id = s.id
      JOIN people sp ON s.person_id = sp.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes cl ON e.class_id = cl.id
      WHERE s.school_id = ?
    `;

    const params = [schoolId];

    if (studentId) {
      sql += ' AND sc.student_id = ?';
      params.push(parseInt(studentId, 10));
    }

    sql += ' ORDER BY COALESCE(sp.last_name, \'\') ASC, COALESCE(sp.first_name, \'\') ASC, sc.is_primary DESC';

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows
    });

  } catch (error: any) {
    console.error('Contacts fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch contacts'
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
    const {
      student_id,
      first_name = '',
      last_name = '',
      phone,
      email = '',
      address = '',
      contact_type = 'guardian',
      occupation = '',
      relationship = '',
      is_primary = 0
    } = body;

    // Only require student_id and phone for quick contact collection
    if (!student_id || !phone) {
      return NextResponse.json({
        success: false,
        error: 'Student ID and phone number are required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Verify student belongs to this school
      const [studentRows] = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND school_id = ?',
        [student_id, schoolId]
      );

      if (!Array.isArray(studentRows) || studentRows.length === 0) {
        throw new Error('Student not found or does not belong to your school');
      }

      // Insert person record for contact (using session schoolId)
      const [personResult] = await connection.execute(`
        INSERT INTO people (school_id, first_name, last_name, phone, email, address)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [schoolId, first_name, last_name, phone, email, address]);

      const personId = personResult.insertId;

      // Insert contact record
      const [contactResult] = await connection.execute(`
        INSERT INTO contacts (school_id, person_id, contact_type, occupation, alive_status)
        VALUES (?, ?, ?, ?, 'alive')
      `, [schoolId, personId, contact_type, occupation]);

      const contactId = contactResult.insertId;

      // Link student to contact
      await connection.execute(`
        INSERT INTO student_contacts (student_id, contact_id, relationship, is_primary)
        VALUES (?, ?, ?, ?)
      `, [student_id, contactId, relationship, is_primary]);

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Phone number saved successfully',
        data: { contact_id: contactId }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Contact creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to save contact'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
