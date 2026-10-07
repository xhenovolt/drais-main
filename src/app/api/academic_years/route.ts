import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getDbMode } from '@/lib/db/db-mode';
import { checkModule } from '@/lib/auth/requireModule';
import { getAcademicYears, createAcademicYear } from './offline';

export async function GET(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;
  if (getDbMode() === 'local-sqlite') return getAcademicYears(session.schoolId);

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;

    const [rows] = await conn.execute(
      `SELECT id, school_id, name, start_date, end_date, status
       FROM academic_years
       WHERE school_id = ?
         AND deleted_at IS NULL
       ORDER BY start_date DESC, id DESC`,
      [schoolId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching academic years:', error);
    return NextResponse.json({ error: 'Failed to fetch academic years' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function POST(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;

  const body = await request.json();
  if (getDbMode() === 'local-sqlite') return createAcademicYear(session.schoolId, body);

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    const { name, start_date, end_date, status } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const normalizedName = String(name).trim();
    const [existing]: any = await conn.execute(
      `
      SELECT id
      FROM academic_years
      WHERE school_id = ?
        AND deleted_at IS NULL
        AND TRIM(name) = ?
      LIMIT 1
      `,
      [schoolId, normalizedName]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Academic year already exists' }, { status: 409 });
    }

    const [result]: any = await conn.execute(
      `INSERT INTO academic_years (school_id, name, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?)`,
      [schoolId, normalizedName, start_date || null, end_date || null, status || 'draft']
    );

    return NextResponse.json({ success: true, id: result.insertId });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Academic year already exists' }, { status: 409 });
    }
    console.error('Error creating academic year:', error);
    return NextResponse.json({ error: 'Failed to create academic year' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
