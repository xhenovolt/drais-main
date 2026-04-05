import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/attendance/devices/logs
 * Get device logs with filtering
 * 
 * Query params:
 * - device_id: number (optional)
 * - user_type: 'learner' | 'staff' | 'all'
 * - start_date: string (YYYY-MM-DD)
 * - end_date: string (YYYY-MM-DD)
 * - search: string (search by user_identifier)
 * - processed: '0' | '1' | 'all'
 * - page: number (default 1)
 * - limit: number (default 50)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { searchParams } = new URL(req.url);
    const deviceId = searchParams.get('device_id');
    const userType = searchParams.get('user_type') || 'all';
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const search = searchParams.get('search');
    const processed = searchParams.get('processed') || 'all';
    const page = parseInt(searchParams.get('page', 10) || '1');
    const limit = parseInt(searchParams.get('limit', 10) || '50');
    const offset = (page - 1) * limit;

    connection = await getConnection();

    let whereClause = '1=1';
    const params: any[] = [];

    if (deviceId) {
      whereClause += ' AND dl.device_id = ?';
      params.push(deviceId);
    }

    if (userType && userType !== 'all') {
      whereClause += ' AND dl.user_type = ?';
      params.push(userType);
    }

    if (startDate) {
      whereClause += ' AND DATE(dl.timestamp) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND DATE(dl.timestamp) <= ?';
      params.push(endDate);
    }

    if (search) {
      whereClause += ' AND (dl.user_identifier LIKE ? OR dl.user_id IN (SELECT id FROM students WHERE first_name LIKE ? OR last_name LIKE ?))';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (processed !== 'all') {
      whereClause += ' AND dl.processed = ?';
      params.push(processed === '1' ? 1 : 0);
    }

    // Get total count
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM device_logs dl WHERE ${whereClause}`,
      params
    );
    const total = (countResult as any[])[0]?.total || 0;

    // Get logs with device info
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const [logs] = await connection.execute(
      `SELECT 
        dl.id,
        dl.device_id,
        dl.user_identifier,
        dl.user_id,
        dl.user_type,
        dl.timestamp,
        dl.event_type,
        dl.method,
        dl.processed,
        dl.created_at,
        d.device_name,
        d.device_type as device_type,
        COALESCE(s.first_name, st.first_name) as first_name,
        COALESCE(s.last_name, st.last_name) as last_name,
        COALESCE(c.name, dep.name) as location
      FROM device_logs dl
      LEFT JOIN dahua_devices d ON dl.device_id = d.id
      LEFT JOIN students s ON dl.user_id = s.id AND dl.user_type = 'learner'
      LEFT JOIN staff st ON dl.user_id = st.id AND dl.user_type = 'staff'
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN departments dep ON st.department_id = dep.id
      WHERE ${whereClause}
      ORDER BY dl.timestamp DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      [...params]
    );

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    });

  } catch (error: any) {
    console.error('Device logs fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch device logs'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * POST /api/attendance/devices/logs
 * Export device logs as CSV
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const body = await req.json();
    const { 
      device_id, 
      user_type = 'all',
      start_date, 
      end_date, 
      format = 'csv' 
    } = body;

    connection = await getConnection();

    let whereClause = '1=1';
    const params: any[] = [];

    if (device_id) {
      whereClause += ' AND dl.device_id = ?';
      params.push(device_id);
    }

    if (user_type && user_type !== 'all') {
      whereClause += ' AND dl.user_type = ?';
      params.push(user_type);
    }

    if (start_date) {
      whereClause += ' AND DATE(dl.timestamp) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND DATE(dl.timestamp) <= ?';
      params.push(end_date);
    }

    // Get logs for export
    const [logs] = await connection.execute(
      `SELECT 
        dl.id,
        dl.device_id,
        d.device_name,
        dl.user_identifier,
        dl.user_type,
        dl.timestamp,
        dl.event_type,
        dl.method,
        dl.processed,
        COALESCE(CONCAT(s.first_name, ' ', s.last_name), CONCAT(st.first_name, ' ', st.last_name), 'Unknown') as user_name,
        COALESCE(c.name, dep.name) as class_department
      FROM device_logs dl
      LEFT JOIN dahua_devices d ON dl.device_id = d.id
      LEFT JOIN students s ON dl.user_id = s.id AND dl.user_type = 'learner'
      LEFT JOIN staff st ON dl.user_id = st.id AND dl.user_type = 'staff'
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN departments dep ON st.department_id = dep.id
      WHERE ${whereClause}
      ORDER BY dl.timestamp DESC
      LIMIT 10000`,
      params
    );

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['ID', 'Device', 'User ID', 'User Type', 'Timestamp', 'Event', 'Method', 'Processed', 'User Name', 'Class/Dept'];
      const csvRows = [headers.join(',')];
      
      for (const log of logs as any[]) {
        const row = [
          log.id,
          log.device_name || log.device_id,
          log.user_identifier,
          log.user_type,
          log.timestamp,
          log.event_type,
          log.method,
          log.processed ? 'Yes' : 'No',
          log.user_name,
          log.class_department || ''
        ];
        csvRows.push(row.map(v => `"${v || ''}"`).join(','));
      }

      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="device_logs_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: logs
    });

  } catch (error: any) {
    console.error('Device logs export error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to export device logs'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
