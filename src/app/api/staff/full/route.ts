import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { ok, fail } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  let connection;
  let session: any = null;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    session = await getSessionSchoolId(req);
    if (!session) {
      return fail('Not authenticated', 401);
    }
    const schoolId = session.schoolId;

    connection = await getConnection();

    // Get all staff with basic information, including device_user_id
    // JOIN via zk_user_mapping (has staff_id), NOT device_user_mappings (no staff_id)
    const [staffRows] = await connection.execute(`
      SELECT
        s.id,
        s.staff_no,
        s.position,
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
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      ORDER BY p.first_name, p.last_name
    `, [schoolId]);

    return ok('Staff fetched successfully', staffRows);

  } catch (error: any) {
    console.error('Staff full fetch error:', error);
    // Audit the failure
    try {
      await logAudit({
        schoolId: session?.schoolId ?? 0,
        userId: session?.userId ?? null,
        action: 'STAFF_FETCH_FAILED',
        entityType: 'staff',
        details: { error: error.message || 'Unknown error' },
      });
    } catch {} // Don't let audit failure mask the original error
    return fail('Failed to fetch staff data', 500, { message: error.message });
  } finally {
    if (connection) await connection.end();
  }
}
