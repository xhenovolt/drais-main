import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { ok, fail } from '@/lib/apiResponse';

export async function GET(req: NextRequest) {
  let session: any = null;
  
  try {
    session = await getSessionSchoolId(req);
    if (!session) {
      return fail('Not authenticated', 401);
    }
    const schoolId = session.schoolId;

    // Try full query with zk_user_mapping JOIN first
    let staffRows: any[];
    try {
      staffRows = await query(`
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
    } catch (joinErr: any) {
      // If zk_user_mapping table doesn't exist, fall back to base query
      console.warn('Staff full query with zk_user_mapping failed, falling back:', joinErr.message);
      staffRows = await query(`
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
          NULL as device_user_id,
          NULL as device_mapping_id,
          NULL as device_sn
        FROM staff s
        JOIN people p ON s.person_id = p.id
        WHERE s.school_id = ? AND s.deleted_at IS NULL
        ORDER BY p.first_name, p.last_name
      `, [schoolId]);
    }

    return ok('Staff fetched successfully', staffRows);

  } catch (error: any) {
    console.error('Staff full fetch error:', error);
    return fail('Failed to fetch staff data', 500);
  }
}
