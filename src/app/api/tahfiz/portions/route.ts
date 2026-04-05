import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // schoolId now from session auth (above)
    const groupId = searchParams.get('group_id');
    const studentId = searchParams.get('student_id');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page', 10) || '1');
    const limit = parseInt(searchParams.get('limit', 10) || '50');

    if (!schoolId) {
      return NextResponse.json({
        success: false,
        message: 'School ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Complex query to get learners with their portion status
    let baseQuery = `
      SELECT DISTINCT
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        p.photo_url as student_avatar,
        tg.id as group_id,
        tg.name as group_name,
        e.class_id,
        c.name as class_name,
        CONCAT(tp.first_name, ' ', tp.last_name) as teacher_name,
        
        -- Next portion (active portion)
        next_tp.id as next_portion_id,
        next_tp.portion_name as next_portion_name,
        next_tp.status as next_portion_status,
        next_tp.assigned_at as next_portion_assigned_at,
        next_tp.started_at as next_portion_started_at,
        next_tp.difficulty_level as next_portion_difficulty_level,
        next_tp.estimated_days as next_portion_estimated_days,
        
        -- Last presented (most recent completed portion)
        last_tp.portion_name as last_presented_portion_name,
        last_tr.presented_length as last_presented_length,
        last_tp.completed_at as last_presented_completed_at,
        last_tr.mark as last_presented_mark,
        last_tr.retention_score as last_presented_retention_score,
        
        -- Overall status computation
        CASE 
          WHEN next_tp.id IS NULL THEN 'no_portion'
          WHEN next_tp.status = 'pending' THEN 'pending'
          WHEN next_tp.status = 'in_progress' THEN 'in_progress'
          WHEN next_tp.status = 'completed' THEN 'completed'
          WHEN next_tp.status = 'review' THEN 'review'
          ELSE 'no_portion'
        END as overall_status
        
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id AND c.name = 'tahfiz'
      LEFT JOIN tahfiz_group_members tgm ON s.id = tgm.student_id
      LEFT JOIN tahfiz_groups tg ON tgm.group_id = tg.id
      LEFT JOIN staff staff_t ON tg.teacher_id = staff_t.id
      LEFT JOIN people tp ON staff_t.person_id = tp.id
      
      -- Get active/next portion (pending or in_progress)
      LEFT JOIN tahfiz_portions next_tp ON s.id = next_tp.student_id 
        AND next_tp.status IN ('pending', 'in_progress', 'review')
      
      -- Get last presented portion (most recent completed)
      LEFT JOIN (
        SELECT 
          tp1.student_id,
          tp1.id,
          tp1.portion_name,
          tp1.completed_at,
          ROW_NUMBER() OVER (PARTITION BY tp1.student_id ORDER BY tp1.completed_at DESC) as rn
        FROM tahfiz_portions tp1
        WHERE tp1.status = 'completed'
      ) last_tp ON s.id = last_tp.student_id AND last_tp.rn = 1
      
      -- Get records for the last presented portion
      LEFT JOIN tahfiz_records last_tr ON last_tp.id = last_tr.plan_id AND s.id = last_tr.student_id
      
      WHERE s.school_id = ? AND s.status = 'active' AND c.id IS NOT NULL
    `;

    const queryParams: any[] = [schoolId];
    const conditions: string[] = [];

    // Add filters
    if (groupId && groupId !== 'all') {
      conditions.push('tg.id = ?');
      queryParams.push(groupId);
    }

    if (studentId) {
      conditions.push('s.id = ?');
      queryParams.push(studentId);
    }

    if (status && status !== 'all') {
      if (status === 'no_portion') {
        conditions.push('next_tp.id IS NULL');
      } else {
        conditions.push('next_tp.status = ?');
        queryParams.push(status);
      }
    }

    if (search) {
      conditions.push('(CONCAT(p.first_name, " ", p.last_name) LIKE ? OR s.admission_no LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Add WHERE conditions
    if (conditions.length > 0) {
      baseQuery += ' AND ' + conditions.join(' AND ');
    }

    // Add pagination - inline LIMIT/OFFSET since TiDB doesn't support parameterized LIMIT
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number((page - 1) * limit) || 0);
    baseQuery += ` ORDER BY student_name LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [rows] = await connection.execute(baseQuery, queryParams);
    const learners = (rows as any[]).map(row => ({
      student_id: row.student_id,
      student_name: row.student_name,
      admission_no: row.admission_no,
      student_avatar: row.student_avatar,
      group_id: row.group_id,
      group_name: row.group_name,
      teacher_name: row.teacher_name,
      next_portion: row.next_portion_id ? {
        id: row.next_portion_id,
        portion_name: row.next_portion_name,
        status: row.next_portion_status,
        assigned_at: row.next_portion_assigned_at,
        started_at: row.next_portion_started_at,
        difficulty_level: row.next_portion_difficulty_level,
        estimated_days: row.next_portion_estimated_days
      } : null,
      last_presented: row.last_presented_portion_name ? {
        portion_name: row.last_presented_portion_name,
        presented_length: row.last_presented_length,
        completed_at: row.last_presented_completed_at,
        mark: row.last_presented_mark,
        retention_score: row.last_presented_retention_score
      } : null,
      overall_status: row.overall_status
    }));

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id AND c.name = 'tahfiz'
      LEFT JOIN tahfiz_group_members tgm ON s.id = tgm.student_id
      LEFT JOIN tahfiz_groups tg ON tgm.group_id = tg.id
      LEFT JOIN tahfiz_portions next_tp ON s.id = next_tp.student_id 
        AND next_tp.status IN ('pending', 'in_progress', 'review')
      WHERE s.school_id = ? AND s.status = 'active' AND c.id IS NOT NULL
    `;

    const countParams: any[] = [schoolId];
    let countConditions: string[] = [];

    if (groupId && groupId !== 'all') {
      countConditions.push('tg.id = ?');
      countParams.push(groupId);
    }

    if (studentId) {
      countConditions.push('s.id = ?');
      countParams.push(studentId);
    }

    if (status && status !== 'all') {
      if (status === 'no_portion') {
        countConditions.push('next_tp.id IS NULL');
      } else {
        countConditions.push('next_tp.status = ?');
        countParams.push(status);
      }
    }

    if (search) {
      countConditions.push('(CONCAT(p.first_name, " ", p.last_name) LIKE ? OR s.admission_no LIKE ?)');
      countParams.push(`%${search}%`, `%${search}%`);
    }

    if (countConditions.length > 0) {
      countQuery += ' AND ' + countConditions.join(' AND ');
    }

    const [countRows] = await connection.execute(countQuery, countParams);
    const total = (countRows as any[])[0].total;

    return NextResponse.json({
      success: true,
      data: learners,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching learners:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch learners',
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

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const {
      student_ids, 
      group_id, 
      book_id, 
      portion_name, 
      surah_name, 
      ayah_from, 
      ayah_to, 
      page_from, 
      page_to, 
      juz_number,
      difficulty_level, 
      estimated_days, 
      notes
    } = body;

    if (!schoolId) {
      return NextResponse.json({
        success: false,
        message: 'School ID is required'
      }, { status: 400 });
    }

    if (!student_ids && !group_id) {
      return NextResponse.json({
        success: false,
        message: 'Either student_ids or group_id is required'
      }, { status: 400 });
    }

    if (!portion_name) {
      return NextResponse.json({
        success: false,
        message: 'Portion name is required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // Get target student IDs
    let targetStudentIds = student_ids || [];
    
    if (group_id && !student_ids) {
      // Fetch students from group
      const [groupMembers] = await connection.execute(
        `SELECT student_id FROM tahfiz_group_members WHERE group_id = ?`,
        [group_id]
      );
      targetStudentIds = (groupMembers as any[]).map(member => member.student_id);
    }

    if (targetStudentIds.length === 0) {
      await connection.rollback();
      return NextResponse.json({
        success: false,
        message: 'No students found to assign portions to'
      }, { status: 400 });
    }

    // Check for duplicate active portions
    const placeholders = targetStudentIds.map(() => '?').join(',');
    const [existingPortions] = await connection.execute(
      `SELECT student_id, portion_name FROM tahfiz_portions 
       WHERE student_id IN (${placeholders}) AND status IN ('pending', 'in_progress')`,
      targetStudentIds
    );

    if ((existingPortions as any[]).length > 0) {
      await connection.rollback();
      return NextResponse.json({
        success: false,
        message: 'Some students already have active portions assigned'
      }, { status: 400 });
    }

    // Create portions for each student
    const createdPortions = [];
    
    for (const studentId of targetStudentIds) {
      const [result] = await connection.execute(
        `INSERT INTO tahfiz_portions (
          student_id, portion_name, surah_name, ayah_from, ayah_to, 
          juz_number, page_from, page_to, difficulty_level, estimated_days, 
          notes, status, assigned_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [
          studentId, portion_name, surah_name || null, ayah_from || null, 
          ayah_to || null, juz_number || null, page_from || null, 
          page_to || null, difficulty_level || 'medium', estimated_days || 1, notes || null
        ]
      );

      createdPortions.push({ 
        id: (result as any).insertId, 
        student_id: studentId, 
        portion_name, 
        surah_name: surah_name || null, 
        ayah_from: ayah_from || null, 
        ayah_to: ayah_to || null, 
        juz_number: juz_number || null, 
        page_from: page_from || null, 
        page_to: page_to || null, 
        status: 'pending',
        difficulty_level: difficulty_level || 'medium',
        estimated_days: estimated_days || 1,
        notes: notes || null,
        assigned_at: new Date().toISOString(),
        started_at: null,
        completed_at: null
      });
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: `Created ${createdPortions.length} portion assignments`,
      data: createdPortions
    });

  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating portions:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to create portions',
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

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const { id, status, notes, presented_length, retention_score, mark } = body;

    if (!id) {
      return NextResponse.json({
        success: false,
        message: 'Portion ID is required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
      
      if (status === 'in_progress') {
        updates.push('started_at = COALESCE(started_at, NOW())');
      }
      
      if (status === 'completed') {
        updates.push('completed_at = COALESCE(completed_at, NOW())');
      }
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length > 0) {
      params.push(id);
      await connection.execute(
        `UPDATE tahfiz_portions SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // If completed, check for auto-assign next portion
    if (status === 'completed') {
      // Get student info for potential next assignment
      const [portionInfo] = await connection.execute(
        `SELECT student_id, juz_number, page_to, ayah_to, surah_name FROM tahfiz_portions WHERE id = ?`,
        [id]
      );

      if ((portionInfo as any[]).length > 0) {
        const portionData = (portionInfo as any[])[0];
        // Auto-assign logic can be implemented here based on school settings
        // For now, we'll just log the completion
        console.log(`Portion completed for student ${portionData.student_id}`);
      }
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      message: 'Portion updated successfully'
    });

  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating portion:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to update portion',
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
