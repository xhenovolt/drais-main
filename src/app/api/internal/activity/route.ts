/**
 * GET /api/internal/activity
 *
 * Lightweight monitoring endpoint for JETON.
 * Returns: recent logins, active sessions per school, recent result entries.
 *
 * Auth: x-api-key header (JETON_API_KEY)
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyInternalRequest } from '@/lib/internal/verifyInternalRequest';

export async function GET(request: NextRequest) {
  const authError = verifyInternalRequest(request);
  if (authError) return authError;

  try {
    const [recentLogins, activeSessionsPerSchool, recentResults] = await Promise.all([
      // 10 most recent login sessions (last 24 h)
      query(
        `SELECT
           s.id,
           s.school_id,
           sc.name    AS school_name,
           sc.external_id,
           u.email,
           u.first_name,
           u.last_name,
           s.ip_address,
           s.created_at AS logged_in_at
         FROM sessions s
         JOIN users u  ON s.user_id  = u.id
         JOIN schools sc ON s.school_id = sc.id
         WHERE s.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
           AND sc.deleted_at IS NULL
         ORDER BY s.created_at DESC
         LIMIT 10`
      ).catch(() => []),

      // Active session count broken down by school
      query(
        `SELECT
           s.school_id,
           sc.name        AS school_name,
           sc.external_id,
           sc.status      AS school_status,
           COUNT(*)       AS active_sessions
         FROM sessions s
         JOIN schools sc ON s.school_id = sc.id
         WHERE s.is_active = TRUE
           AND s.expires_at > NOW()
           AND sc.deleted_at IS NULL
         GROUP BY s.school_id, sc.name, sc.external_id, sc.status
         ORDER BY active_sessions DESC`
      ).catch(() => []),

      // 10 most recently submitted results (proxy for "activity")
      query(
        `SELECT
           r.id,
           r.school_id,
           sc.name AS school_name,
           sc.external_id,
           r.created_at
         FROM results r
         JOIN schools sc ON r.school_id = sc.id
         WHERE r.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
           AND sc.deleted_at IS NULL
         ORDER BY r.created_at DESC
         LIMIT 10`
      ).catch(() => []),
    ]);

    console.log('[InternalAPI] GET /activity requested');

    return NextResponse.json({
      success: true,
      data: {
        recent_logins:            recentLogins,
        active_sessions_by_school: activeSessionsPerSchool,
        recent_result_submissions: recentResults,
        generated_at:              new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[InternalAPI] GET /activity error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Failed to fetch activity', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }
}
