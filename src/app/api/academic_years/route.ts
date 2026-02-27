import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET() {
  const conn = await getConnection();
  const [rows] = await conn.execute('SELECT id, school_id, name, start_date, end_date, status FROM academic_years ORDER BY id DESC');
  await conn.end();
  return NextResponse.json({ data: rows });
}
