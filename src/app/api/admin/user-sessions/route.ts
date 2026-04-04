/**
 * GET    /api/admin/user-sessions          — active sessions for this school
 * DELETE /api/admin/user-sessions?id=N     — terminate a specific session
 * DELETE /api/admin/user-sessions?user_id=N — terminate all sessions for a user
 *
 * Required permission: sessions.monitor (GET) | sessions.terminate (DELETE)
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

const ONLINE_THRESHOLD_MS = 120_000; // 2 min — heartbeat expected every 60s

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'sessions.monitor', session.isSuperAdmin);

  const { searchParams } = new URL(req.url);
  const onlyActive = searchParams.get('active') !== 'false';

  const rows = await query(
    `SELECT
       s.id              AS id,
       s.user_id,
       s.created_at,
       s.last_activity_at,
       s.logout_time,
       s.ip_address,
       s.device_info,
       s.user_agent,
       s.is_active,
       TRIM(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) AS staff_name,
       u.email           AS username,
       p.photo_url,
       TIMESTAMPDIFF(MINUTE, s.created_at, IFNULL(s.last_activity_at, s.created_at)) AS duration_minutes
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     LEFT JOIN people p ON u.person_id = p.id
     WHERE s.school_id = ?
       AND s.expires_at > NOW()
       ${onlyActive ? 'AND s.is_active = TRUE AND s.logout_time IS NULL' : ''}
     ORDER BY s.last_activity_at DESC, s.created_at DESC
     LIMIT 200`,
    [session.schoolId],
  );

  const now = Date.now();

  const sessions = (rows as any[]).map(row => ({
    ...row,
    is_online: row.is_active &&
      row.last_activity_at &&
      (now - new Date(row.last_activity_at).getTime()) < ONLINE_THRESHOLD_MS,
  }));

  const online_count  = sessions.filter(s => s.is_online).length;
  const active_count  = sessions.filter(s => s.is_active).length;

  return NextResponse.json({ sessions, online_count, active_count });
});

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'sessions.terminate', session.isSuperAdmin);

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('id');
  const userId    = searchParams.get('user_id');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;

  if (!sessionId && !userId) {
    return NextResponse.json({ error: 'Provide id or user_id query param' }, { status: 400 });
  }

  if (sessionId) {
    // Verify the session belongs to this school
    const existing = await query(
      `SELECT id, user_id FROM sessions WHERE id = ? AND school_id = ? LIMIT 1`,
      [Number(sessionId), session.schoolId],
    );
    if (!existing.length) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    await query(
      `UPDATE sessions SET is_active = FALSE, logout_time = NOW() WHERE id = ?`,
      [Number(sessionId)],
    );

    await logAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: AuditAction.SESSION_TERMINATED, entityType: 'session', entityId: Number(sessionId),
      details: { target_user_id: (existing[0] as any).user_id }, ip,
    });
  } else {
    // Terminate all sessions for a user
    const targetUserId = Number(userId);
    // Verify user belongs to this school
    const userExists = await query(
      `SELECT id FROM users WHERE id = ? AND school_id = ? LIMIT 1`,
      [targetUserId, session.schoolId],
    );
    if (!userExists.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await query(
      `UPDATE sessions SET is_active = FALSE, logout_time = NOW()
       WHERE user_id = ? AND is_active = TRUE`,
      [targetUserId],
    );

    await logAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: AuditAction.SESSION_TERMINATED, entityType: 'user', entityId: targetUserId,
      details: { reason: 'admin_force_logout_all' }, ip,
    });
  }

  return NextResponse.json({ success: true });
});
