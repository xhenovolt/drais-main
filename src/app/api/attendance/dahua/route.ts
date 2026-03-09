import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { 
  parseDahuaRawData, 
  generateMockDahuaData,
  formatToMySQLDateTime,
  determineAttendanceStatus,
  NormalizedDahuaRecord
} from '@/lib/dahua';

/**
 * GET /api/attendance/dahua
 * List all Dahua devices
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
        d.id,
        d.school_id,
        d.device_name,
        d.device_code,
        d.ip_address,
        d.port,
        d.api_url,
        d.device_type,
        d.protocol,
        d.status,
        d.last_sync,
        d.last_sync_status,
        d.auto_sync_enabled,
        d.sync_interval_minutes,
        d.late_threshold_minutes,
        d.created_at,
        d.updated_at,
        (SELECT COUNT(*) FROM dahua_sync_history ds WHERE ds.device_id = d.id AND DATE(ds.started_at) = CURDATE()) as today_syncs,
        (SELECT COUNT(*) FROM dahua_attendance_logs dal WHERE dal.device_id = d.id AND DATE(dal.event_time) = CURDATE()) as today_records
      FROM dahua_devices d
      WHERE d.school_id = ?
    `;

    const params: any[] = [schoolId];

    if (status) {
      sql += ` AND d.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY d.device_name ASC`;

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows || []
    });

  } catch (error: any) {
    console.error('Dahua devices fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch Dahua devices'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * POST /api/attendance/dahua
 * Register a new Dahua device
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
      ip_address,
      port = 80,
      api_url,
      username,
      password,
      device_type = 'attendance',
      protocol = 'http',
      auto_sync_enabled = true,
      sync_interval_minutes = 15,
      late_threshold_minutes = 30 } = body;

    if (!device_name || !ip_address || !api_url) {
      return NextResponse.json({
        success: false,
        error: 'device_name, ip_address, and api_url are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Check if device_code already exists
    if (device_code) {
      const [existing] = await connection.execute(
        'SELECT id FROM dahua_devices WHERE device_code = ?',
        [device_code]
      );

      if (Array.isArray(existing) && existing.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'Device code already exists'
        }, { status: 409 });
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO dahua_devices (
        schoolId, device_name, device_code, ip_address, port, api_url,
        username, password, device_type, protocol, status,
        auto_sync_enabled, sync_interval_minutes, late_threshold_minutes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NOW())`,
      [
        schoolId, device_name, device_code, ip_address, port, api_url,
        username, password, device_type, protocol, auto_sync_enabled,
        sync_interval_minutes, late_threshold_minutes
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Dahua device registered successfully',
      data: {
        id: (result as any).insertId,
        device_code,
        status: 'active'
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Dahua device registration error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to register Dahua device'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
