import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('active') === '1';
    const excludeId  = url.searchParams.get('exclude_id');

    const where: string[] = ['s.school_id = ?', 's.deleted_at IS NULL'];
    const params: unknown[] = [schoolId];
    if (activeOnly) {
      where.push("s.status = 'active'");
    }
    if (excludeId && /^\d+$/.test(excludeId)) {
      where.push('s.id <> ?');
      params.push(Number(excludeId));
    }

    const connection = await getConnection();
    const [results] = await connection.execute(
      `SELECT s.id, s.staff_no, p.phone, p.first_name, p.last_name,
              s.position, s.status, s.department_id, s.manager_id,
              d.name        AS department_name,
              pos.name      AS position_name,
              pos.category  AS position_category,
              pos.is_teaching AS position_is_teaching
         FROM staff s
         JOIN people p       ON s.person_id   = p.id
         LEFT JOIN departments d ON s.department_id = d.id
         LEFT JOIN positions pos ON s.position_id = pos.id
        WHERE ${where.join(' AND ')}
        ORDER BY pos.display_order, p.first_name, p.last_name`,
      params,
    );
    await connection.end();

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error fetching staff list:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch staff list.', error: error.message }, { status: 500 });
  }
}