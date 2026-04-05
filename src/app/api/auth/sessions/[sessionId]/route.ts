import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * DELETE /api/auth/sessions/[sessionId]
 * Logout a specific session (this device)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { sessionId: sessionIdParam } = await params;
  const conn = await getConnection();
  try {
    const userId = session.userId || 0;
    const sessionId = parseInt(sessionIdParam, 10);

    // Verify session belongs to current user and school
    const [existing]: any = await conn.execute(
      `SELECT id FROM user_sessions
       WHERE id = ? AND user_id = ? AND school_id = ?`,
      [sessionId, userId, session.schoolId]
    );

    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Mark session as expired
    await conn.execute(
      `UPDATE user_sessions SET expires_at = NOW() WHERE id = ?`,
      [sessionId]
    );

    return NextResponse.json({
      success: true,
      message: 'Session terminated',
    });
  } catch (error) {
    console.error('Failed to delete session:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
