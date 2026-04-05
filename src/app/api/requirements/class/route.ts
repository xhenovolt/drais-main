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
    const classId = searchParams.get('class_id');
    const termId = searchParams.get('term_id');

    connection = await getConnection();

    let sql = `
      SELECT 
        cr.id,
        cr.class_id,
        cr.term_id,
        cr.requirement_item,
        cr.description,
        cr.quantity,
        cr.is_mandatory,
        cr.created_at,
        c.name as class_name,
        t.name as term_name
      FROM class_requirements cr
      JOIN classes c ON cr.class_id = c.id
      JOIN terms t ON cr.term_id = t.id
      WHERE cr.school_id = ? AND cr.deleted_at IS NULL
    `;

    const params = [schoolId];

    if (classId) {
      sql += ' AND cr.class_id = ?';
      params.push(parseInt(classId, 10));
    }

    if (termId) {
      sql += ' AND cr.term_id = ?';
      params.push(parseInt(termId, 10));
    }

    sql += ' ORDER BY c.name, t.name, cr.requirement_item';

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows
    });

  } catch (error: any) {
    console.error('Class requirements fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch class requirements'
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
    const { class_id, term_id, requirements } = body;

    if (!class_id || !term_id || !Array.isArray(requirements) || requirements.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Class ID, term ID, and requirements array are required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      const insertedIds = [];

      for (const req of requirements) {
        const { requirement_item, description, quantity, is_mandatory = 1 } = req;

        if (!requirement_item) {
          throw new Error('Requirement item is required for each entry');
        }

        const [result] = await connection.execute(`
          INSERT INTO class_requirements (
            schoolId, class_id, term_id, requirement_item, 
            description, quantity, is_mandatory
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            description = VALUES(description),
            quantity = VALUES(quantity),
            is_mandatory = VALUES(is_mandatory),
            updated_at = CURRENT_TIMESTAMP
        `, [schoolId, class_id, term_id, requirement_item, description, quantity, is_mandatory]);

        insertedIds.push(result.insertId || result.insertId);
      }

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: `${requirements.length} requirements saved successfully`,
        data: { ids: insertedIds }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Bulk requirements creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create requirements'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
