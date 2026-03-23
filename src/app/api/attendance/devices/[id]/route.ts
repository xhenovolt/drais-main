import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/attendance/devices/[id]
 * Get specific device details
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source') || 'dahua';

    connection = await getConnection();

    let rows;
    if (source === 'dahua') {
      [rows] = await connection.execute(
        `SELECT 
          d.*,
          (SELECT COUNT(*) FROM dahua_sync_history ds WHERE ds.device_id = d.id) as total_syncs,
          (SELECT COUNT(*) FROM dahua_attendance_logs dal WHERE dal.device_id = d.id) as total_records,
          (SELECT last_sync_timestamp FROM device_sync_checkpoints WHERE device_id = d.id) as last_checkpoint
        FROM dahua_devices d
        WHERE d.id = ?`,
        [id]
      );
    } else {
      [rows] = await connection.execute(
        `SELECT 
          b.*,
          (SELECT COUNT(*) FROM device_logs dl WHERE dl.device_id = b.id) as total_records,
          (SELECT last_sync_timestamp FROM device_sync_checkpoints WHERE device_id = b.id) as last_checkpoint
        FROM biometric_devices b
        WHERE b.id = ?`,
        [id]
      );
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Device not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: rows[0]
    });

  } catch (error: any) {
    console.error('Device fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * PUT /api/attendance/devices/[id]
 * Update a device
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    const body = await req.json();
    const { source = 'dahua' } = body;

    const updateFields: string[] = [];
    const updateValues: any[] = [];

    // Common fields
    const allowedFields = [
      'device_name', 'ip_address', 'port', 'status',
      'auto_sync_enabled', 'sync_interval_minutes', 'poll_interval_seconds',
      'late_threshold_minutes'
    ];

    // Dahua specific fields
    const dahuaFields = ['username', 'password', 'protocol', 'api_url', 'device_type'];

    for (const field of [...allowedFields, ...dahuaFields]) {
      if (body[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(body[field]);
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No fields to update'
      }, { status: 400 });
    }

    updateValues.push(id);
    connection = await getConnection();

    let table = source === 'dahua' ? 'dahua_devices' : 'biometric_devices';
    let idField = source === 'dahua' ? 'id' : 'id';

    await connection.execute(
      `UPDATE ${table} SET ${updateFields.join(', ')} WHERE ${idField} = ?`,
      updateValues
    );

    // Log the configuration update
    await connection.execute(
      `INSERT INTO device_connection_logs (device_id, action, status, request_data) VALUES (?, 'config_update', 'success', ?)`,
      [id, JSON.stringify(body)]
    );

    return NextResponse.json({
      success: true,
      message: 'Device updated successfully'
    });

  } catch (error: any) {
    console.error('Device update error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * DELETE /api/attendance/devices/[id]
 * Delete a device
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source') || 'dahua';

    connection = await getConnection();

    let table = source === 'dahua' ? 'dahua_devices' : 'biometric_devices';

    // Check if device exists
    const [existing] = await connection.execute(
      `SELECT id FROM ${table} WHERE id = ?`,
      [id]
    );

    if (!Array.isArray(existing) || existing.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Device not found'
      }, { status: 404 });
    }

    // Delete device
    await connection.execute(
      `DELETE FROM ${table} WHERE id = ?`,
      [id]
    );

    // Clean up related records
    await connection.execute(
      `DELETE FROM device_sync_checkpoints WHERE device_id = ?`,
      [id]
    );

    return NextResponse.json({
      success: true,
      message: 'Device deleted successfully'
    });

  } catch (error: any) {
    console.error('Device delete error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
