import { NextRequest, NextResponse } from 'next/server';
import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'drais_school',
  port: parseInt(process.env.DB_PORT || '3306', 10)
};

export async function GET() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    
    // Test the connection
    await connection.ping();
    
    // Check if tables exist
    const [tables] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME IN ('tahfiz_groups', 'tahfiz_group_members', 'staff', 'people', 'students')
    `, [dbConfig.database]);
    
    // Count existing groups
    const [groupCount] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM tahfiz_groups 
      WHERE school_id = 1
    `);
    
    // Count staff (teachers)
    const [staffCount] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM staff 
      WHERE school_id = 1 AND status = 'active'
    `);

    // Count students
    const [studentCount] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM students 
      WHERE school_id = 1 AND status = 'active'
    `);

    return NextResponse.json({
      success: true,
      message: 'Database connection successful',
      data: {
        database: dbConfig.database,
        tables: tables,
        groups: (groupCount as any)[0]?.count || 0,
        staff: (staffCount as any)[0]?.count || 0,
        students: (studentCount as any)[0]?.count || 0
      }
    });

  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json({
      success: false,
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
