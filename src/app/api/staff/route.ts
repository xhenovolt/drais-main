import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const page = parseInt(searchParams.get('page', 10) || '1');
    const limit = parseInt(searchParams.get('limit', 10) || '50');
    const offset = Math.max(0, (page - 1) * limit);

    connection = await getConnection();

    // Check if enhanced columns exist, if not create them
    try {
      await connection.execute(`
        ALTER TABLE staff 
        ADD COLUMN IF NOT EXISTS branch_id BIGINT DEFAULT 1 AFTER school_id,
        ADD COLUMN IF NOT EXISTS department_id BIGINT DEFAULT NULL AFTER staff_no,
        ADD COLUMN IF NOT EXISTS role_id BIGINT DEFAULT NULL AFTER department_id,
        ADD COLUMN IF NOT EXISTS employment_type ENUM('permanent','contract','volunteer','part-time') DEFAULT 'permanent' AFTER position,
        ADD COLUMN IF NOT EXISTS qualification VARCHAR(255) DEFAULT NULL AFTER employment_type,
        ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 0 AFTER qualification,
        ADD COLUMN IF NOT EXISTS salary DECIMAL(14,2) DEFAULT NULL AFTER hire_date,
        ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150) DEFAULT NULL AFTER salary,
        ADD COLUMN IF NOT EXISTS bank_account_no VARCHAR(100) DEFAULT NULL AFTER bank_name,
        ADD COLUMN IF NOT EXISTS nssf_no VARCHAR(100) DEFAULT NULL AFTER bank_account_no,
        ADD COLUMN IF NOT EXISTS tin_no VARCHAR(100) DEFAULT NULL AFTER nssf_no,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER status,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at
      `);
    } catch (alterError) {
      // Columns might already exist, continue
      console.log('Note: Some staff table columns may already exist');
    }

    // Get basic staff data
    const [staffRows] = await connection.execute(`
      SELECT 
        s.id,
        s.staff_no,
        s.position,
        s.hire_date,
        s.status,
        p.first_name,
        p.last_name,
        p.other_name,
        p.gender,
        p.phone,
        p.email,
        p.photo_url
      FROM staff s
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      ORDER BY p.first_name, p.last_name
      LIMIT ${Math.max(1, limit)} OFFSET ${Math.max(0, offset)}
    `, [schoolId]);

    // Count total records
    const [countRows] = await connection.execute(`
      SELECT COUNT(*) as total
      FROM staff s
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
    `, [schoolId]);

    const total = Array.isArray(countRows) ? countRows[0]?.total || 0 : 0;

    return NextResponse.json({
      success: true,
      data: staffRows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error: any) {
    console.error('Staff fetch error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch staff data',
      data: []
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
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { first_name,
      last_name,
      other_name,
      gender,
      phone,
      email,
      position,
      hire_date,
      staff_no,
      department_id } = body;

    if (!first_name || !last_name || !position) {
      return NextResponse.json({
        success: false,
        message: 'First name, last name, and position are required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Insert person record
      const [personResult] = await connection.execute(`
        INSERT INTO people (school_id, first_name, last_name, other_name, gender, phone, email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [schoolId, first_name, last_name, other_name || null, gender || null, phone || null, email || null]);

      const personId = personResult.insertId;

      // Generate staff number if not provided
      const finalStaffNo = staff_no || `STAFF${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Insert staff record
      const [staffResult] = await connection.execute(`
        INSERT INTO staff (school_id, person_id, staff_no, position, hire_date, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `, [schoolId, personId, finalStaffNo, position, hire_date || new Date().toISOString().split('T')[0]]);

      await connection.commit();

      // Audit log
      await logAudit({
        schoolId,
        userId: session.userId,
        action: AuditAction.CREATED_STAFF,
        entityType: 'staff',
        entityId: staffResult.insertId,
        details: {
          staffNo: finalStaffNo,
          firstName: first_name,
          lastName: last_name,
          position,
        },
      }).catch(err => console.error('Audit log failed:', err));

      return NextResponse.json({
        success: true,
        message: 'Staff member added successfully',
        data: {
          id: staffResult.insertId,
          staff_no: finalStaffNo,
          person_id: personId
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Staff creation error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to create staff member'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
