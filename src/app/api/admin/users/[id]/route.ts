import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/** Verify the target user belongs to the caller's school. */
async function getTargetUser(userId: number, schoolId: number) {
  const rows = await query(
    `SELECT id, first_name, last_name, email, is_active, deleted_at
     FROM users WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId, schoolId]
  ) as any[];
  return rows?.[0] ?? null;
}

/**
 * PATCH /api/admin/users/[id]
 * Body: { action: 'suspend' | 'activate' | 'deactivate' | 'reset_password' }
 *   suspend     → sets is_active = FALSE (temporary lock)
 *   activate    → sets is_active = TRUE
 *   deactivate  → sets is_active = FALSE + invalidates all sessions
 *   reset_password → generates temp password, returns it, sets must_change_password = TRUE
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const targetId = parseInt(id, 10);
  if (!targetId || isNaN(targetId)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  // Prevent self-modification of critical security fields
  if (targetId === session.userId) {
    return NextResponse.json({ error: 'Cannot modify your own account via this endpoint' }, { status: 403 });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { action } = body as { action?: string };
  if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

  const target = await getTargetUser(targetId, session.schoolId);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  switch (action) {
    case 'suspend': {
      await query('UPDATE users SET is_active = FALSE WHERE id = ? AND school_id = ?', [targetId, session.schoolId]);
      await logAudit({ schoolId: session.schoolId, userId: session.userId, action: AuditAction.SUSPENDED_STAFF, entityType: 'user', entityId: targetId });
      return NextResponse.json({ success: true, message: 'User suspended' });
    }

    case 'activate': {
      await query('UPDATE users SET is_active = TRUE WHERE id = ? AND school_id = ?', [targetId, session.schoolId]);
      await logAudit({ schoolId: session.schoolId, userId: session.userId, action: AuditAction.ACTIVATED_STAFF, entityType: 'user', entityId: targetId, details: { action: 'activated' } });
      return NextResponse.json({ success: true, message: 'User activated' });
    }

    case 'deactivate': {
      await query('UPDATE users SET is_active = FALSE WHERE id = ? AND school_id = ?', [targetId, session.schoolId]);
      // Invalidate all active sessions for this user
      await query(
        'UPDATE sessions SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE',
        [targetId]
      );
      await logAudit({ schoolId: session.schoolId, userId: session.userId, action: AuditAction.DISABLED_STAFF_ACCOUNT, entityType: 'user', entityId: targetId, details: { action: 'deactivated', sessions_terminated: true } });
      return NextResponse.json({ success: true, message: 'User deactivated and sessions terminated' });
    }

    case 'reset_password': {
      // Generate a secure 12-char temp password
      const rawPassword = crypto.randomBytes(9).toString('base64url').slice(0, 12);
      const hashed = await bcrypt.hash(rawPassword, 12);
      await query(
        'UPDATE users SET password_hash = ?, must_change_password = TRUE WHERE id = ? AND school_id = ?',
        [hashed, targetId, session.schoolId]
      );
      // Terminate active sessions so they must re-login with temp password
      await query('UPDATE sessions SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE', [targetId]);
      await logAudit({ schoolId: session.schoolId, userId: session.userId, action: AuditAction.RESET_STAFF_PASSWORD, entityType: 'user', entityId: targetId, details: { action: 'password_reset' } });
      return NextResponse.json({ success: true, temp_password: rawPassword, message: 'Password reset — share this temp password securely' });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Soft-deletes the user (sets deleted_at = NOW()) and terminates their sessions.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const targetId = parseInt(id, 10);
  if (!targetId || isNaN(targetId)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });

  if (targetId === session.userId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 403 });
  }

  const target = await getTargetUser(targetId, session.schoolId);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await query(
    'UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = ? AND school_id = ?',
    [targetId, session.schoolId]
  );
  await query('UPDATE sessions SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE', [targetId]);
  await logAudit({ schoolId: session.schoolId, userId: session.userId, action: AuditAction.DELETED_STAFF, entityType: 'user', entityId: targetId });

  return NextResponse.json({ success: true, message: 'User removed' });
}
