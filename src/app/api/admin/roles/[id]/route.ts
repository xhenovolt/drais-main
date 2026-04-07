/**
 * GET    /api/admin/roles/[id]  — role detail + permissions + assigned staff
 * PATCH  /api/admin/roles/[id]  — update role metadata
 * DELETE /api/admin/roles/[id]  — delete role (blocks if system role)
 *
 * POST   /api/admin/roles/[id]?action=set_permissions   — replace permission set
 * POST   /api/admin/roles/[id]?action=assign_staff      — assign role to staff
 * POST   /api/admin/roles/[id]?action=remove_staff      — remove role from staff
 */
import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

function getIp(r: NextRequest) {
  return r.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
}

async function fetchRole(roleId: number, schoolId: number) {
  const rows = await query(
    `SELECT id, name, slug, description, hierarchy_level, is_system_role, is_super_admin, is_active, created_at
     FROM roles WHERE id = ? AND school_id = ? LIMIT 1`,
    [roleId, schoolId],
  );
  return rows.length ? (rows as any[])[0] : null;
}

export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'roles.read', session.isSuperAdmin);

  const { id } = await params;
  const roleId = Number(id);
  const role   = await fetchRole(roleId, session.schoolId);
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

  const [permissions, staff] = await Promise.all([
    query(
      `SELECT p.id, p.code, p.name, p.category,
              p.category AS module,
              SUBSTRING_INDEX(p.code, '.', -1) AS action
       FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.id
       WHERE rp.role_id = ? AND p.is_active = TRUE
       ORDER BY p.category, p.code`,
      [roleId],
    ),
    query(
      `SELECT
         u.id AS user_id,
         TRIM(CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))) AS staff_name,
         u.email,
         s.position
       FROM user_roles ur
       JOIN users u  ON ur.user_id = u.id AND u.school_id = ?
       LEFT JOIN people p ON u.person_id = p.id
       LEFT JOIN staff s ON s.person_id = u.person_id AND s.school_id = u.school_id AND s.deleted_at IS NULL
       WHERE ur.role_id = ? AND ur.school_id = ? AND ur.is_active = TRUE AND u.deleted_at IS NULL`,
      [session.schoolId, roleId, session.schoolId],
    ),
  ]);

  return NextResponse.json({ success: true, data: { ...role, permissions, staff } });
});

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'roles.manage', session.isSuperAdmin);

  const { id } = await params;
  const roleId = Number(id);
  const role   = await fetchRole(roleId, session.schoolId);
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

  const { name, description, hierarchy_level, is_active } = await req.json();

  await query(
    `UPDATE roles
     SET name            = COALESCE(?, name),
         description     = COALESCE(?, description),
         hierarchy_level = COALESCE(?, hierarchy_level),
         is_active       = COALESCE(?, is_active),
         updated_at      = NOW()
     WHERE id = ? AND school_id = ?`,
    [name ?? null, description ?? null, hierarchy_level ?? null, is_active ?? null, roleId, session.schoolId],
  );

  await logAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: AuditAction.UPDATED_ROLE, entityType: 'role', entityId: roleId,
    details: { name, description, hierarchy_level, is_active }, ip: getIp(req),
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'roles.manage', session.isSuperAdmin);

  const { id } = await params;
  const roleId = Number(id);
  const role   = await fetchRole(roleId, session.schoolId);
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });
  if (role.is_system_role) return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 403 });

  await withTransaction(async (conn) => {
    await conn.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);
    await conn.execute(`UPDATE user_roles SET is_active = FALSE WHERE role_id = ?`, [roleId]);
    await conn.execute(`DELETE FROM roles WHERE id = ? AND school_id = ?`, [roleId, session.schoolId]);
  });

  await logAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: AuditAction.DELETED_ROLE, entityType: 'role', entityId: roleId,
    details: { name: role.name }, ip: getIp(req),
  });

  return NextResponse.json({ success: true });
});

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const roleId = Number(id);
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const ip = getIp(req);

  const role = await fetchRole(roleId, session.schoolId);
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

  // ── set_permissions ──────────────────────────────────────────────────────
  if (action === 'set_permissions') {
    await requirePermission(session.userId, session.schoolId, 'permissions.manage', session.isSuperAdmin);

    const { permission_ids }: { permission_ids: number[] } = await req.json();
    if (!Array.isArray(permission_ids)) {
      return NextResponse.json({ error: 'permission_ids must be an array' }, { status: 400 });
    }

    await withTransaction(async (conn) => {
      // Remove all existing
      await conn.execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);
      // Re-insert
      for (const pid of permission_ids) {
        await conn.execute(
          `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          [roleId, pid],
        );
      }
    });

    await logAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: AuditAction.UPDATED_ROLE_PERMISSIONS, entityType: 'role', entityId: roleId,
      details: { permission_ids }, ip,
    });

    return NextResponse.json({ success: true, assigned_count: permission_ids.length });
  }

  // ── assign_staff ──────────────────────────────────────────────────────────
  if (action === 'assign_staff') {
    await requirePermission(session.userId, session.schoolId, 'roles.manage', session.isSuperAdmin);

    const { user_id }: { user_id: number } = await req.json();
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

    await query(
      `INSERT IGNORE INTO user_roles (user_id, role_id, school_id, assigned_by)
       VALUES (?, ?, ?, ?)`,
      [user_id, roleId, session.schoolId, session.userId],
    );

    await logAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: AuditAction.ASSIGNED_ROLE, entityType: 'role', entityId: roleId,
      details: { target_user_id: user_id }, ip,
    });

    return NextResponse.json({ success: true });
  }

  // ── remove_staff ──────────────────────────────────────────────────────────
  if (action === 'remove_staff') {
    await requirePermission(session.userId, session.schoolId, 'roles.manage', session.isSuperAdmin);

    const { user_id }: { user_id: number } = await req.json();
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

    await query(
      `UPDATE user_roles SET is_active = FALSE WHERE user_id = ? AND role_id = ? AND school_id = ?`,
      [user_id, roleId, session.schoolId],
    );

    await logAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: AuditAction.REMOVED_ROLE, entityType: 'role', entityId: roleId,
      details: { target_user_id: user_id }, ip,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
});
