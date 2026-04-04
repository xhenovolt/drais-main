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
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');

    connection = await getConnection();

    let sql = `
      SELECT 
        w.id,
        w.title,
        w.description,
        w.owner_type,
        w.owner_id,
        w.start_datetime,
        w.end_datetime,
        w.status,
        w.priority,
        w.progress,
        w.assigned_to,
        w.created_at,
        CONCAT(p.first_name, ' ', p.last_name) as assignee_name,
        d.name as department_name
      FROM workplans w
      LEFT JOIN staff s ON w.assigned_to = s.id
      LEFT JOIN people p ON s.person_id = p.id
      LEFT JOIN departments d ON w.owner_type = 'department' AND w.owner_id = d.id
      WHERE w.school_id = ? AND (w.deleted_at IS NULL OR w.deleted_at = '')
    `;

    const params = [schoolId];

    if (status) {
      sql += ' AND w.status = ?';
      params.push(status);
    }

    if (priority) {
      sql += ' AND w.priority = ?';
      params.push(priority);
    }

    sql += ' ORDER BY w.created_at DESC';

    const [workPlans] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: workPlans
    });

  } catch (error: any) {
    console.error('Work plans fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch work plans'
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
    const { title, 
      description, 
      owner_type = 'school',
      owner_id,
      start_datetime,
      end_datetime,
      priority = 'medium',
      assigned_to } = body;

    if (!title) {
      return NextResponse.json({
        success: false,
        error: 'Work plan title is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(`
      INSERT INTO workplans (
        school_id, title, description, owner_type, owner_id, 
        start_datetime, end_datetime, priority, assigned_to
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      schoolId, title, description, owner_type, owner_id,
      start_datetime, end_datetime, priority, assigned_to
    ]);

    return NextResponse.json({
      success: true,
      message: 'Work plan created successfully',
      data: { id: result.insertId }
    });

  } catch (error: any) {
    console.error('Work plan creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create work plan'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PATCH(req: NextRequest) {
  let connection;
  
  try {
    const body = await req.json();
    const { 
      id, 
      title, 
      description, 
      start_datetime, 
      end_datetime, 
      status, 
      priority, 
      progress, 
      assigned_to 
    } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Work plan ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    await connection.execute(`
      UPDATE workplans 
      SET title = ?, description = ?, start_datetime = ?, end_datetime = ?,
          status = ?, priority = ?, progress = ?, assigned_to = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title, description || null, start_datetime || null, end_datetime || null,
      status, priority, progress || 0, assigned_to || null, id
    ]);

    return NextResponse.json({
      success: true,
      message: 'Work plan updated successfully'
    });

  } catch (error: any) {
    console.error('Work plan update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update work plan'
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
        error: 'Work plan ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Soft delete
    await connection.execute(
      'UPDATE workplans SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', 
      [id]
    );

    return NextResponse.json({
      success: true,
      message: 'Work plan deleted successfully'
    });

  } catch (error: any) {
    console.error('Work plan deletion error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete work plan'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
