import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET(req: NextRequest) {
  let connection;
  
  try {
    const { searchParams } = new URL(req.url);
    const schoolId = parseInt(searchParams.get('school_id') || '1');

    connection = await getConnection();

    // Get all staff with basic information
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
        p.date_of_birth
      FROM staff s
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      ORDER BY p.first_name, p.last_name
    `, [schoolId]);

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
