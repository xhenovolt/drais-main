import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import mysql from 'mysql2/promise';
import { getSessionSchoolId } from '@/lib/auth';

// Add query function for POST/PATCH operations
async function query(sql: string, params: any[] = []) {
  const connection = await getConnection();
  try {
    const [result] = await connection.execute(sql, params);
    return result;
  } finally {
    await connection.end();
  }
}

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);    // schoolId now from session auth (above)
    if (!schoolId) {
      return NextResponse.json({ success: false, message: 'schoolId is required' }, { status: 400 });
    }

    connection = await getConnection();
    const [records] = await connection.execute(
      `
      SELECT 
        r.id,
        CONCAT(p.first_name, ' ', p.last_name) AS student,
        r.presented_length AS presented_portion,
        DATE(r.recorded_at) AS date,
        r.status,
        tg.name as group_name,
        tpl.portion_text,
        tb.title as book_title
      FROM tahfiz_records r
      JOIN students s ON r.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN tahfiz_plans tpl ON r.plan_id = tpl.id
      LEFT JOIN tahfiz_books tb ON tpl.book_id = tb.id
      LEFT JOIN tahfiz_groups tg ON r.group_id = tg.id
      WHERE r.school_id = ?
      ORDER BY r.recorded_at DESC
      `,
      [schoolId]
    );

    return NextResponse.json({ success: true, data: records });
  } catch (error: any) {
    console.error('Error fetching records:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch records', details: error.message }, { status: 500 });
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
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const cols = ['school_id','plan_id','student_id','presented','presented_length','retention_score','mark','status','notes','recorded_by','group_id'];
    const vals = cols.map(c => (body[c] !== undefined ? body[c] : null));
    const res: any = await query(
      `INSERT INTO tahfiz_records (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      vals
    );
    return NextResponse.json({ id: res.insertId });
  } catch (error) {
    console.error('Create record error:', error);
    return NextResponse.json({ error: 'Failed to create record' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const keys = Object.keys(rest);
    if (keys.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
    const fields = keys.map(k => `${k} = ?`).join(', ');
    const params = [...keys.map(k => (rest as any)[k]), id];
    await query(`UPDATE tahfiz_records SET ${fields} WHERE id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update record error:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'id is required' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.execute('DELETE FROM tahfiz_records WHERE id = ?', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting record:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete record', details: error.message }, { status: 500 });
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
