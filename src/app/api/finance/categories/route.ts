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
    const type = searchParams.get('type'); // 'income' or 'expense'

    connection = await getConnection();

    let sql = `
      SELECT 
        fc.id,
        fc.school_id,
        fc.type,
        fc.name,
        COUNT(l.id) as usage_count,
        COALESCE(SUM(l.amount), 0) as total_amount
      FROM finance_categories fc
      LEFT JOIN ledger l ON fc.id = l.category_id
      WHERE (fc.school_id = ? OR fc.school_id IS NULL)
    `;

    const params = [schoolId];

    if (type) {
      sql += ' AND fc.type = ?';
      params.push(type);
    }

    sql += ' GROUP BY fc.id, fc.school_id, fc.type, fc.name ORDER BY fc.type, fc.name';

    const [categories] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: categories
    });

  } catch (error: any) {
    console.error('Categories fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch categories'
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
    const { type, name } = body;

    if (!type || !name) {
      return NextResponse.json({
        success: false,
        error: 'Category type and name are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(`
      INSERT INTO finance_categories (school_id, type, name)
      VALUES (?, ?, ?)
    `, [schoolId, type, name]);

    return NextResponse.json({
      success: true,
      message: 'Category created successfully',
      data: { id: result.insertId }
    });

  } catch (error: any) {
    console.error('Category creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create category'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
