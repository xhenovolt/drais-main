import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    connection = await getConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM result_submission_deadlines WHERE school_id = ? ORDER BY deadline_date DESC',
      [schoolId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('Error fetching deadlines:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to fetch deadlines' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.deadlineDate) {
      return NextResponse.json({ success: false, error: 'deadlineDate is required' }, { status: 400 });
    }

    connection = await getConnection();
    const formattedDeadline = new Date(body.deadlineDate).toISOString().slice(0, 19).replace('T', ' ');
    await connection.execute(
      'INSERT INTO result_submission_deadlines (school_id, result_type_id, term_id, class_id, deadline_date, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [schoolId, body.resultTypeId || null, body.termId || null, body.classId || null, formattedDeadline, body.description || null, session.userId]
    );
    const [result]: any = await connection.query('SELECT LAST_INSERT_ID() as id');
    return NextResponse.json({ success: true, message: 'Deadline created', data: { id: result[0]?.id } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating deadline:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to create deadline' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.id || !body.deadlineDate) {
      return NextResponse.json({ success: false, error: 'id and deadlineDate are required' }, { status: 400 });
    }

    connection = await getConnection();
    const formattedDeadline = new Date(body.deadlineDate).toISOString().slice(0, 19).replace('T', ' ');
    await connection.execute(
      'UPDATE result_submission_deadlines SET result_type_id=?, term_id=?, class_id=?, deadline_date=?, description=? WHERE id=? AND school_id=?',
      [body.resultTypeId || null, body.termId || null, body.classId || null, formattedDeadline, body.description || null, body.id, schoolId]
    );
    return NextResponse.json({ success: true, message: 'Deadline updated' });
  } catch (error: any) {
    console.error('Error updating deadline:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to update deadline' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.execute('DELETE FROM result_submission_deadlines WHERE id=? AND school_id=?', [body.id, schoolId]);
    return NextResponse.json({ success: true, message: 'Deadline deleted' });
  } catch (error: any) {
    console.error('Error deleting deadline:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to delete deadline' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
