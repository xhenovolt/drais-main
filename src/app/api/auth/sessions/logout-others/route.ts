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
    const body = await req.json().catch(() => ({} as any));
    const { except_session_id } = body ?? {};
    const currentSessionId = except_session_id ? parseInt(except_session_id, 10) : null;

    // `sessions`, not `user_sessions` — see the note in ../route.ts.
    //
    // The caller's OWN session is excluded from the caller's cookie, not from
    // a body parameter. "Sign out other devices" that signs you out too is a
    // trap, and relying on the client to remember `except_session_id` means it
    // happens the first time any caller forgets. The body parameter is still
    // honoured so an existing caller can pin a different session, but it is no
    // longer what protects you.
    const currentToken = req.cookies.get('drais_session')?.value ?? null;

    let sql = `UPDATE sessions SET is_active = FALSE, logout_time = NOW()
              WHERE user_id = ? AND school_id = ? AND is_active = TRUE`;
    const params: any[] = [userId, session.schoolId];

    if (currentToken) {
      sql += ` AND session_token != ?`;
      params.push(currentToken);
    }
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
