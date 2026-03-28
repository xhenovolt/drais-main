/**
 * GET /api/internal/schools/[external_id]
 *
 * Returns detailed info for one school identified by its external_id.
 * Includes: school info, total students, total staff, last session activity.
 *
 * Auth: x-api-key header (JETON_API_KEY)
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/verifyInternalRequest';

interface RouteParams {
  params: Promise<{ external_id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const authError = verifyInternalRequest(request);
  if (authError) return authError;

  const { external_id } = await params;

  if (!external_id || external_id.trim() === '') {
    return NextResponse.json(
      { success: false, error: { message: 'external_id is required', code: 'BAD_REQUEST' } },
      { status: 400 }
    );
  }

  try {
    // Fetch school
    const schools = await query(
      `SELECT id, external_id, name, email, phone, address, currency, status, created_at, updated_at
       FROM schools
       WHERE external_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [external_id]
    );

    if (!schools || schools.length === 0) {
      return NextResponse.json(
        { success: false, error: { message: 'School not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const school = schools[0];
    const schoolId = school.id;

    // Parallel lookups: student count, user (staff) count, last session
    const [studentRows, staffRows, activityRows] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total FROM students WHERE school_id = ? AND deleted_at IS NULL`,
        [schoolId]
      ),
      query(
        `SELECT COUNT(DISTINCT user_id) AS total FROM user_roles WHERE school_id = ? AND is_active = TRUE`,
        [schoolId]
      ).catch(() =>
        // Fallback: count from users table directly
        query(
          `SELECT COUNT(*) AS total FROM users WHERE school_id = ? AND deleted_at IS NULL`,
          [schoolId]
        )
      ),
      query(
        `SELECT MAX(created_at) AS last_activity FROM sessions WHERE school_id = ?`,
        [schoolId]
      ),
    ]);

    const totalStudents = Number(studentRows?.[0]?.total ?? 0);
    const totalStaff    = Number(staffRows?.[0]?.total ?? 0);
    const lastActivity  = activityRows?.[0]?.last_activity ?? null;

    console.log(`[InternalAPI] GET /schools/${external_id} → found school #${schoolId}`);

    return NextResponse.json({
      success: true,
      data: {
        ...school,
        metrics: {
          total_students: totalStudents,
          total_staff:    totalStaff,
          last_activity:  lastActivity,
        },
      },
    });
  } catch (error: any) {
    console.error(`[InternalAPI] GET /schools/${external_id} error:`, error);
    return NextResponse.json(
      { success: false, error: { message: 'Failed to fetch school', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }
}
