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

    // Get all staff with basic information, including device_user_id
    const [staffRows] = await connection.execute(`
      SELECT
        s.id,
        s.staff_no,
        s.position,
        s.hire_date,
        s.status,
        p.first_name,
        p.last_name,
        p.other_name,
        p.gender,
        p.phone,
        p.email,
        p.photo_url,
        p.address,
        p.date_of_birth,
        dum.device_user_id,
        dum.id as device_mapping_id,
        bd.device_name,
        bd.id as device_id
      FROM staff s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN device_user_mappings dum ON s.id = dum.staff_id AND dum.school_id = ?
      LEFT JOIN biometric_devices bd ON dum.device_id = bd.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      ORDER BY p.first_name, p.last_name
    `, [schoolId, schoolId]);

    return NextResponse.json({
      success: true,
      data: staffRows
    });

  } catch (error: any) {
    console.error('Staff full fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch staff data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
