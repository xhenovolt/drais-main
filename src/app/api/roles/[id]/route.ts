import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

/**
 * PUT /api/roles/[id]
 * Update a role
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let connection;
  try {
    const body = await req.json();
    const { name, description } = body;
    const roleId = params.id;

    if (!name) {
      return NextResponse.json({
        success: false,
        error: 'Role name is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    await connection.execute(
      'UPDATE roles SET name = ?, description = ? WHERE id = ?',
      [name, description || null, roleId]
    );

    return NextResponse.json({
      success: true,
      message: 'Role updated successfully'
    });

  } catch (error: any) {
    console.error('Role update error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update role'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * DELETE /api/roles/[id]
 * Delete a role
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  let connection;
  try {
    const roleId = params.id;
    connection = await getConnection();

    // Check if role is in use by any staff
    const [staff] = await connection.execute(
      'SELECT COUNT(*) as count FROM staff WHERE role_id = ?',
      [roleId]
    );

    if ((staff as any)[0].count > 0) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete role that is assigned to staff'
      }, { status: 400 });
    }

    await connection.execute('DELETE FROM roles WHERE id = ?', [roleId]);

    return NextResponse.json({
      success: true,
      message: 'Role deleted successfully'
    });

  } catch (error: any) {
    console.error('Role delete error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete role'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
