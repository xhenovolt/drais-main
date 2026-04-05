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
    const departmentId = searchParams.get('department_id');
    const staffId = searchParams.get('staff_id');
    const date = searchParams.get('date');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const status = searchParams.get('status');

    connection = await getConnection();

    let sql = `
      SELECT 
        sa.id,
        sa.staff_id,
        sa.date,
        sa.status,
        sa.notes,
        sa.time_in,
        sa.time_out,
        sa.method,
        sa.marked_by,
        sa.marked_at,
        p.first_name,
        p.last_name,
        s.staff_no,
        s.position,
        d.name as department_name,
        d.id as department_id
      FROM staff_attendance sa
      JOIN staff s ON sa.staff_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN departments d ON s.department_id = d.id
      WHERE s.school_id = ? AND s.status = 'active'
    `;

    const params = [schoolId];

    if (departmentId) {
      sql += ' AND d.id = ?';
      params.push(parseInt(departmentId, 10));
    }

    if (staffId) {
      sql += ' AND sa.staff_id = ?';
      params.push(parseInt(staffId, 10));
    }

    if (date) {
      sql += ' AND sa.date = ?';
      params.push(date);
    }

    if (startDate && endDate) {
      sql += ' AND sa.date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    if (status) {
      sql += ' AND sa.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY sa.date DESC, p.first_name ASC';

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows
    });

  } catch (error: any) {
    console.error('Staff attendance fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch staff attendance'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    const body = await req.json();
    const { staff_id, date, status, notes, time_in, time_out, marked_by = 1, bulk_data } = body;

    connection = await getConnection();
    await connection.beginTransaction();

    let result;

    if (bulk_data && Array.isArray(bulk_data)) {
      // Handle bulk attendance marking
      const results = [];
      for (const item of bulk_data) {
        const [insertResult] = await connection.execute(`
          INSERT INTO staff_attendance (staff_id, date, status, notes, time_in, time_out, marked_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            status = VALUES(status),
            notes = VALUES(notes),
            time_in = VALUES(time_in),
            time_out = VALUES(time_out),
            marked_by = VALUES(marked_by),
            marked_at = CURRENT_TIMESTAMP
        `, [
          item.staff_id, item.date, item.status, 
          item.notes || null, item.time_in || null, item.time_out || null, marked_by
        ]);
        results.push(insertResult.insertId || insertResult.affectedRows);
      }
      result = { insertIds: results };
    } else {
      // Handle single attendance record
      [result] = await connection.execute(`
        INSERT INTO staff_attendance (staff_id, date, status, notes, time_in, time_out, marked_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          status = VALUES(status),
          notes = VALUES(notes),
          time_in = VALUES(time_in),
          time_out = VALUES(time_out),
          marked_by = VALUES(marked_by),
          marked_at = CURRENT_TIMESTAMP
      `, [staff_id, date, status, notes || null, time_in || null, time_out || null, marked_by]);
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: bulk_data ? 'Bulk attendance marked successfully' : 'Attendance marked successfully',
      data: result
    });

  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Staff attendance creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to mark attendance'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PATCH(req: NextRequest) {
  let connection;
  
  try {
    const body = await req.json();
    const { id, status, notes, time_in, time_out } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Attendance ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    await connection.execute(`
      UPDATE staff_attendance 
      SET status = ?, notes = ?, time_in = ?, time_out = ?, marked_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, notes || null, time_in || null, time_out || null, id]);

    return NextResponse.json({
      success: true,
      message: 'Attendance updated successfully'
    });

  } catch (error: any) {
    console.error('Staff attendance update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update attendance'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest) {
  let connection;
  
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Attendance ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    await connection.execute('DELETE FROM staff_attendance WHERE id = ?', [id]);

    return NextResponse.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });

  } catch (error: any) {
    console.error('Staff attendance deletion error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete attendance record'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}