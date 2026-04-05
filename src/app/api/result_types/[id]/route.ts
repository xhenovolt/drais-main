import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const { name, code, description, weight, deadline } = body;
    const resolvedParams = await params;
    const id = resolvedParams.id;

    if (!name || !code || weight === undefined) {
      return NextResponse.json({ 
        success: false, 
        error: 'Name, code, and weight are required' 
      }, { status: 400 });
    }

    connection = await getConnection();
    
    const deadlineValue = deadline ? new Date(deadline).toISOString().slice(0, 19).replace('T', ' ') : null;
    
    await connection.execute(`
      UPDATE result_types 
      SET name = ?, code = ?, description = ?, weight = ?, deadline = ?, updated_at = NOW() 
      WHERE id = ? AND school_id = ?
    `, [name, code, description || null, weight, deadlineValue, id, schoolId]);

    return NextResponse.json({ success: true, message: 'Result type updated' });
  } catch (error: any) {
    console.error('Error updating result type:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update result type' 
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const id = resolvedParams.id;
    connection = await getConnection();
    
    await connection.execute('DELETE FROM result_types WHERE id = ? AND school_id = ?', [id, schoolId]);

    return NextResponse.json({ success: true, message: 'Result type deleted' });
  } catch (error: any) {
    console.error('Error deleting result type:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to delete result type' 
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
