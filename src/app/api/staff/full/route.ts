import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { fail } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  let session: any = null;
  
  try {
    session = await getSessionSchoolId(req);
    if (!session) {
      return fail('Not authenticated', 401);
    }
    const schoolId = session.schoolId;
    const { searchParams } = new URL(req.url);

    // This route had no LIMIT at all — every staff member for the school,
    // with a LEFT JOIN, in one response on every 30s poll. Same shape of
    // bug that froze /finance/fees. Paginated + filters moved server-side.
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = (page - 1) * limit;
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const departmentId = searchParams.get('department_id');

    const where: string[] = ['s.school_id = ?', 's.deleted_at IS NULL'];
    const params: any[] = [schoolId];
    if (status) {
      where.push('s.status = ?');
      params.push(status);
    }
    if (departmentId && /^\d+$/.test(departmentId)) {
      where.push('s.department_id = ?');
      params.push(Number(departmentId));
    }
    if (search) {
      where.push(`(LOWER(CONCAT_WS(' ', p.first_name, p.other_name, p.last_name)) LIKE ? OR LOWER(s.staff_no) LIKE ?)`);
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like);
    }
    const whereSql = where.join(' AND ');

    const [countRows] = await query(
      `SELECT COUNT(*) as total FROM staff s JOIN people p ON s.person_id = p.id WHERE ${whereSql}`,
      params,
    ) as any[];
    const total = Number(countRows?.[0]?.total || 0);

    // Try full query with zk_user_mapping JOIN first
    let staffRows: any[];
    try {
      staffRows = await query(`
        SELECT
          s.id,
          s.staff_no,
          s.position,
          s.department_id,
          s.hire_date,
          s.status,
          p.first_name,
          p.last_name,
          p.other_name,
          p.gender,
          p.phone,
          p.email,
          p.photo_url,
          p.address,
          p.date_of_birth,
          zum.device_user_id,
          zum.id as device_mapping_id,
          zum.device_sn
        FROM staff s
        JOIN people p ON s.person_id = p.id
        LEFT JOIN zk_user_mapping zum ON zum.staff_id = s.id AND zum.school_id = s.school_id AND zum.user_type = 'staff'
        WHERE ${whereSql}
        ORDER BY p.first_name, p.last_name
        LIMIT ${limit} OFFSET ${offset}
      `, params);
    } catch (joinErr: any) {
      // If zk_user_mapping table doesn't exist, fall back to base query
      console.warn('Staff full query with zk_user_mapping failed, falling back:', joinErr.message);
      staffRows = await query(`
        SELECT
          s.id,
          s.staff_no,
          s.position,
          s.department_id,
          s.hire_date,
          s.status,
          p.first_name,
          p.last_name,
          p.other_name,
          p.gender,
          p.phone,
          p.email,
          p.photo_url,
          p.address,
          p.date_of_birth,
          NULL as device_user_id,
          NULL as device_mapping_id,
          NULL as device_sn
        FROM staff s
        JOIN people p ON s.person_id = p.id
        WHERE ${whereSql}
        ORDER BY p.first_name, p.last_name
        LIMIT ${limit} OFFSET ${offset}
      `, params);
    }

    return NextResponse.json({
      success: true,
      message: 'Staff fetched successfully',
      data: staffRows,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });

  } catch (error: any) {
    console.error('Staff full fetch error:', error);
    return fail('Failed to fetch staff data', 500);
  }
}
