import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

/**
 * POST /api/roles
 * Create a new role
 */
export async function POST(req: NextRequest) {
  let connection;
  try {
    const body = await req.json();
    const { school_id, name, description } = body;

    if (!name) {
      return NextResponse.json({
        success: false,
        error: 'Role name is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(
      'INSERT INTO roles (school_id, name, description) VALUES (?, ?, ?)',
      [school_id || 1, name, description || null]
    );

    return NextResponse.json({
      success: true,
      data: {
        id: (result as any).insertId,
        name,
        description
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Role creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create role'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
