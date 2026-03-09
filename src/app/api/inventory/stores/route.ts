import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const connection = await getConnection();
    const params: any[] = [];
    let whereClause = '';

    if (schoolId) {
      whereClause = 'WHERE school_id = ?';
      params.push(schoolId);
    }

    const [rows] = await connection.execute(
      `SELECT * FROM stores ${whereClause}`,
      params
    );
    await connection.end();

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('Error fetching stores:', error.message);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stores. Please try again later.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { name, location } = body;
    const createdBy = body.createdBy || 1; // Default to 1 if createdBy is not provided

    if (!name) {
      return NextResponse.json(
        { error: 'name is required.' },
        { status: 400 }
      );
    }

    const connection = await getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        'INSERT INTO stores (name, location, school_id, created_at) VALUES (?, ?, ?, NOW())',
        [name, location || null, schoolId]
      );

      const storeId = (result as any).insertId;

      await connection.execute(
        'INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [
          createdBy,
          'CREATE',
          'Store',
          storeId,
          JSON.stringify({ name, location }),
        ]
      );

      await connection.commit();
      await connection.end();

      return NextResponse.json({ success: true, id: storeId }, { status: 201 });
    } catch (error: any) {
      await connection.rollback();
      await connection.end();
      console.error('Error creating store:', error.message);
      return NextResponse.json(
        { error: 'Failed to create store. Please try again later.' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error processing request:', error.message);
    return NextResponse.json(
      { error: 'Invalid request. Please check your input.' },
      { status: 400 }
    );
  }
}
