import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET(req: NextRequest) {
  let connection;
  
  try {
    const { searchParams } = new URL(req.url);
    const schoolId = parseInt(searchParams.get('school_id') || '1');

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
      error: 'Failed to fetch departments'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
