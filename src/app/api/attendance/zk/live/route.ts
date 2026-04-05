import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/attendance/zk/live
 *
 * Returns the latest 50 ZKTeco attendance punches with resolved
 * student/staff names and device status for the live biometric monitor.
 *
 * Query params:
 *   school_id   (optional, defaults to 1)
 *   limit       (optional, defaults to 50, max 200)
 *   since_id    (optional, returns only records after this id for polling)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const schoolId = parseInt(searchParams.get('school_id', 10) || '1', 10) || 1;
    const rawLimit = parseInt(searchParams.get('limit', 10) || '50', 10);
    const limit = Math.min(Math.max(rawLimit, 1), 200);
    const sinceId = parseInt(searchParams.get('since_id', 10) || '0', 10) || 0;

    // ── Fetch latest punches with resolved identities ──────────────────────
    const sinceClause = sinceId > 0 ? 'AND al.id > ?' : '';
    const params: unknown[] = sinceId > 0 ? [schoolId, sinceId, limit] : [schoolId, limit];

    const logs = await query(
      `SELECT
         al.id,
         al.device_sn,
         al.device_user_id       AS biometric_id,
         al.student_id,
         al.staff_id,
         al.check_time,
         al.verify_type,
         al.io_mode,
         al.matched,
         al.created_at,
         -- Device status
         d.model_name            AS device_model,
         d.last_seen             AS device_last_seen,
         d.is_online             AS device_is_online,
         -- Student details (if matched)
         CONCAT(sp.first_name, ' ', sp.last_name) AS student_name,
         sc.name                 AS student_class,
         -- Staff details (if matched)
         CONCAT(tp.first_name, ' ', tp.last_name) AS staff_name,
         st.position             AS staff_position
       FROM zk_attendance_logs al
       LEFT JOIN devices d          ON al.device_sn = d.sn
       LEFT JOIN students s         ON al.student_id = s.id AND s.school_id = ?
       LEFT JOIN people sp          ON s.person_id = sp.id
       LEFT JOIN enrollments e      ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN classes sc         ON e.class_id = sc.id
       LEFT JOIN staff st           ON al.staff_id = st.id
       LEFT JOIN people tp          ON st.person_id = tp.id
       WHERE al.school_id = ? ${sinceClause}
       ORDER BY al.id DESC
       LIMIT ?`,
      sinceId > 0 ? [schoolId, schoolId, sinceId, limit] : [schoolId, schoolId, limit],
    );

    // ── Device summary (online count) ──────────────────────────────────────
    const deviceStats = await query(
      `SELECT
         COUNT(*) AS total_devices,
         SUM(CASE WHEN TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= 120 THEN 1 ELSE 0 END) AS online_devices
       FROM devices
       WHERE school_id = ?`,
      [schoolId],
    );

    const stats = Array.isArray(deviceStats) && deviceStats.length > 0 ? deviceStats[0] : {};

    // ── Transform logs ─────────────────────────────────────────────────────
    const rows = Array.isArray(logs) ? logs : [];
    const transformed = rows.map((row: any) => {
      const secondsAgo = row.device_last_seen
        ? Math.floor((Date.now() - new Date(row.device_last_seen).getTime()) / 1000)
        : null;

      let resolvedName: string | null = null;
      let role: 'student' | 'staff' | 'unknown' = 'unknown';
      let classInfo: string | null = null;

      if (row.student_id && row.student_name) {
        resolvedName = row.student_name;
        role = 'student';
        classInfo = row.student_class || null;
      } else if (row.staff_id && row.staff_name) {
        resolvedName = row.staff_name;
        role = 'staff';
        classInfo = row.staff_position || null;
      }

      return {
        id: row.id,
        device_sn: row.device_sn,
        biometric_id: row.biometric_id,
        student_id: row.student_id ?? null,
        staff_id: row.staff_id ?? null,
        check_time: row.check_time,
        verify_type: row.verify_type,
        io_mode: row.io_mode,
        matched: !!row.matched,
        created_at: row.created_at,
        resolved_name: resolvedName,
        role,
        class_info: classInfo,
        device: {
          model: row.device_model ?? null,
          last_seen: row.device_last_seen ?? null,
          seconds_ago: secondsAgo,
          is_active: secondsAgo !== null && secondsAgo <= 120,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        logs: transformed,
        total_count: rows.length,
        latest_id: rows.length > 0 ? rows[0].id : 0,
        devices: {
          total: Number((stats as any)?.total_devices ?? 0),
          online: Number((stats as any)?.online_devices ?? 0),
        },
      },
    });
  } catch (err) {
    console.error('[/api/attendance/zk/live] Error:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch live attendance data', data: null },
      { status: 500 },
    );
  }
}
