import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // schoolId derived from session below

    connection = await getConnection();

    const [roles] = await connection.execute(`
      SELECT id, name, description
      FROM roles 
      WHERE school_id = ? OR school_id IS NULL
      ORDER BY name
    `, [schoolId]);

    return NextResponse.json({
      success: true,
      data: roles
    });

  } catch (error: any) {
    console.error('Roles list error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch roles'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
