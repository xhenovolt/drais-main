/**
 * GET  /api/admin/roles   — list roles for this school
 * POST /api/admin/roles   — create role
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

function getIp(r: NextRequest) {
  return r.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
}

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'roles.read', session.isSuperAdmin);

  const rows = await query(
    `SELECT
       r.id,
       r.name,
       r.slug,
       r.description,
       r.is_system_role,
       r.is_super_admin,
       r.hierarchy_level,
       r.is_active,
       r.created_at,
       COUNT(DISTINCT ur.user_id)  AS user_count,
       COUNT(DISTINCT rp.permission_id) AS permission_count
     FROM roles r
     LEFT JOIN user_roles ur ON ur.role_id = r.id AND ur.school_id = r.school_id AND ur.is_active = TRUE
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE r.school_id = ?
     GROUP BY r.id, r.name, r.slug, r.description, r.is_system_role, r.is_super_admin,
              r.hierarchy_level, r.is_active, r.created_at
     ORDER BY r.hierarchy_level DESC, r.name`,
    [session.schoolId],
  );

  return NextResponse.json({ success: true, message: 'Roles loaded', data: rows });
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'roles.manage', session.isSuperAdmin);

  const { name, description = null, hierarchy_level = 10 } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

  const dup = await query(
    `SELECT id FROM roles WHERE school_id = ? AND slug = ? LIMIT 1`,
    [session.schoolId, slug],
  );
  if (dup.length) return NextResponse.json({ error: 'A role with this name already exists' }, { status: 409 });

  const result = await query(
    `INSERT INTO roles (school_id, name, slug, description, hierarchy_level, is_active)
     VALUES (?, ?, ?, ?, ?, TRUE)`,
    [session.schoolId, name.trim(), slug, description, Number(hierarchy_level)],
  );
  const insertId = (result as any).insertId;

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   AuditAction.CREATED_ROLE,
    entityType: 'role',
    entityId:   insertId,
    details: { name, slug, description },
    ip: getIp(req),
  });

  return NextResponse.json({ success: true, id: insertId }, { status: 201 });
});
