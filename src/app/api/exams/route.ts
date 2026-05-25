import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { archiveEntity, TrashError } from '@/lib/trash/service';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'examinations.exam.view', session.isSuperAdmin);

    const { searchParams } = new URL(req.url);
    const term_id    = searchParams.get('term_id');
    const class_id   = searchParams.get('class_id');
    const subject_id = searchParams.get('subject_id');
    const status     = searchParams.get('status');

    let sql = `
      SELECT e.id, e.name, e.class_id, e.subject_id, e.term_id,
             e.date, e.start_time, e.end_time, e.status, e.body,
             c.name AS class_name, sub.name AS subject_name, t.name AS term_name
      FROM exams e
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN subjects sub ON e.subject_id = sub.id
      LEFT JOIN terms t ON e.term_id = t.id
    `;
    const params: any[] = [];
    const where: string[] = ['e.school_id = ?', 'e.deleted_at IS NULL'];
    params.push(session.schoolId);
    if (term_id)    { where.push('e.term_id = ?');    params.push(term_id);    }
    if (class_id)   { where.push('e.class_id = ?');   params.push(class_id);   }
    if (subject_id) { where.push('e.subject_id = ?'); params.push(subject_id); }
    if (status)     { where.push('e.status = ?');     params.push(status);     }

    sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY e.date DESC, e.id DESC';

    const connection = await getConnection();
    const [rows] = await connection.execute(sql, params);
    await connection.end();
    return NextResponse.json({ data: rows });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('exams GET:', e);
    return NextResponse.json({ error: 'Failed to load exams' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'examinations.exam.manage', session.isSuperAdmin);

    const body = await req.json();
    if (!body.class_id || !body.subject_id || !body.name) {
      return NextResponse.json({ error: 'class_id, subject_id, and name are required.' }, { status: 400 });
    }
    const connection = await getConnection();
    try {
      const [r]: any = await connection.execute(
        `INSERT INTO exams
           (term_id, class_id, subject_id, name, body, date, start_time, end_time, status, school_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          body.term_id || null,
          body.class_id,
          body.subject_id,
          body.name,
          body.body || null,
          body.date || null,
          body.start_time || null,
          body.end_time || null,
          body.status || 'scheduled',
          session.schoolId,
        ]
      );
      return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
    } finally { await connection.end(); }
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('exams POST:', e);
    return NextResponse.json({ error: 'Failed to create exam' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'examinations.exam.manage', session.isSuperAdmin);

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const connection = await getConnection();
    try {
      const [r]: any = await connection.execute(
        `UPDATE exams SET
           name = COALESCE(?, name),
           body = COALESCE(?, body),
           term_id = COALESCE(?, term_id),
           class_id = COALESCE(?, class_id),
           subject_id = COALESCE(?, subject_id),
           date = COALESCE(?, date),
           start_time = COALESCE(?, start_time),
           end_time = COALESCE(?, end_time),
           status = COALESCE(?, status)
         WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [
          body.name ?? null, body.body ?? null,
          body.term_id ?? null, body.class_id ?? null, body.subject_id ?? null,
          body.date ?? null, body.start_time ?? null, body.end_time ?? null,
          body.status ?? null,
          body.id, session.schoolId,
        ]
      );
      if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ success: true });
    } finally { await connection.end(); }
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('exams PUT:', e);
    return NextResponse.json({ error: 'Failed to update exam' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'examinations.exam.manage', session.isSuperAdmin);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id required.' }, { status: 400 });
    }
    await archiveEntity({
      entity:   'exam',
      id:       Number(id),
      schoolId: session.schoolId,
      userId:   session.userId,
      reason:   null,
      ip:       req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof TrashError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.statusCode });
    }
    return NextResponse.json({ error: 'Failed to archive exam' }, { status: 500 });
  }
}
