import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const programIdFilter = searchParams.get('program_id');

    connection = await getConnection();

    // Graceful: check whether classes.program_id column exists (migration 027 may not have run)
    const [colCheck]: any = await connection.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'classes' AND column_name = 'program_id'`
    );
    const hasProgramId = (colCheck[0]?.cnt ?? 0) > 0;

    const programSelect = hasProgramId
      ? `, c.program_id, pr.name AS program_name`
      : `, NULL AS program_id, NULL AS program_name`;
    const programJoin = hasProgramId
      ? `LEFT JOIN programs pr ON c.program_id = pr.id AND pr.school_id = c.school_id`
      : '';

    let sql = `
      SELECT
        c.id, c.name, c.class_level, c.head_teacher_id,
        c.curriculum_id,
        cu.name AS curriculum_name, cu.code AS curriculum_code,
        CONCAT(s.first_name, ' ', s.last_name) AS teacher_name
        ${programSelect}
      FROM classes c
      LEFT JOIN curriculums cu ON c.curriculum_id = cu.id
      LEFT JOIN staff s ON c.head_teacher_id = s.id AND s.school_id = c.school_id
      ${programJoin}
      WHERE c.school_id = ? AND c.deleted_at IS NULL
    `;
    const params: any[] = [schoolId];

    if (type === 'tahfiz') {
      sql += ` AND (LOWER(c.name) LIKE '%tahfiz%' OR LOWER(c.name) = 'tahfiz')`;
    }
    if (programIdFilter && hasProgramId) {
      sql += ` AND c.program_id = ?`;
      params.push(Number(programIdFilter));
    }
    sql += ` ORDER BY c.class_level, c.name`;

    const [classes] = await connection.execute(sql, params);
    return NextResponse.json({ success: true, data: classes });
  } catch (error: any) {
    console.error('Classes fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch classes' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.name) return NextResponse.json({ success: false, message: 'Class name is required' }, { status: 400 });

    connection = await getConnection();

    const [colCheck]: any = await connection.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'classes' AND column_name = 'program_id'`
    );
    const hasProgramId = (colCheck[0]?.cnt ?? 0) > 0;

    if (hasProgramId) {
      await connection.execute(
        'INSERT INTO classes (school_id,name,class_level,head_teacher_id,curriculum_id,program_id) VALUES (?,?,?,?,?,?)',
        [schoolId, body.name, body.class_level || null, body.head_teacher_id || null, body.curriculum_id || null, body.program_id || null]
      );
    } else {
      await connection.execute(
        'INSERT INTO classes (school_id,name,class_level,head_teacher_id,curriculum_id) VALUES (?,?,?,?,?)',
        [schoolId, body.name, body.class_level || null, body.head_teacher_id || null, body.curriculum_id || null]
      );
    }
    const [result] = await connection.execute('SELECT LAST_INSERT_ID() as id');
    const newId = (result as any)[0].id;
    await logAudit(session.userId, 'CLASS_CREATED', { classId: newId, schoolId, name: body.name });
    return NextResponse.json({ success: true, message: 'Class created', id: newId }, { status: 201 });
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
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.id || !body.name) return NextResponse.json({ success: false, message: 'Class ID and name are required' }, { status: 400 });

    connection = await getConnection();

    const [colCheck]: any = await connection.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'classes' AND column_name = 'program_id'`
    );
    const hasProgramId = (colCheck[0]?.cnt ?? 0) > 0;

    if (hasProgramId) {
      await connection.execute(
        'UPDATE classes SET name=?, class_level=?, head_teacher_id=?, curriculum_id=?, program_id=? WHERE id=? AND school_id=?',
        [body.name, body.class_level || null, body.head_teacher_id || null, body.curriculum_id || null, body.program_id || null, body.id, schoolId]
      );
    } else {
      await connection.execute(
        'UPDATE classes SET name=?, class_level=?, head_teacher_id=?, curriculum_id=? WHERE id=? AND school_id=?',
        [body.name, body.class_level || null, body.head_teacher_id || null, body.curriculum_id || null, body.id, schoolId]
      );
    }
    await logAudit(session.userId, 'CLASS_UPDATED', { classId: body.id, schoolId, name: body.name });
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
    await connection.execute('UPDATE classes SET deleted_at = CURRENT_TIMESTAMP WHERE id=? AND school_id=?', [body.id, schoolId]);
    await logAudit(session.userId, 'CLASS_DELETED', { classId: body.id, schoolId });
    return NextResponse.json({ success: true, message: 'Class deleted' });
  } catch (error: any) {
    console.error('Classes DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete class' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
