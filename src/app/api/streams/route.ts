import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
function safe(v:any) { return (v === undefined || v === '') ? null : v; }

export async function GET(req: NextRequest) {
  const connection = await getConnection();
  const [rows] = await connection.execute('SELECT id, name, class_id FROM streams');
  await connection.end();
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !body.class_id) {
    return NextResponse.json({ error: 'Name and class_id required.' }, { status: 400 });
  }
  const connection = await getConnection();
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    await connection.execute('INSERT INTO streams (name, class_id, school_id) VALUES (?, ?, ?)', [body.name, body.class_id, schoolId]);
    await connection.end();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    await connection.end();
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const body = await req.json();
  if (!id || !body.name || !body.class_id) {
    return NextResponse.json({ error: 'id, name and class_id required.' }, { status: 400 });
  }
  const connection = await getConnection();
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    await connection.execute('UPDATE streams SET name=?, class_id=?, school_id=? WHERE id=?', [body.name, body.class_id, schoolId, id]);
    await connection.end();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    await connection.end();
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required.' }, { status: 400 });
  }
  const connection = await getConnection();
  try {
    await connection.execute('DELETE FROM streams WHERE id=?', [id]);
    await connection.end();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    await connection.end();
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
