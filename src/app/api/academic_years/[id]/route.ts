import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await request.json();
    const { status, name, start_date, end_date } = body;

    // Build dynamic SET clause from provided fields
    const fields: string[] = [];
    const values: any[] = [];

    if (status !== undefined) {
      const allowed = ['draft', 'active', 'closed'];
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      fields.push('status = ?');
      values.push(status);

      // If activating this year, close all others for this school
      if (status === 'active') {
        await conn.execute(
          `UPDATE academic_years SET status = 'closed'
           WHERE school_id = ? AND id != ? AND status = 'active'`,
          [schoolId, id]
        );
      }
    }
    if (name !== undefined)       { fields.push('name = ?');       values.push(name); }
    if (start_date !== undefined) { fields.push('start_date = ?'); values.push(start_date || null); }
    if (end_date !== undefined)   { fields.push('end_date = ?');   values.push(end_date || null); }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(schoolId, id);
    const [result]: any = await conn.execute(
      `UPDATE academic_years SET ${fields.join(', ')}, updated_at = NOW()
       WHERE school_id = ? AND id = ? AND deleted_at IS NULL`,
      values
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Academic year not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('academic_years PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update academic year' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const [result]: any = await conn.execute(
      `UPDATE academic_years SET deleted_at = NOW()
       WHERE school_id = ? AND id = ? AND deleted_at IS NULL`,
      [schoolId, id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('academic_years DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete academic year' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
