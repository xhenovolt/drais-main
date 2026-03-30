import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { logActivity } from '@/lib/multi-tenancy';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Device User Mappings by Device API
 * Create or update device mapping for a student using a specific device
 * POST /api/device-mappings/by-device - Create/update mapping with device_id
 */

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }
    const tenant = { schoolId: session.schoolId };

    const body = await req.json();
    const { device_id, student_id, staff_id, device_user_id } = body;

    // Determine the entity type and ID
    const entityType = student_id ? 'student' : staff_id ? 'staff' : null;
    const entityId = student_id || staff_id;

    // Validation
    if (!entityId || !device_user_id) {
      return NextResponse.json(
        { success: false, error: 'Either student_id or staff_id, and device_user_id are required' },
        { status: 400 }
      );
    }

    const connection = await getConnection();
    try {
      // If no device_id provided, get the first active device for the school
      let finalDeviceId = device_id;

      if (!finalDeviceId) {
        const [devices]: any = await connection.execute(
          `SELECT id FROM biometric_devices
           WHERE school_id = ? AND status = 'active'
           ORDER BY created_at ASC LIMIT 1`,
          [tenant.schoolId]
        );

        if (devices.length === 0) {
          return NextResponse.json(
            { success: false, error: 'No biometric device found. Please create a device first.' },
            { status: 404 }
          );
        }

        finalDeviceId = devices[0].id;
      }

      // Verify device belongs to school (only if device_id was provided)
      if (device_id) {
        const [deviceCheck]: any = await connection.execute(
          `SELECT id FROM biometric_devices WHERE id = ? AND school_id = ?`,
          [finalDeviceId, tenant.schoolId]
        );

        if (deviceCheck.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Device not found in your school' },
            { status: 404 }
          );
        }
      }

      // Verify student belongs to school
      const [studentCheck]: any = await connection.execute(
        `SELECT id FROM students WHERE id = ? AND school_id = ?`,
        [entityId, tenant.schoolId]
      );

      if (entityType === 'student' && studentCheck.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Student not found in your school' },
          { status: 404 }
        );
      }

      // Verify staff belongs to school
      if (entityType === 'staff') {
        const [staffCheck]: any = await connection.execute(
          `SELECT id FROM staff WHERE id = ? AND school_id = ?`,
          [entityId, tenant.schoolId]
        );

        if (staffCheck.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Staff member not found in your school' },
            { status: 404 }
          );
        }
      }

      // Check for existing mapping for this entity + device
      const whereClause = entityType === 'student'
        ? `device_id = ? AND student_id = ?`
        : `device_id = ? AND staff_id = ?`;

      const [existing]: any = await connection.execute(
        `SELECT id FROM device_user_mappings WHERE ${whereClause}`,
        [finalDeviceId, entityId]
      );

      if (existing.length > 0) {
        // Update existing mapping
        await connection.execute(
          `UPDATE device_user_mappings
           SET device_user_id = ?, status = 'active', mappings_sync_status = 'pending'
           WHERE id = ?`,
          [device_user_id, existing[0].id]
        );

        await logActivity(
          tenant.schoolId,
          'update',
          'device_mapping',
          existing[0].id,
          null,
          { device_user_id }
        );

        return NextResponse.json({
          success: true,
          data: {
            id: existing[0].id,
            device_id: finalDeviceId,
            ...(entityType === 'student' ? { student_id: entityId } : { staff_id: entityId }),
            device_user_id,
            status: 'active',
          },
        });
      }

      // Check for duplicate mapping (same device + device_user_id)
      const [duplicateCheck]: any = await connection.execute(
        `SELECT id FROM device_user_mappings
         WHERE device_id = ? AND device_user_id = ?`,
        [finalDeviceId, device_user_id]
      );

      if (duplicateCheck.length > 0) {
        const entityName = entityType === 'student' ? 'student' : 'staff member';
        return NextResponse.json(
          { success: false, error: `This biometric ID is already assigned to another ${entityName} on this device` },
          { status: 409 }
        );
      }

      // Create new mapping
      const columns = entityType === 'student'
        ? '(school_id, device_id, student_id, device_user_id, status, mappings_sync_status)'
        : '(school_id, device_id, staff_id, device_user_id, status, mappings_sync_status)';

      const [result]: any = await connection.execute(
        `INSERT INTO device_user_mappings
         ${columns}
         VALUES (?, ?, ?, ?, 'active', 'pending')`,
        [tenant.schoolId, finalDeviceId, entityId, device_user_id]
      );

      // Log activity
      await logActivity(
        tenant.schoolId,
        'create',
        'device_mapping',
        result.insertId,
        null,
        { device_id: finalDeviceId, ...(entityType === 'student' ? { student_id: entityId } : { staff_id: entityId }), device_user_id }
      );

      return NextResponse.json({
        success: true,
        data: {
          id: result.insertId,
          device_id: finalDeviceId,
          ...(entityType === 'student' ? { student_id: entityId } : { staff_id: entityId }),
          device_user_id,
          status: 'active',
        },
      });
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Create mapping by device error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
