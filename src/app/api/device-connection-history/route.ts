/**
 * Device Connection History API Routes
 *
 * GET /api/device-connection-history - Fetch connection attempt history
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

    const limit = parseInt(req.nextUrl.searchParams.get('limit', 10) || '50', 10);
    const offset = parseInt(req.nextUrl.searchParams.get('offset', 10) || '0', 10);
    const status = req.nextUrl.searchParams.get('status'); // Filter: 'success', 'failed', 'timeout', etc.

    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'School ID required' }, { status: 400 });
    }

    connection = await getConnection();

    // Build query with filters
    let whereClause = 'dc.school_id = ?';
    const params: any[] = [schoolId];

    if (status && ['success', 'failed', 'timeout', 'unauthorized', 'unreachable', 'api_error'].includes(status)) {
      whereClause += ' AND dch.status = ?';
      params.push(status);
    }

    // Get total count
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM device_connection_history dch
       JOIN device_configs dc ON dch.device_config_id = dc.id
       WHERE ${whereClause}`,
      params
    );

    const total = (countResult as any)[0]?.total || 0;

    // Get paginated history
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const [history] = await connection.execute(
      `SELECT 
        dch.id,
        dch.connection_attempt_type,
        dch.status,
        dch.http_status_code,
        dch.error_message,
        dch.response_time_ms,
        dch.ip_address,
        dch.port,
        dch.created_at,
        dc.device_name,
        dc.device_serial_number
      FROM device_connection_history dch
      JOIN device_configs dc ON dch.device_config_id = dc.id
      WHERE ${whereClause}
      ORDER BY dch.created_at DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [...params]
    );

    // Calculate success rate from history
    const [statsResult] = await connection.execute(
      `SELECT 
        COUNT(*) as total_attempts,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_attempts
      FROM device_connection_history dch
      JOIN device_configs dc ON dch.device_config_id = dc.id
      WHERE ${whereClause}`,
      params
    );

    const stats = (statsResult as any)[0];
    const successRate =
      stats.total_attempts > 0 ? ((stats.successful_attempts / stats.total_attempts) * 100).toFixed(2) : '0.00';

    // Format response
    const formattedHistory = (history as any).map((item: any) => ({
      id: item.id,
      attemptType: item.connection_attempt_type,
      status: item.status,
      httpStatusCode: item.http_status_code,
      errorMessage: item.error_message,
      responseTimeMs: item.response_time_ms,
      ip: item.ip_address,
      port: item.port,
      timestamp: item.created_at,
      deviceName: item.device_name,
      deviceSerial: item.device_serial_number
    }));

    return NextResponse.json({
      success: true,
      data: {
        attempts: formattedHistory,
        stats: {
          totalAttempts: stats.total_attempts,
          successfulAttempts: stats.successful_attempts,
          successRate: `${successRate}%`
        },
        pagination: {
          total,
          limit,
          offset,
          hasNextPage: offset + limit < total
        }
      }
    });
  } catch (error: any) {
    console.error(`[Device Connection History API] GET error: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
