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

    const [sessions]: any = await conn.execute(
      `SELECT
        id,
        device_name,
        device_type,
        device_os,
        browser_name,
        ip_address,
        is_current,
        last_active,
        created_at,
        expires_at
       FROM user_sessions
       WHERE school_id = ? AND user_id = ? AND expires_at IS NULL
       ORDER BY last_active DESC`,
      [session.schoolId, userId]
    );

    return NextResponse.json({
      success: true,
      data: sessions || [],
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
