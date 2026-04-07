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
    const status = searchParams.get('status') || '';
    const assignedTo = searchParams.get('assigned_to') || '';
    const department = searchParams.get('department') || '';

    connection = await getConnection();

    let whereConditions = ['w.school_id = ? AND w.deleted_at IS NULL'];
    let queryParams = [schoolId];

    if (status) {
      whereConditions.push('w.status = ?');
      queryParams.push(status);
    }

    if (assignedTo) {
      whereConditions.push('w.assigned_to = ?');
      queryParams.push(parseInt(assignedTo, 10));
    }

    if (department) {
      whereConditions.push('w.owner_type = "department" AND w.owner_id = ?');
      queryParams.push(parseInt(department, 10));
    }

    const whereClause = whereConditions.join(' AND ');

    const [workplans] = await connection.execute(`
      SELECT 
        w.id,
        w.title,
        w.description,
        w.start_datetime,
        w.end_datetime,
        w.status,
        w.priority,
        w.progress,
        w.owner_type,
        w.owner_id,
        w.created_at,
        p.first_name as assigned_first_name,
        p.last_name as assigned_last_name,
        s.staff_no as assigned_staff_no,
        d.name as department_name,
        pc.first_name as creator_first_name,
        pc.last_name as creator_last_name
      FROM workplans w
      LEFT JOIN staff s ON w.assigned_to = s.id
      LEFT JOIN people p ON s.person_id = p.id
      LEFT JOIN departments d ON w.owner_type = 'department' AND w.owner_id = d.id
      LEFT JOIN users u ON w.created_by = u.id
      LEFT JOIN people pc ON u.id = pc.id
      WHERE ${whereClause}
      ORDER BY 
        CASE w.priority 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          WHEN 'low' THEN 3 
        END,
        w.start_datetime DESC
    `, queryParams);

    return NextResponse.json({
      success: true,
      data: workplans
    });

  } catch (error: any) {
    console.error('Workplans fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch workplans'
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
      start_datetime,
      end_datetime,
      priority = 'medium',
      assigned_to,
      owner_type = 'school',
      owner_id,
      created_by } = body;

    if (!title) {
      return NextResponse.json({
        success: false,
        error: 'Title is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(`
      INSERT INTO workplans (
        school_id, title, description, start_datetime, end_datetime,
        priority, assigned_to, owner_type, owner_id, created_by, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [
      schoolId, title, description, start_datetime, end_datetime,
      priority, assigned_to, owner_type, owner_id, created_by
    ]);

    return NextResponse.json({
      success: true,
      message: 'Work plan created successfully',
      data: { id: result.insertId }
    });

  } catch (error: any) {
    console.error('Workplan creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create work plan'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
