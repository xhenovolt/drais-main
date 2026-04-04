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

    // Check if deleted_at column exists in departments table
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'departments' AND COLUMN_NAME = 'deleted_at'
    `);
    
    const hasDeletedAt = (columns as any[]).length > 0;
    
    let query = 'SELECT id, name, description FROM departments WHERE school_id = ?';
    if (hasDeletedAt) {
      query += ' AND deleted_at IS NULL';
    }
    query += ' ORDER BY name';

    const [departments] = await connection.execute(query, [schoolId]);

    return NextResponse.json({
      success: true,
      data: departments
    });

  } catch (error: any) {
    console.error('Departments list error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch departments',
      data: []
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
