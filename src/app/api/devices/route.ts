import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { extractTenantContext, logActivity } from '@/lib/multi-tenancy';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Device Management API
 * GET /api/devices?school_id=1 - List all devices
 * POST /api/devices - Register new device
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const tenant = extractTenantContext(req);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'schoolId is required' },
        { status: 400 }
      );
    }

    const connection = await getConnection();
    try {
      // Get devices for this school
      const [devices]: any = await connection.execute(
        `SELECT 
          id,
          device_id,
          device_name,
          serial_number,
          model,
          status,
          location,
          ip_address,
          last_sync_at,
          sync_failed_count,
          last_error,
          max_users,
          total_logs_fetched,
          created_at
        FROM biometric_devices
        WHERE school_id = ? AND status != 'inactive'
        ORDER BY lower(location), device_name`,
        [tenant.school_id]
      );

      // Get sync stats for each device
      const devicesWithStats = await Promise.all(
        devices.map(async (device: any) => {
          const [stats]: any = await connection.execute(
            `SELECT 
              COUNT(*) as total_syncs,
              SUM(logs_processed) as total_logs_processed,
              SUM(logs_unmatched) as total_unmatched,
              MAX(completed_at) as last_sync_completed
            FROM device_sync_history
            WHERE device_id = ? AND school_id = ?`,
            [device.id, tenant.school_id]
          );

          return {
            ...device,
            syncs: stats[0]?.total_syncs || 0,
            logs_processed: stats[0]?.total_logs_processed || 0,
            unmatched_logs: stats[0]?.total_unmatched || 0,
          };
        })
      );

      return NextResponse.json({
        success: true,
        data: devicesWithStats,
      });
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Fetch devices error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const tenant = extractTenantContext(req);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'schoolId is required' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      device_id,
      device_name,
      serial_number,
      model,
      location,
      ip_address,
      max_users = 3000,
    } = body;

    // Validation
    if (!device_id || !device_name) {
      return NextResponse.json(
        { success: false, error: 'device_id and device_name are required' },
        { status: 400 }
      );
    }

    const connection = await getConnection();
    try {
      // Check for duplicate device_id in this school
      const [existing]: any = await connection.execute(
        `SELECT id FROM biometric_devices WHERE school_id = ? AND device_id = ?`,
        [tenant.school_id, device_id]
      );

      if (existing.length > 0) {
        return NextResponse.json(
          { success: false, error: 'Device already registered in this school' },
          { status: 409 }
        );
      }

      // Register device
      const [result]: any = await connection.execute(
        `INSERT INTO biometric_devices 
         (schoolId, device_id, device_name, serial_number, model, location, ip_address, max_users, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [tenant.school_id, device_id, device_name, serial_number || null, model || null, location || null, ip_address || null, max_users]
      );

      // Log activity
      await logActivity(
        tenant.school_id,
        'create',
        'device',
        result.insertId,
        null,
        { device_id, device_name, location, ip_address }
      );

      return NextResponse.json({
        success: true,
        data: {
          id: result.insertId,
          device_id,
          device_name,
          status: 'active',
        },
      });
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Register device error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
