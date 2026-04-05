import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/device-mappings
 *
 * Returns the combined device user list: data from zk_user_mapping + device_users,
 * cross-referenced against students/staff to show Linked/Unlinked status.
 *
 * Query params:
 *   device_sn  - filter by device
 *   status     - 'linked' | 'unlinked' | '' (all)
 *   search     - search by device_user_id or name
 *   page, limit
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const deviceSn = url.searchParams.get('device_sn');
  const status = url.searchParams.get('status'); // linked | unlinked
  const search = url.searchParams.get('search');
  const page = Math.max(1, parseInt(url.searchParams.get('page', 10) || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit', 10) || '100', 10)));
  const offset = (page - 1) * limit;

  try {
    // ── Build combined user list from both mapping sources ──

    // Source 1: zk_user_mapping (ZK-specific)
    const zkConditions: string[] = ['m.school_id = ?'];
    const zkParams: any[] = [session.schoolId];

    if (deviceSn) {
      zkConditions.push('(m.device_sn = ? OR m.device_sn IS NULL)');
      zkParams.push(deviceSn);
    }
    if (search) {
      zkConditions.push('(m.device_user_id LIKE ? OR sp.first_name LIKE ? OR sp.last_name LIKE ? OR tp.first_name LIKE ? OR tp.last_name LIKE ?)');
      const s = `%${search}%`;
      zkParams.push(s, s, s, s, s);
    }

    const zkWhere = zkConditions.join(' AND ');

    const zkRows = await query(
      `SELECT
         m.device_user_id,
         m.user_type,
         m.student_id,
         m.staff_id,
         m.device_sn,
         m.card_number,
         m.created_at,
         'zk_mapping' AS source,
         COALESCE(CONCAT(sp.first_name, ' ', sp.last_name), CONCAT(tp.first_name, ' ', tp.last_name)) AS person_name,
         sc.name AS class_name,
         st.position AS staff_position
       FROM zk_user_mapping m
       LEFT JOIN students s ON m.student_id = s.id
       LEFT JOIN people sp ON s.person_id = sp.id
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN classes sc ON e.class_id = sc.id
       LEFT JOIN staff st ON m.staff_id = st.id
       LEFT JOIN people tp ON st.person_id = tp.id
       WHERE ${zkWhere}
       ORDER BY CAST(m.device_user_id AS UNSIGNED) ASC`,
      zkParams,
    );

    // Source 2: device_users table (general biometric)
    const duConditions: string[] = ['du.school_id = ?'];
    const duParams: any[] = [session.schoolId];

    if (search) {
      duConditions.push('(CAST(du.device_user_id AS CHAR) LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ?)');
      const s = `%${search}%`;
      duParams.push(s, s, s);
    }

    const duWhere = duConditions.join(' AND ');

    const duRows = await query(
      `SELECT
         CAST(du.device_user_id AS CHAR) AS device_user_id,
         du.person_type AS user_type,
         CASE WHEN du.person_type = 'student' THEN du.person_id ELSE NULL END AS student_id,
         CASE WHEN du.person_type = 'teacher' THEN du.person_id ELSE NULL END AS staff_id,
         du.device_name AS device_sn,
         NULL AS card_number,
         du.created_at,
         'device_users' AS source,
         CONCAT(p.first_name, ' ', p.last_name) AS person_name,
         sc.name AS class_name,
         st.position AS staff_position
       FROM device_users du
       LEFT JOIN students s ON du.person_type = 'student' AND du.person_id = s.id
       LEFT JOIN staff st ON du.person_type = 'teacher' AND du.person_id = st.id
       LEFT JOIN people p ON (s.person_id = p.id OR st.person_id = p.id)
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN classes sc ON e.class_id = sc.id
       WHERE ${duWhere}
       ORDER BY du.device_user_id ASC`,
      duParams,
    );

    // ── Merge: zk_mapping takes priority, device_users fills gaps ──
    const seen = new Set<string>();
    const allUsers: any[] = [];

    for (const row of (zkRows || [])) {
      const key = `${row.device_user_id}:${row.device_sn || 'global'}`;
      if (!seen.has(key)) {
        seen.add(key);
        allUsers.push({
          ...row,
          linked: !!(row.student_id || row.staff_id),
        });
      }
    }

    for (const row of (duRows || [])) {
      const key = `${row.device_user_id}:${row.device_sn || 'global'}`;
      if (!seen.has(key)) {
        seen.add(key);
        allUsers.push({
          ...row,
          linked: !!(row.student_id || row.staff_id),
        });
      }
    }

    // ── Apply status filter ──
    let filtered = allUsers;
    if (status === 'linked') {
      filtered = allUsers.filter(u => u.linked);
    } else if (status === 'unlinked') {
      filtered = allUsers.filter(u => !u.linked);
    }

    // ── Paginate ──
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    // ── Stats ──
    const totalLinked = allUsers.filter(u => u.linked).length;
    const totalUnlinked = allUsers.filter(u => !u.linked).length;

    return NextResponse.json({
      success: true,
      data: paginated,
      stats: {
        total: allUsers.length,
        linked: totalLinked,
        unlinked: totalUnlinked,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[device-mappings GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to load device mappings' }, { status: 500 });
  }
}
