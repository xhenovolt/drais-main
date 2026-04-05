import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { logActivity } from '@/lib/multi-tenancy';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Device User Mappings by ID API
 * PUT /api/device-mappings/[id] - Update mapping
 * DELETE /api/device-mappings/[id] - Delete mapping
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }
    const tenant = { schoolId: session.schoolId };

    const { id } = await params;
    const mappingId = parseInt(id, 10);
    const body = await req.json();

    if (isNaN(mappingId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      );
    }

    const connection = await getConnection();
    try {
      // Check if mapping exists and belongs to this school
      const [existing]: any = await connection.execute(
        `SELECT id, device_user_id FROM device_user_mappings WHERE id = ? AND school_id = ?`,
        [mappingId, tenant.schoolId]
      );

      if (existing.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Device mapping not found' },
          { status: 404 }
        );
      }

      // Update mapping
      const updateFields = [];
      const updateValues = [];

      if (body.device_user_id !== undefined) {
        updateFields.push('device_user_id = ?');
        updateValues.push(body.device_user_id);
      }
      if (body.status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(body.status);
      }
      if (body.enrollment_status !== undefined) {
        updateFields.push('enrollment_status = ?');
        updateValues.push(body.enrollment_status);
      }

      if (updateFields.length === 0) {
        return NextResponse.json({
          success: true,
          data: { id: mappingId }
        });
      }

      updateValues.push(mappingId);
      const query = `UPDATE device_user_mappings SET ${updateFields.join(', ')} WHERE id = ?`;

      await connection.execute(query, updateValues);

      // Log activity
      await logActivity(
        tenant.schoolId,
        'update',
        'device_mapping',
        mappingId,
        null,
        body
      );

      return NextResponse.json({
        success: true,
        data: { id: mappingId }
      });
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Update mapping error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }
    const tenant = { schoolId: session.schoolId };

    const { id } = await params;
    const mappingId = parseInt(id, 10);

    if (isNaN(mappingId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mapping ID' },
        { status: 400 }
      );
    }

    const connection = await getConnection();
    try {
      // Check if mapping exists and belongs to this school
      const [existing]: any = await connection.execute(
        `SELECT id FROM device_user_mappings WHERE id = ? AND school_id = ?`,
        [mappingId, tenant.schoolId]
      );

      if (existing.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Device mapping not found' },
          { status: 404 }
        );
      }

      // Delete mapping
      await connection.execute(
        `DELETE FROM device_user_mappings WHERE id = ?`,
        [mappingId]
      );

      // Log activity
      await logActivity(
        tenant.schoolId,
        'delete',
        'device_mapping',
        mappingId,
        null,
        {}
      );

      return NextResponse.json({
        success: true,
        message: 'Device mapping deleted successfully'
      });
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Delete mapping error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
