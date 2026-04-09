import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/unified
 *
 * Unified attendance intelligence endpoint.
 * Joins zk_attendance_logs → students/staff → people → devices
 * for a single enriched view of all biometric events.
 *
 * Query params:
 *   tab       = all | learners | staff | unmatched   (default: all)
 *   page      = 1+
 *   limit     = 1-100    (default: 50)
 *   date_from = YYYY-MM-DD
 *   date_to   = YYYY-MM-DD
 *   device_sn = serial number
 *   search    = name or device_user_id substring
 *   class_id  = filter by class
 *   gender    = M | F
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const tab = url.searchParams.get('tab') || 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page', 10) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit', 10) || '50', 10)));
  const offset = (page - 1) * limit;
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const deviceSn = url.searchParams.get('device_sn');
  const search = url.searchParams.get('search');
  const classId = url.searchParams.get('class_id');
  const gender = url.searchParams.get('gender');

  try {
    // ── Dynamic WHERE ──────────────────────────────────────────────────
    const conditions: string[] = ['al.school_id = ?'];
    const params: any[] = [session.schoolId];

    // Tab-based filtering
    if (tab === 'learners') {
      conditions.push('al.student_id IS NOT NULL');
    } else if (tab === 'staff') {
      conditions.push('al.staff_id IS NOT NULL');
    } else if (tab === 'unmatched') {
      conditions.push('al.matched = 0');
    }

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
    if (search) {
      conditions.push(
        `(al.device_user_id LIKE ? OR sp.first_name LIKE ? OR sp.last_name LIKE ?
          OR stf.first_name LIKE ? OR stf.last_name LIKE ?)`,
      );
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (classId) {
      conditions.push('st.class_id = ?');
      params.push(Number(classId));
    }
    if (gender) {
      conditions.push('sp.gender = ?');
      params.push(gender);
    }

    const where = conditions.join(' AND ');

    // ── Count ──────────────────────────────────────────────────────────
    const countSql = `
      SELECT COUNT(*) AS total
      FROM zk_attendance_logs al
      LEFT JOIN students st ON al.student_id = st.id
      LEFT JOIN people sp ON st.person_id = sp.id
      LEFT JOIN staff stf ON al.staff_id = stf.id
      WHERE ${where}
    `;
    const countResult = await query(countSql, params);
    const total = Number(countResult[0]?.total || 0);

    // ── Tab counts (for badges) ────────────────────────────────────────
    // Use lightweight sub-selects with same date/device/search filter
    const baseFilterConditions: string[] = ['al.school_id = ?'];
    const baseFilterParams: any[] = [session.schoolId];
    if (dateFrom) { baseFilterConditions.push('al.check_time >= ?'); baseFilterParams.push(`${dateFrom} 00:00:00`); }
    if (dateTo) { baseFilterConditions.push('al.check_time <= ?'); baseFilterParams.push(`${dateTo} 23:59:59`); }
    if (deviceSn) { baseFilterConditions.push('al.device_sn = ?'); baseFilterParams.push(deviceSn); }
    const baseWhere = baseFilterConditions.join(' AND ');

    const tabCountsSql = `
      SELECT
        COUNT(*) AS total_all,
        SUM(CASE WHEN al.student_id IS NOT NULL THEN 1 ELSE 0 END) AS total_learners,
        SUM(CASE WHEN al.staff_id IS NOT NULL THEN 1 ELSE 0 END) AS total_staff,
        SUM(CASE WHEN al.matched = 0 THEN 1 ELSE 0 END) AS total_unmatched
      FROM zk_attendance_logs al
      WHERE ${baseWhere}
    `;
    const tabCounts = await query(tabCountsSql, baseFilterParams);
    const counts = tabCounts[0] || {};

    // ── Enriched rows ──────────────────────────────────────────────────
    const dataSql = `
      SELECT
        al.id,
        al.device_sn,
        al.device_user_id,
        al.student_id,
        al.staff_id,
        al.check_time,
        al.verify_type,
        al.io_mode,
        al.matched,
        al.created_at,
        d.device_name,
        d.location AS device_location,
        sp.first_name  AS student_first_name,
        sp.last_name   AS student_last_name,
        sp.photo_url   AS student_photo,
        cl.name        AS class_name,
        stf.first_name AS staff_first_name,
        stf.last_name  AS staff_last_name,
        pfstf.photo_url AS staff_photo
      FROM zk_attendance_logs al
      LEFT JOIN devices d      ON al.device_sn = d.sn
      LEFT JOIN students st    ON al.student_id = st.id
      LEFT JOIN people sp      ON st.person_id = sp.id
      LEFT JOIN classes cl     ON st.class_id = cl.id
      LEFT JOIN staff stf      ON al.staff_id = stf.id
      LEFT JOIN people pfstf   ON stf.person_id = pfstf.id
      WHERE ${where}
      ORDER BY al.check_time DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const rows = await query(dataSql, params);

    // ── Enrich each row with display fields ────────────────────────────
    const enriched = (rows as any[]).map((r) => {
      let personName: string | null = null;
      let personType: 'student' | 'staff' | 'unmatched' = 'unmatched';
      let photoUrl: string | null = null;
      let className: string | null = null;

      if (r.student_id && (r.student_first_name || r.student_last_name)) {
        personName = [r.student_first_name, r.student_last_name].filter(Boolean).join(' ');
        personType = 'student';
        photoUrl = r.student_photo;
        className = r.class_name;
      } else if (r.staff_id && (r.staff_first_name || r.staff_last_name)) {
        personName = [r.staff_first_name, r.staff_last_name].filter(Boolean).join(' ');
        personType = 'staff';
        photoUrl = r.staff_photo;
      }

      return {
        id: r.id,
        device_sn: r.device_sn,
        device_user_id: r.device_user_id,
        check_time: r.check_time,
        verify_type: r.verify_type,
        io_mode: r.io_mode,
        matched: r.matched,
        person_name: personName,
        person_type: personType,
        photo_url: photoUrl,
        class_name: className,
        student_id: r.student_id,
        staff_id: r.staff_id,
        device_name: r.device_name,
        device_location: r.device_location,
      };
    });

    return NextResponse.json({
      success: true,
      data: enriched,
      tab_counts: {
        all: Number(counts.total_all || 0),
        learners: Number(counts.total_learners || 0),
        staff: Number(counts.total_staff || 0),
        unmatched: Number(counts.total_unmatched || 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[Unified Attendance] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to load unified attendance data', details: err?.message },
      { status: 500 },
    );
  }
}
