import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/auth/sessions
 * Returns all active sessions for the current user
 * School isolation enforced
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    // Get current user ID (assuming available in session)
    const userId = session.userId || 0;

    // Reads `sessions`, NOT `user_sessions`.
    //
    // `user_sessions` holds 0 rows, has no school_id, and has none of
    // device_name / device_type / device_os / browser_name / is_current /
    // last_active. So this query could only ever throw "Unknown column" into
    // the catch below and return 500 — which is why the profile's session list
    // "did not exist or work". Real sessions live in `sessions` (515 rows, 19
    // live), which is what /api/admin/user-sessions has been reading all along.
    //
    // `is_current` is derived by comparing the row's token with the caller's
    // cookie, so the device you are reading this on is never offered for
    // termination by accident.
    const currentToken = req.cookies.get('drais_session')?.value ?? null;

    const [sessions]: any = await conn.execute(
      `SELECT
        id,
        ip_address,
        user_agent,
        device_info,
        created_at,
        expires_at,
        last_activity_at        AS last_active,
        (session_token = ?)     AS is_current
       FROM sessions
       WHERE school_id = ?
         AND user_id   = ?
         AND is_active = TRUE
         AND expires_at > NOW()
       ORDER BY last_activity_at IS NULL, last_activity_at DESC, created_at DESC`,
      [currentToken, session.schoolId, userId]
    );

    return NextResponse.json({
      success: true,
      data: (sessions || []).map((s: any) => ({ ...s, is_current: Number(s.is_current) === 1 })),
      meta: {
        total: sessions.length,
      },
    });
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

/**
 * POST /api/auth/sessions
 * Create a new session for the current user
 * Body: { device_name, device_type, device_os, browser_name, ip_address, user_agent }
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

    const { device_name, device_type, device_os, browser_name, ip_address, user_agent } = body;

    const [result]: any = await conn.execute(
      `INSERT INTO user_sessions (
        school_id, user_id, device_name, device_type, device_os, browser_name,
        ip_address, user_agent, is_current, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        session.schoolId,
        userId,
        device_name || null,
        device_type || 'web',
        device_os || null,
        browser_name || null,
        ip_address || null,
        user_agent || null,
      ]
    );

    return NextResponse.json({
      success: true,
      data: { session_id: result.insertId },
      message: 'Session created',
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
