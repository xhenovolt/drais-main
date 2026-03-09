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

    const [requirements] = await connection.execute(`
      SELECT 
        id,
        name,
        description
      FROM requirements_master 
      WHERE school_id = ? OR school_id IS NULL
      ORDER BY name
    `, [schoolId]);

    return NextResponse.json({
      success: true,
      data: requirements
    });

  } catch (error: any) {
    console.error('Requirements master fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch requirements'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({
        success: false,
        error: 'Requirement name is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(`
      INSERT INTO requirements_master (school_id, name, description)
      VALUES (?, ?, ?)
    `, [schoolId, name, description || null]);

    return NextResponse.json({
      success: true,
      message: 'Requirement created successfully',
      data: { id: result.insertId }
    });

  } catch (error: any) {
    console.error('Requirement creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create requirement'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
