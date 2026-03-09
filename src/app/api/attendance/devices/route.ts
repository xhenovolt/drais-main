import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/attendance/devices
 * List all devices (both biometric and dahua)
 * 
 * Query params:
 * - school_id: number
 * - device_type: 'all' | 'dahua' | 'zkteco' | 'other'
 * - status: string (filter by status)
 */
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
    const deviceType = searchParams.get('device_type') || 'all';
    const status = searchParams.get('status');

    connection = await getConnection();

    let devices: any[] = [];

    // Fetch Dahua devices
    if (deviceType === 'all' || deviceType === 'dahua') {
      const [dahuaDevices] = await connection.execute(
        `SELECT 
          d.id,
          d.device_name,
          d.device_code,
          d.ip_address,
          d.port,
          d.device_type,
          d.protocol,
          d.status,
          d.last_sync,
          d.last_sync_status,
          d.auto_sync_enabled,
          d.sync_interval_minutes,
          d.poll_interval_seconds,
          d.last_poll_at,
          d.poll_status,
          'dahua' as source,
          d.created_at,
          d.updated_at
        FROM dahua_devices d
        WHERE d.school_id = ? ${status ? 'AND d.status = ?' : ''}`,
        status ? [schoolId, status] : [schoolId]
      );
      devices = [...devices, ...(dahuaDevices as any[])];
    }

    // Fetch generic biometric devices
    if (deviceType === 'all' || (deviceType !== 'dahua')) {
      const typeFilter = deviceType === 'all' ? '' : `AND device_type = '${deviceType}'`;
      const [biometricDevices] = await connection.execute(
        `SELECT 
          b.id,
          b.device_name,
          b.device_code,
          b.ip_address,
          b.mac_address as port,
          b.device_type,
          'http' as protocol,
          b.status,
          b.last_sync_at as last_sync,
          b.sync_status as last_sync_status,
          1 as auto_sync_enabled,
          15 as sync_interval_minutes,
          b.poll_interval_seconds,
          b.last_poll_at,
          b.poll_status,
          'biometric' as source,
          b.created_at,
          b.updated_at
        FROM biometric_devices b
        WHERE b.school_id = ? ${status ? 'AND b.status = ?' : ''} ${typeFilter}`,
        status ? [schoolId, status] : [schoolId]
      );
      devices = [...devices, ...(biometricDevices as any[])];
    }

    // Sort by device name
    devices.sort((a, b) => a.device_name.localeCompare(b.device_name));

    return NextResponse.json({
      success: true,
      data: devices
    });

  } catch (error: any) {
    console.error('Devices fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch devices'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * POST /api/attendance/devices
 * Create a new device (supports Dahua and other types)
 */
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
    const { device_name,
      device_code,
      device_type = 'dahua',
      ip_address,
      port = 80,
      username = '',
      password = '',
      protocol = 'http',
      api_url = '/cgi-bin/attendanceRecord.cgi?action=getRecords',
      auto_sync_enabled = true,
      sync_interval_minutes = 15,
      poll_interval_seconds = 60,
      late_threshold_minutes = 30,
      status = 'active' } = body;

    if (!device_name || !ip_address) {
      return NextResponse.json({
        success: false,
        error: 'device_name and ip_address are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Generate device code if not provided
    const finalDeviceCode = device_code || `DEVICE-${Date.now()}`;

    let insertResult;

    if (device_type === 'dahua') {
      // Insert into dahua_devices
      [insertResult] = await connection.execute(
        `INSERT INTO dahua_devices 
         (schoolId, device_name, device_code, ip_address, port, username, password, device_type, protocol, api_url, auto_sync_enabled, sync_interval_minutes, poll_interval_seconds, late_threshold_minutes, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [schoolId, device_name, finalDeviceCode, ip_address, port, username, password, device_type, protocol, api_url, auto_sync_enabled ? 1 : 0, sync_interval_minutes, poll_interval_seconds, late_threshold_minutes, status]
      );
    } else {
      // Insert into biometric_devices
      [insertResult] = await connection.execute(
        `INSERT INTO biometric_devices 
         (schoolId, device_name, device_code, device_type, ip_address, status) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [schoolId, device_name, finalDeviceCode, device_type, ip_address, status]
      );
    }

    // Initialize sync checkpoint
    await connection.execute(
      `INSERT INTO device_sync_checkpoints (device_id, last_sync_timestamp) VALUES (?, NOW())`,
      [(insertResult as any).insertId]
    );

    return NextResponse.json({
      success: true,
      message: 'Device created successfully',
      data: { id: (insertResult as any).insertId }
    });

  } catch (error: any) {
    console.error('Device create error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
