/**
 * GET    /api/admin/staff/[id]  — single staff detail
 * PATCH  /api/admin/staff/[id]  — update staff fields
 * DELETE /api/admin/staff/[id]  — soft-delete (sets deleted_at)
 */
import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
}

const STAFF_SELECT = `
  SELECT
    s.id,
    s.school_id,
    s.staff_no,
    s.position,
    s.department_id,
    s.status,
    s.hire_date,
    s.manager_id,
    s.created_at,
    p.id            AS person_id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.gender,
    p.date_of_birth AS dob,
    p.address,
    p.photo_url,
    d.name          AS department_name,
    u.id            AS user_id,
    u.username,
    (u.status = 'active') AS account_active,
    u.last_login,
    GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS roles
  FROM staff s
  JOIN people p ON s.person_id = p.id
  LEFT JOIN departments d ON s.department_id = d.id
  LEFT JOIN users u ON u.person_id = s.person_id AND u.school_id = s.school_id AND u.deleted_at IS NULL
  LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.school_id = s.school_id AND ur.is_active = TRUE
  LEFT JOIN roles r ON ur.role_id = r.id
  WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
  GROUP BY s.id, s.school_id, s.staff_no, s.position, s.department_id, s.status,
           s.hire_date, s.manager_id, s.created_at, p.id, p.first_name, p.last_name,
           p.email, p.phone, p.gender, p.date_of_birth, p.address, p.photo_url,
           d.name, u.id, u.username, u.status, u.last_login
`;

export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'staff.read', session.isSuperAdmin);

  const { id } = await params;
  const staffId = Number(id);
  const rows = await query(STAFF_SELECT, [staffId, session.schoolId]);
  if (!rows.length) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

  return NextResponse.json({ staff: rows[0] });
});

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const staffId = Number(id);
  const ip = getIp(req);

  // Fetch existing record (school-scoped)
  const existing = await query(
    `SELECT s.*, p.first_name, p.last_name, p.email, p.phone, p.gender
     FROM staff s JOIN people p ON s.person_id = p.id
     WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL LIMIT 1`,
    [staffId, session.schoolId],
  );
  if (!existing.length) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

  // Determine required permission
  const body = await req.json();
  const isSuspendOp = 'status' in body;
  const requiredPerm = isSuspendOp ? 'staff.delete' : 'staff.update';
  await requirePermission(session.userId, session.schoolId, requiredPerm, session.isSuperAdmin);

  const old = existing[0];

  const {
    first_name, last_name, phone, email, gender,
    position, hire_date, department_id, manager_id, status,
  } = body;

  await withTransaction(async (conn) => {
    // Update people table
    if (first_name || last_name || phone || email || gender) {
      await conn.execute(
        `UPDATE people SET
           first_name = COALESCE(?, first_name),
           last_name  = COALESCE(?, last_name),
           phone      = COALESCE(?, phone),
           email      = COALESCE(?, email),
           gender     = COALESCE(?, gender)
         WHERE id = ?`,
        [first_name ?? null, last_name ?? null, phone ?? null, email ?? null, gender ?? null, old.person_id],
      );
    }
    // Update staff table
    await conn.execute(
      `UPDATE staff SET
         position      = COALESCE(?, position),
         hire_date     = COALESCE(?, hire_date),
         department_id = COALESCE(?, department_id),
         manager_id    = COALESCE(?, manager_id),
         status        = COALESCE(?, status),
         updated_at    = NOW()
       WHERE id = ? AND school_id = ?`,
      [
        position ?? null, hire_date ?? null, department_id ?? null,
        manager_id ?? null, status ?? null,
        staffId, session.schoolId,
      ],
    );
  });

  const auditAction = status === 'suspended'
    ? AuditAction.SUSPENDED_STAFF
    : status === 'active'
    ? AuditAction.ACTIVATED_STAFF
    : AuditAction.UPDATED_STAFF;

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   auditAction,
    entityType: 'staff',
    entityId:   staffId,
    details: { changed_fields: Object.keys(body), old_status: old.status, new_status: status ?? old.status },
    ip,
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'staff.delete', session.isSuperAdmin);

  const { id } = await params;
  const staffId = Number(id);
  const ip = getIp(req);

  const existing = await query(
    `SELECT id, status FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [staffId, session.schoolId],
  );
  if (!existing.length) return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });

  // Soft-delete
  await query(
    `UPDATE staff SET status = 'terminated', deleted_at = NOW() WHERE id = ? AND school_id = ?`,
    [staffId, session.schoolId],
  );

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   AuditAction.DELETED_STAFF,
    entityType: 'staff',
    entityId:   staffId,
    details: { previous_status: (existing[0] as any).status },
    ip,
  });

  return NextResponse.json({ success: true });
});
