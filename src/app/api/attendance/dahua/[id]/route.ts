import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/attendance/dahua/[id]
 * Get specific Dahua device details
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    connection = await getConnection();

    const [rows] = await connection.execute(
      `SELECT 
        d.*,
        (SELECT COUNT(*) FROM dahua_sync_history ds WHERE ds.device_id = d.id) as total_syncs,
        (SELECT COUNT(*) FROM dahua_attendance_logs dal WHERE dal.device_id = d.id) as total_records
      FROM dahua_devices d
      WHERE d.id = ?`,
      [id]
    );

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
    console.error('Dahua device fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * PUT /api/attendance/dahua/[id]
 * Update a Dahua device
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      device_name,
      ip_address,
      port,
      api_url,
      username,
      password,
      device_type,
      protocol,
      status,
      auto_sync_enabled,
      sync_interval_minutes,
      late_threshold_minutes
    } = body;

    connection = await getConnection();

    // Check if device exists
    const [existing] = await connection.execute(
      'SELECT id FROM dahua_devices WHERE id = ?',
      [id]
    );

    if (!Array.isArray(existing) || existing.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Device not found'
      }, { status: 404 });
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];

    if (device_name) { updates.push('device_name = ?'); values.push(device_name); }
    if (ip_address) { updates.push('ip_address = ?'); values.push(ip_address); }
    if (port) { updates.push('port = ?'); values.push(port); }
    if (api_url) { updates.push('api_url = ?'); values.push(api_url); }
    if (username !== undefined) { updates.push('username = ?'); values.push(username); }
    if (password !== undefined) { updates.push('password = ?'); values.push(password); }
    if (device_type) { updates.push('device_type = ?'); values.push(device_type); }
    if (protocol) { updates.push('protocol = ?'); values.push(protocol); }
    if (status) { updates.push('status = ?'); values.push(status); }
    if (auto_sync_enabled !== undefined) { updates.push('auto_sync_enabled = ?'); values.push(auto_sync_enabled ? 1 : 0); }
    if (sync_interval_minutes) { updates.push('sync_interval_minutes = ?'); values.push(sync_interval_minutes); }
    if (late_threshold_minutes) { updates.push('late_threshold_minutes = ?'); values.push(late_threshold_minutes); }

    if (updates.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No fields to update'
      }, { status: 400 });
    }

    values.push(id);

    await connection.execute(
      `UPDATE dahua_devices SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      values
    );

    return NextResponse.json({
      success: true,
      message: 'Device updated successfully'
    });

  } catch (error: any) {
    console.error('Dahua device update error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * DELETE /api/attendance/dahua/[id]
 * Delete a Dahua device
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    connection = await getConnection();

    // Check if device exists
    const [existing] = await connection.execute(
      'SELECT id FROM dahua_devices WHERE id = ?',
      [id]
    );

    if (!Array.isArray(existing) || existing.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Device not found'
      }, { status: 404 });
    }

    // Soft delete - mark as inactive instead of deleting
    await connection.execute(
      'UPDATE dahua_devices SET status = ? WHERE id = ?',
      ['inactive', id]
    );

    return NextResponse.json({
      success: true,
      message: 'Device deleted successfully'
    });

  } catch (error: any) {
    console.error('Dahua device delete error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
