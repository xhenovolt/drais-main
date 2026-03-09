import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/biometric-devices
 * List all biometric devices
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
    const status = searchParams.get('status');

    connection = await getConnection();

    let sql = `
      SELECT 
        id,
        schoolId,
        device_name,
        device_code,
        device_type,
        manufacturer,
        model,
        serial_number,
        location,
        ip_address,
        status,
        last_sync_at,
        sync_status,
        enrollment_count,
        is_master,
        created_at,
        updated_at
      FROM biometric_devices
      WHERE school_id = ?
    `;

    const params: any[] = [schoolId];

    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY is_master DESC, device_name ASC`;

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows || []
    });

  } catch (error: any) {
    console.error('Biometric devices fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch devices'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * POST /api/biometric-devices
 * Register a new biometric device
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
      device_type = 'fingerprint',
      manufacturer,
      model,
      serial_number,
      location,
      ip_address,
      mac_address,
      api_key,
      api_secret } = body;

    if (!device_name || !device_code) {
      return NextResponse.json({
        success: false,
        error: 'device_name and device_code are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Check if device_code already exists
    const [existing] = await connection.execute(
      'SELECT id FROM biometric_devices WHERE device_code = ?',
      [device_code]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Device code already exists'
      }, { status: 409 });
    }

    const [result] = await connection.execute(
      `INSERT INTO biometric_devices (
        schoolId, device_name, device_code, device_type, manufacturer,
        model, serial_number, location, ip_address, mac_address,
        status, sync_status, api_key, api_secret, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'pending', ?, ?, NOW())`,
      [
        schoolId, device_name, device_code, device_type, manufacturer,
        model, serial_number, location, ip_address, mac_address,
        api_key, api_secret
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Biometric device registered successfully',
      data: {
        id: (result as any).insertId,
        device_code,
        status: 'active'
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Device registration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to register device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
