import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getSessionSchoolId } from '@/lib/auth';
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
    const type = searchParams.get('type'); // Filter by type (e.g., 'tahfiz')

    connection = await getConnection();

    let sql = `
      SELECT 
        id,
        name,
        class_level,
        head_teacher_id
      FROM classes 
      WHERE school_id = ? AND deleted_at IS NULL
    `;
    const params: any[] = [schoolId];

    // Filter for tahfiz classes (WHERE name LIKE '%tahfiz%' OR name = 'tahfiz')
    if (type === 'tahfiz') {
      sql += ` AND (LOWER(name) LIKE '%tahfiz%' OR LOWER(name) = 'tahfiz')`;
    }

    sql += ` ORDER BY class_level, name`;

    const [classes] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: classes
    });

  } catch (error: any) {
    console.error('Classes fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch classes'
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
    if (!body.name) return NextResponse.json({ success: false, message: 'Class name is required' }, { status: 400 });
    connection = await getConnection();
    await connection.execute('INSERT INTO classes (school_id,name,class_level,head_teacher_id,curriculum_id) VALUES (?,?,?,?,?)', [schoolId, body.name, body.class_level || null, body.head_teacher_id || null, body.curriculum_id || null]);
    const [result] = await connection.execute('SELECT LAST_INSERT_ID() as id');
    return NextResponse.json({ success: true, message: 'Class created', id: (result as any)[0].id }, { status: 201 });
  } catch (error: any) {
    console.error('Classes POST error:', error);
    return NextResponse.json({ success: false, message: 'Failed to create class' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.id || !body.name) return NextResponse.json({ success: false, message: 'Class ID and name are required' }, { status: 400 });
    connection = await getConnection();
    await connection.execute('UPDATE classes SET name=?, class_level=?, head_teacher_id=?, curriculum_id=?, school_id=? WHERE id=?', [body.name, body.class_level || null, body.head_teacher_id || null, body.curriculum_id || null, schoolId, body.id]);
    return NextResponse.json({ success: true, message: 'Class updated' });
  } catch (error: any) {
    console.error('Classes PUT error:', error);
    return NextResponse.json({ success: false, message: 'Failed to update class' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.id) return NextResponse.json({ success: false, message: 'Class ID is required' }, { status: 400 });
    connection = await getConnection();
    
    // Soft delete: mark as deleted instead of removing
    await connection.execute('UPDATE classes SET deleted_at = CURRENT_TIMESTAMP WHERE id=? AND school_id=?', [body.id, schoolId]);
    
    // Log audit trail
    await logAudit(session.userId, 'CLASS_DELETED', { classId: body.id, schoolId });
    
    return NextResponse.json({ success: true, message: 'Class deleted' });
  } catch (error: any) {
    console.error('Classes DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete class' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
