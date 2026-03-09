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
    // school_id derived from session below

    connection = await getConnection();

    // Fetch staff members who are teachers from the school
    // Query staff table directly since person table doesn't exist
    const sql = `
      SELECT 
        id,
        staff_no,
        CONCAT('Staff ', id) as first_name,
        position as last_name,
        null as email,
        position,
        department_id
      FROM staff
      WHERE school_id = ? 
        AND status = 'active'
        AND (LOWER(position) LIKE '%teacher%' OR LOWER(position) LIKE '%instructor%')
      ORDER BY position, id
    `;

    const [teachers] = await connection.execute(sql, [schoolId]);

    return NextResponse.json({
      success: true,
      data: teachers
    });

  } catch (error: any) {
    console.error('Teachers fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch teachers',
      data: []
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
