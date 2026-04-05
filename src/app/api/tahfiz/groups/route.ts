import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(request.url);
    // schoolId now from session auth (above)
    if (!schoolId) {
      return NextResponse.json({
        success: false,
        message: 'School ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [rows] = await connection.execute(`
      SELECT 
        tg.id,
        tg.name,
        CONCAT(p.first_name, ' ', p.last_name) as teacher_name,
        COUNT(tgm.student_id) as member_count,
        tg.notes,
        tg.created_at,
        'active' as status,
        0 as progress,
        0 as completedSessions,
        0 as totalSessions,
        NULL as schedule,
        NULL as nextSession
      FROM tahfiz_groups tg 
      LEFT JOIN people p ON tg.teacher_id = p.id
      LEFT JOIN tahfiz_group_members tgm ON tg.id = tgm.group_id
      WHERE tg.school_id = ?
      GROUP BY tg.id, tg.name, p.first_name, p.last_name, tg.notes, tg.created_at
      ORDER BY tg.name
    `, [schoolId]);

    return NextResponse.json({
      success: true,
      data: rows
    });

  } catch (error: any) {
    console.error('Error fetching groups:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch groups',
      details: error.message
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}

export async function POST(request: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await request.json();
    const { name, teacher_id, schedule, notes } = body;

    if (!schoolId || !name || !teacher_id) {
      return NextResponse.json({
        success: false,
        message: 'School ID, name, and teacher ID are required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO tahfiz_groups (school_id, name, teacher_id, notes, created_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [schoolId, name, teacher_id, notes || null]
    );

    const groupId = (result as any).insertId;

    // Get the created group with teacher name
    const [createdGroup] = await connection.execute(`
      SELECT 
        tg.id,
        tg.name,
        CONCAT(p.first_name, ' ', p.last_name) as teacher_name,
        0 as member_count,
        tg.notes,
        tg.created_at,
        'active' as status,
        0 as progress,
        0 as completedSessions,
        0 as totalSessions,
        ? as schedule,
        NULL as nextSession
      FROM tahfiz_groups tg 
      LEFT JOIN people p ON tg.teacher_id = p.id
      WHERE tg.id = ?
    `, [schedule || null, groupId]);

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: 'Group created successfully',
      data: (createdGroup as any[])[0]
    });

  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating group:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to create group',
      details: error.message
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}

export async function DELETE(request: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('id');

    if (!groupId) {
      return NextResponse.json({
        success: false,
        message: 'Group ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // First delete all group members
    await connection.execute(
      'DELETE FROM tahfiz_group_members WHERE group_id = ? AND EXISTS (SELECT 1 FROM tahfiz_groups g WHERE g.id = tahfiz_group_members.group_id AND g.school_id = ?)',
      [groupId, schoolId]
    );

    // Then delete the group
    const [result] = await connection.execute(
      'DELETE FROM tahfiz_groups WHERE id = ? AND school_id = ?',
      [groupId, schoolId]
    );

    if ((result as any).affectedRows === 0) {
      await connection.rollback();
      return NextResponse.json({
        success: false,
        message: 'Group not found'
      }, { status: 404 });
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: 'Group deleted successfully'
    });

  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error deleting group:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete group',
      details: error.message
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}
