import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/zk/logs
 * List ZK attendance logs with filtering, search, and pagination.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { schoolId } = session;
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page', 10) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit', 10) || '50', 10)));
  const offset = (page - 1) * limit;
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const deviceSn = url.searchParams.get('device_sn');
  const matchedFilter = url.searchParams.get('matched'); // '1', '0', or null
  const userType = url.searchParams.get('user_type'); // 'student', 'staff', or null
  const search = url.searchParams.get('search');

  try {
    const conditions: string[] = ['al.school_id = ?'];
    const params: any[] = [schoolId];

    if (dateFrom) {
      conditions.push('al.check_time >= ?');
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      conditions.push('al.check_time <= ?');
      params.push(`${dateTo} 23:59:59`);
    }
    if (deviceSn) {
      conditions.push('al.device_sn = ?');
      params.push(deviceSn);
    }
    if (matchedFilter === '1' || matchedFilter === '0') {
      conditions.push('al.matched = ?');
      params.push(parseInt(matchedFilter, 10));
    }
    if (userType === 'student') {
      conditions.push('al.student_id IS NOT NULL');
    } else if (userType === 'staff') {
      conditions.push('al.staff_id IS NOT NULL');
    }
    if (search) {
      conditions.push('(al.device_user_id LIKE ? OR dud.device_name LIKE ?)');
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    // Count
    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM zk_attendance_logs al
       LEFT JOIN device_user_directory dud
         ON dud.school_id = al.school_id
        AND dud.device_sn = al.device_sn
        AND dud.device_user_id = al.device_user_id
       WHERE ${where}`,
      params,
    );
    const total = Number(countResult[0]?.total || 0);

    // Rows
    const rows = await query(
      `SELECT
         al.id, al.device_sn, al.device_user_id, al.student_id, al.staff_id,
         al.check_time, al.verify_type, al.io_mode, al.log_id, al.work_code,
         al.processed, al.matched, al.created_at,
         d.device_name, d.location AS device_location,
         dud.device_name AS device_known_name,
         sp.first_name AS student_first_name,
         sp.last_name AS student_last_name,
         stf.first_name AS staff_first_name,
         stf.last_name AS staff_last_name
       FROM zk_attendance_logs al
       LEFT JOIN devices d ON al.device_sn = d.sn
       LEFT JOIN students st ON al.student_id = st.id
       LEFT JOIN people sp ON st.person_id = sp.id
       LEFT JOIN staff stf ON al.staff_id = stf.id
       LEFT JOIN device_user_directory dud
         ON dud.school_id = al.school_id
        AND dud.device_sn = al.device_sn
        AND dud.device_user_id = al.device_user_id
       WHERE ${where}
       ORDER BY al.check_time DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const enrichedRows = (rows as any[]).map((row) => {
      const studentName = row.student_first_name || row.student_last_name
        ? [row.student_first_name, row.student_last_name].filter(Boolean).join(' ')
        : null;
      const staffName = row.staff_first_name || row.staff_last_name
        ? [row.staff_first_name, row.staff_last_name].filter(Boolean).join(' ')
        : null;

      return {
        ...row,
        person_name: studentName || staffName || row.device_known_name || null,
        person_type: studentName ? 'student' : staffName ? 'staff' : 'unmatched',
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[ZK Logs] Error:', err);
    return NextResponse.json({ success: false, message: 'Failed to load ZK logs', error: err?.message }, { status: 500 });
  }
}
