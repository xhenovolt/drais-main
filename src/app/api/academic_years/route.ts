import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET() {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

  const conn = await getConnection();
  const [rows] = await conn.execute('SELECT id, school_id, name, start_date, end_date, status FROM academic_years ORDER BY id DESC');
  await conn.end();
  return NextResponse.json({ data: rows });
}
