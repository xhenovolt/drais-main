/**
 * Device Access Logs API Routes
 *
 * GET /api/device-logs - Fetch device access logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;

  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;
    // schoolId from session auth (above)
    const limit = parseInt(req.nextUrl.searchParams.get('limit', 10) || '100', 10);
    const offset = parseInt(req.nextUrl.searchParams.get('offset', 10) || '0', 10);
    const accessResult = req.nextUrl.searchParams.get('accessResult'); // Filter: 'granted' or 'denied'

    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'School ID required' }, { status: 400 });
    }

    connection = await getConnection();

    // Build query with filters
    let whereClause = 'dc.school_id = ?';
    const params: any[] = [schoolId];

    if (accessResult && ['granted', 'denied'].includes(accessResult)) {
      whereClause += ' AND dal.access_result = ?';
      params.push(accessResult);
    }

    // Get total count
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM device_access_logs dal
       JOIN device_configs dc ON dal.device_config_id = dc.id
       WHERE ${whereClause}`,
      params
    );

    const total = (countResult as any)[0]?.total || 0;

    // Get paginated logs
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const [logs] = await connection.execute(
      `SELECT 
        dal.id,
        dal.device_config_id,
        dal.event_timestamp,
        dal.user_id,
        dal.card_number,
        dal.person_name,
        dal.access_result,
        dal.device_event_id,
        dal.device_event_type,
        dc.device_name,
        dc.device_serial_number
      FROM device_access_logs dal
      JOIN device_configs dc ON dal.device_config_id = dc.id
      WHERE ${whereClause}
      ORDER BY dal.event_timestamp DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [...params]
    );

    // Format response
    const formattedLogs = (logs as any).map((log: any) => ({
      id: log.id,
      timestamp: log.event_timestamp,
      userId: log.user_id,
      cardNumber: log.card_number,
      personName: log.person_name,
      accessResult: log.access_result,
      eventType: log.device_event_type,
      deviceName: log.device_name,
      deviceSerial: log.device_serial_number
    }));

    return NextResponse.json({
      success: true,
      data: {
        logs: formattedLogs,
        pagination: {
          total,
          limit,
          offset,
          hasNextPage: offset + limit < total
        }
      }
    });
  } catch (error: any) {
    console.error(`[Device Logs API] GET error: ${error.message}`);
    return NextResponse.json({ success: false, message: 'Failed to load device logs', error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// POST: Manually fetch/sync logs from device
export async function POST(req: NextRequest) {
  let connection;

  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const requestData = await req.json();
    // schoolId from session auth (above)

    if (!schoolId) {
      return NextResponse.json({ success: false, message: 'School ID required' }, { status: 400 });
    }

    // TODO: Implement pulling fresh logs from device
    // This would:
    // 1. Load device config
    // 2. Call DahuaDeviceService.fetchAccessLogs()
    // 3. Parse and store results in device_access_logs table
    // 4. Return the newly synced logs

    connection = await getConnection();

    // For now, just return most recent logs
    const [logs] = await connection.execute(
      `SELECT * FROM device_access_logs 
       WHERE device_config_id IN (
         SELECT id FROM device_configs WHERE school_id = ?
       )
       ORDER BY event_timestamp DESC
       LIMIT 50`,
      [schoolId]
    );

    return NextResponse.json({
      success: true,
      message: 'Device logs synced successfully',
      data: {
        syncedCount: (logs as any).length,
        logs: logs
      }
    });
  } catch (error: any) {
    console.error(`[Device Logs API] POST error: ${error.message}`);
    return NextResponse.json({ success: false, message: 'Failed to sync device logs', error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
