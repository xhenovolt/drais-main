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
    const groupId = searchParams.get('group_id');    // schoolId now from session auth (above)
    if (!groupId && !schoolId) {
      return NextResponse.json({
        success: false,
        message: 'Group ID or School ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    if (groupId) {
      // Get members of a specific group
      const [members] = await connection.execute(`
        SELECT 
          gm.id,
          gm.group_id,
          gm.student_id,
          gm.joined_at,
          gm.role,
          p.first_name,
          p.last_name,
          st.admission_no,
          p.photo_url as avatar
        FROM tahfiz_group_members gm
        JOIN students st ON gm.student_id = st.id
        JOIN people p ON st.person_id = p.id
        WHERE gm.group_id = ?
        ORDER BY gm.joined_at DESC
      `, [groupId]);

      return NextResponse.json({
        success: true,
        data: members
      });
    } else {
      // Get all Tahfiz students not in any group for this school
      const [availableStudents] = await connection.execute(`
        SELECT DISTINCT
          s.id,
          p.first_name,
          p.last_name,
          s.admission_no,
          p.photo_url as avatar,
          NULL as group_id,
          NULL as group_name,
          c.name as class_name,
          curr.name as curriculum_name
        FROM students s
        JOIN people p ON s.person_id = p.id
        LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
        LEFT JOIN classes c ON e.class_id = c.id
        LEFT JOIN student_curriculums sc ON s.id = sc.student_id AND sc.active = 1
        LEFT JOIN curriculums curr ON sc.curriculum_id = curr.id
        WHERE s.school_id = ? 
        AND s.status = 'active'
        AND (
          -- Students in theology curriculum
          curr.code = 'theology' 
          OR 
          -- Students with any Tahfiz activity
          s.id IN (
            SELECT DISTINCT student_id FROM tahfiz_portions WHERE student_id IS NOT NULL
            UNION
            SELECT DISTINCT student_id FROM tahfiz_records WHERE student_id IS NOT NULL
          )
        )
        AND s.id NOT IN (
          SELECT DISTINCT gm.student_id 
          FROM tahfiz_group_members gm
          JOIN tahfiz_groups g ON gm.group_id = g.id
          WHERE g.school_id = ?
        )
        ORDER BY p.first_name, p.last_name
      `, [schoolId, schoolId]);

      return NextResponse.json({
        success: true,
        data: availableStudents
      });
    }

  } catch (error) {
    console.error('Error fetching group members:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch group members',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (connection) {
      await connection.end();
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
    const { group_id, student_id, role = 'member' } = body;

    if (!group_id || !student_id) {
      return NextResponse.json({
        success: false,
        message: 'Group ID and Student ID are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Check if student is already in this group
    const [existing] = await connection.execute(`
      SELECT id FROM tahfiz_group_members 
      WHERE group_id = ? AND student_id = ?
    `, [group_id, student_id]);

    if ((existing as any[]).length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Student is already a member of this group'
      }, { status: 400 });
    }

    // Verify student exists and belongs to the same school as the group
    const [studentCheck] = await connection.execute(`
      SELECT st.id, st.school_id, p.first_name, p.last_name, st.admission_no
      FROM students st
      JOIN people p ON st.person_id = p.id
      JOIN tahfiz_groups g ON g.school_id = st.school_id
      WHERE st.id = ? AND g.id = ? AND st.status = 'active'
    `, [student_id, group_id]);

    if ((studentCheck as any[]).length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Student not found or does not belong to the same school as the group'
      }, { status: 400 });
    }

    // Add student to group
    const [result] = await connection.execute(`
      INSERT INTO tahfiz_group_members (group_id, student_id, role)
      VALUES (?, ?, ?)
    `, [group_id, student_id, role]);

    const insertResult = result as any;
    const newMemberId = insertResult.insertId;

    // Get the newly added member info for response
    const [newMember] = await connection.execute(`
      SELECT 
        gm.id,
        gm.group_id,
        gm.student_id,
        gm.joined_at,
        gm.role,
        p.first_name,
        p.last_name,
        st.admission_no,
        p.photo_url as avatar
      FROM tahfiz_group_members gm
      JOIN students st ON gm.student_id = st.id
      JOIN people p ON st.person_id = p.id
      WHERE gm.id = ?
    `, [newMemberId]);

    return NextResponse.json({
      success: true,
      message: 'Student added to group successfully',
      data: (newMember as any[])[0]
    });

  } catch (error) {
    console.error('Error adding student to group:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to add student to group',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (connection) {
      await connection.end();
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
    const memberId = searchParams.get('id');
    const groupId = searchParams.get('group_id');
    const studentId = searchParams.get('student_id');

    if (!memberId && (!groupId || !studentId)) {
      return NextResponse.json({
        success: false,
        message: 'Member ID or (Group ID and Student ID) are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    if (memberId) {
      await connection.execute('DELETE FROM tahfiz_group_members WHERE id = ?', [memberId]);
    } else {
      await connection.execute('DELETE FROM tahfiz_group_members WHERE group_id = ? AND student_id = ?', [groupId, studentId]);
    }

    return NextResponse.json({
      success: true,
      message: 'Student removed from group successfully'
    });

  } catch (error) {
    console.error('Error removing student from group:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to remove student from group',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

export async function PUT(request: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await request.json();
    const { student_id, from_group_id, to_group_id, role = 'member' } = body;

    if (!student_id || !from_group_id || !to_group_id) {
      return NextResponse.json({
        success: false,
        message: 'Student ID, from group ID, and to group ID are required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Check if student is already in the target group
      const [existing] = await connection.execute(`
        SELECT id FROM tahfiz_group_members 
        WHERE group_id = ? AND student_id = ?
      `, [to_group_id, student_id]);

      if ((existing as any[]).length > 0) {
        await connection.rollback();
        return NextResponse.json({
          success: false,
          message: 'Student is already a member of the target group'
        }, { status: 400 });
      }

      // Remove from old group
      await connection.execute(`
        DELETE FROM tahfiz_group_members 
        WHERE group_id = ? AND student_id = ?
      `, [from_group_id, student_id]);

      // Add to new group
      await connection.execute(`
        INSERT INTO tahfiz_group_members (group_id, student_id, role)
        VALUES (?, ?, ?)
      `, [to_group_id, student_id, role]);

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Student transferred successfully'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Error transferring student:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to transfer student',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}