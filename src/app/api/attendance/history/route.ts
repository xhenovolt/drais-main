import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { ensureAttendanceEngineSchema } from '@/lib/attendance/migrations/attendance-tables-schema';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/history
 *
 * Canonical punch history for the attendance logs page.
 * Reads attendance_raw_events so records remain visible even if the
 * biometric device goes offline or is powered down later.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { schoolId } = session;
  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') || 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const offset = (page - 1) * limit;
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const deviceSn = url.searchParams.get('device_sn');
  const matchedFilter = url.searchParams.get('matched');
  const userType = url.searchParams.get('user_type');
  const search = url.searchParams.get('search');
  const classId = url.searchParams.get('class_id');
  const gender = url.searchParams.get('gender');

  try {
    await ensureAttendanceEngineSchema();

    const conditions: string[] = ['ar.school_id = ?'];
    const params: any[] = [schoolId];

    if (dateFrom) {
      conditions.push('ar.punch_at >= ?');
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      conditions.push('ar.punch_at <= ?');
      params.push(`${dateTo} 23:59:59`);
    }
    if (deviceSn) {
      conditions.push('ar.device_sn = ?');
      params.push(deviceSn);
    }
    if (matchedFilter === '1' || matchedFilter === '0') {
      conditions.push('ar.matched = ?');
      params.push(Number(matchedFilter));
    }
    if (tab === 'learners' || userType === 'student') {
      conditions.push("COALESCE(ar.role_type, 'student') = 'student'");
    } else if (tab === 'staff' || userType === 'staff') {
      conditions.push("COALESCE(ar.role_type, 'staff') = 'staff'");
    } else if (tab === 'unmatched') {
      conditions.push('(ar.matched = 0 OR ar.person_id IS NULL)');
    }
    if (search) {
      conditions.push(
        `(ar.device_user_id LIKE ? OR ar.display_name LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR dud.device_name LIKE ?)`,
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (classId) {
      conditions.push(
        `EXISTS (
          SELECT 1
            FROM students s
            JOIN enrollments e ON e.student_id = s.id
           WHERE s.person_id = ar.person_id
             AND e.status = 'active'
             AND e.class_id = ?
        )`,
      );
      params.push(Number(classId));
    }
    if (gender) {
      conditions.push('p.gender = ?');
      params.push(gender);
    }

    const where = conditions.join(' AND ');

    const countRows = await query(
      `SELECT COUNT(*) AS total
         FROM attendance_raw_events ar
         LEFT JOIN people p ON ar.person_id = p.id
         LEFT JOIN device_user_directory dud
           ON dud.school_id = ar.school_id
          AND dud.device_sn = ar.device_sn
          AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
        WHERE ${where}`,
      params,
    );
    const total = Number(countRows[0]?.total || 0);

    const tabCountsRows = await query(
      `SELECT
         COUNT(*) AS total_all,
         SUM(CASE WHEN COALESCE(ar.role_type, 'student') = 'student' THEN 1 ELSE 0 END) AS total_learners,
         SUM(CASE WHEN COALESCE(ar.role_type, 'staff') = 'staff' THEN 1 ELSE 0 END) AS total_staff,
         SUM(CASE WHEN ar.matched = 0 OR ar.person_id IS NULL THEN 1 ELSE 0 END) AS total_unmatched
       FROM attendance_raw_events ar
       LEFT JOIN people p ON ar.person_id = p.id
       LEFT JOIN device_user_directory dud
         ON dud.school_id = ar.school_id
        AND dud.device_sn = ar.device_sn
        AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
       WHERE ar.school_id = ?`,
      [schoolId],
    );

    const rows = await query(
      `SELECT
         ar.id,
         ar.device_sn,
         CAST(ar.device_user_id AS CHAR) AS device_user_id,
         ar.punch_at AS check_time,
         ar.verify_type,
         ar.io_mode,
         ar.derived_event,
         ar.derived_detail,
         ar.matched,
         ar.role_type,
         ar.display_name,
         ar.person_id,
         ar.enrollment_id,
         ar.source,
         ar.legacy_table,
         ar.legacy_id,
         d.device_name,
         d.location AS device_location,
         dud.device_name AS device_known_name,
         p.first_name,
         p.last_name,
         p.photo_url,
         p.gender,
         c.name AS class_name,
         s.admission_no
       FROM attendance_raw_events ar
       LEFT JOIN devices d ON ar.device_sn = d.sn
       LEFT JOIN people p ON ar.person_id = p.id
       LEFT JOIN students s ON p.id = s.person_id AND s.school_id = ar.school_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON e.class_id = c.id
       LEFT JOIN device_user_directory dud
         ON dud.school_id = ar.school_id
        AND dud.device_sn = ar.device_sn
        AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
       WHERE ${where}
       ORDER BY ar.punch_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const enriched = (rows as any[]).map((row) => {
      const personName = row.display_name || (row.first_name || row.last_name
        ? [row.first_name, row.last_name].filter(Boolean).join(' ')
        : row.device_known_name || null);

      return {
        ...row,
        person_name: personName,
        person_type: row.role_type || 'unmatched',
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
      tab_counts: {
        all: Number(tabCountsRows[0]?.total_all || 0),
        learners: Number(tabCountsRows[0]?.total_learners || 0),
        staff: Number(tabCountsRows[0]?.total_staff || 0),
        unmatched: Number(tabCountsRows[0]?.total_unmatched || 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[Attendance History] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load attendance history', details: err?.message },
      { status: 500 },
    );
  }
}
