/**
 * POST   /api/admin/staff/[id]/account   — create user account for staff
 * PATCH  /api/admin/staff/[id]/account   — enable / disable / reset-password
 *
 * Required permission: staff.account.manage
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
}

// POST — create new user account for a staff member
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'staff.account.manage', session.isSuperAdmin);

  const { id } = await params;
  const staffId = Number(id);
  const ip = getIp(req);

  // Verify staff exists in this school
  const staffRows = await query(
    `SELECT s.id, s.person_id, p.first_name, p.last_name, p.email
     FROM staff s JOIN people p ON s.person_id = p.id
     WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL LIMIT 1`,
    [staffId, session.schoolId],
  );
  if (!staffRows.length) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

  // Check no account exists yet
  const existing = await query(
    `SELECT u.id FROM users u
     JOIN staff s ON u.person_id = s.person_id
     WHERE s.id = ? AND u.school_id = ? AND u.deleted_at IS NULL LIMIT 1`,
    [staffId, session.schoolId],
  );
  if (existing.length) {
    return NextResponse.json({ error: 'User account already exists for this staff member' }, { status: 409 });
  }

  const body = await req.json();
  const { username, role_ids = [] } = body;
  if (!username?.trim()) return NextResponse.json({ error: 'username is required' }, { status: 400 });

  const staff = (staffRows as any[])[0];
  const tempPassword = Math.random().toString(36).slice(2, 10) + '!A1';
  const hash = await bcrypt.hash(tempPassword, 12);

  const result = await withTransaction(async (conn) => {
    const [userRes]: any = await conn.execute(
      `INSERT INTO users
         (school_id, person_id, email, username, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, 'staff', 'active')`,
      [
        session.schoolId, staff.person_id,
        staff.email, username.trim(), hash,
      ],
    );
    const userId = userRes.insertId;

    // Assign roles if provided
    for (const roleId of role_ids) {
      await conn.execute(
        `INSERT IGNORE INTO user_roles (user_id, role_id, school_id, assigned_by)
         VALUES (?, ?, ?, ?)`,
        [userId, roleId, session.schoolId, session.userId],
      );
    }

    return { userId, tempPassword };
  });

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   AuditAction.CREATED_STAFF_ACCOUNT,
    entityType: 'staff',
    entityId:   staffId,
    details: { created_user_id: result.userId, username, role_ids },
    ip,
  });

  return NextResponse.json({
    success: true,
    user_id: result.userId,
    temp_password: result.tempPassword,
    must_change_password: true,
  }, { status: 201 });
});

// PATCH — enable, disable, or reset password
export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'staff.account.manage', session.isSuperAdmin);

  const { id } = await params;
  const staffId = Number(id);
  const ip = getIp(req);

  const userRows = await query(
    `SELECT u.id, u.status FROM users u
     JOIN staff s ON u.person_id = s.person_id
     WHERE s.id = ? AND u.school_id = ? AND u.deleted_at IS NULL LIMIT 1`,
    [staffId, session.schoolId],
  );
  if (!userRows.length) {
    return NextResponse.json({ error: 'No user account found for this staff member' }, { status: 404 });
  }

  const userId = (userRows as any[])[0].id;
  const body   = await req.json();
  const { action } = body; // 'enable' | 'disable' | 'reset_password'

  if (!['enable', 'disable', 'reset_password'].includes(action)) {
    return NextResponse.json({ error: 'action must be enable | disable | reset_password' }, { status: 400 });
  }

  let auditAction: string;
  let tempPassword: string | undefined;

  if (action === 'enable') {
    await query(
      `UPDATE users SET status = 'active' WHERE id = ? AND school_id = ?`,
      [userId, session.schoolId],
    );
    auditAction = AuditAction.ACTIVATED_STAFF;
  } else if (action === 'disable') {
    await query(
      `UPDATE users SET status = 'inactive'
       WHERE id = ? AND school_id = ?`,
      [userId, session.schoolId],
    );
    // Invalidate all active sessions
    await query(
      `UPDATE sessions SET is_active = FALSE, logout_time = NOW()
       WHERE user_id = ? AND is_active = TRUE`,
      [userId],
    );
    auditAction = AuditAction.DISABLED_STAFF_ACCOUNT;
  } else {
    // reset_password
    tempPassword = Math.random().toString(36).slice(2, 10) + '!A1';
    const hash = await bcrypt.hash(tempPassword, 12);
    await query(
      `UPDATE users SET password_hash = ?, must_change_password = TRUE
       WHERE id = ? AND school_id = ?`,
      [hash, userId, session.schoolId],
    );
    auditAction = AuditAction.RESET_STAFF_PASSWORD;
  }

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   auditAction,
    entityType: 'staff',
    entityId:   staffId,
    details: { target_user_id: userId, action },
    ip,
  });

  const response: any = { success: true, action };
  if (tempPassword) response.temp_password = tempPassword;

  return NextResponse.json(response);
});
