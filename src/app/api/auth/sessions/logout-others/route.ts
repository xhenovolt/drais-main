import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * POST /api/auth/sessions/logout-others
 * Logout all sessions EXCEPT the current one
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const userId = session.userId || 0;
    const body = await req.json();
    const { except_session_id } = body; // Session ID to keep active

    // Get current session ID from request if provided
    const currentSessionId = except_session_id ? parseInt(except_session_id, 10) : null;

    let sql = `UPDATE user_sessions SET expires_at = NOW()
              WHERE user_id = ? AND school_id = ? AND expires_at IS NULL`;
    const params: any[] = [userId, session.schoolId];

    if (currentSessionId) {
      sql += ` AND id != ?`;
      params.push(currentSessionId);
    }

    const result: any = await conn.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: {
        sessions_terminated: result.affectedRows,
      },
      message: `Terminated ${result.affectedRows} other session(s)`,
    });
  } catch (error) {
    console.error('Failed to logout other sessions:', error);
    return NextResponse.json({ error: 'Failed to logout other sessions' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
