import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { archiveEntity, TrashError } from '@/lib/trash/service';
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

    const [departments] = await connection.execute(`
      SELECT 
        d.id,
        d.name,
        d.description,
        d.head_staff_id,
        p.first_name as head_first_name,
        p.last_name as head_last_name,
        s.staff_no as head_staff_no,
        COUNT(DISTINCT s2.id) as staff_count
      FROM departments d
      LEFT JOIN staff s ON d.head_staff_id = s.id
      LEFT JOIN people p ON s.person_id = p.id
      LEFT JOIN staff s2 ON s2.department_id = d.id AND s2.status = 'active' AND s2.deleted_at IS NULL
      WHERE d.school_id = ?
      GROUP BY d.id, d.name, d.description, d.head_staff_id, p.first_name, p.last_name, s.staff_no
      ORDER BY d.name
    `, [schoolId]);

    return NextResponse.json({
      success: true,
      data: departments
    });

  } catch (error: any) {
    console.error('Departments fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch departments'
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
    const { name, description, head_staff_id } = body;

    if (!name) {
      return NextResponse.json({
        success: false,
        error: 'Department name is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(`
      INSERT INTO departments (school_id, name, description, head_staff_id)
      VALUES (?, ?, ?, ?)
    `, [schoolId, name, description, head_staff_id]);

    return NextResponse.json({
      success: true,
      message: 'Department created successfully',
      data: { id: result.insertId }
    });

  } catch (error: any) {
    console.error('Department creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create department'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { id, reason } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Department ID is required' }, { status: 400 });
    }

    await archiveEntity({
      code:     'department',
      id:       Number(id),
      schoolId: session.schoolId,
      userId:   session.userId,
      reason:   reason ?? null,
      ip:       req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
    });

    return NextResponse.json({ success: true, message: 'Department archived successfully' });
  } catch (error: unknown) {
    if (error instanceof TrashError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    console.error('Department archive error:', error);
    return NextResponse.json({ success: false, error: 'Failed to archive department' }, { status: 500 });
  }
}
