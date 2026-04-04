/**
 * GET  /api/admin/departments   — list departments for this school
 * POST /api/admin/departments   — create department
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
  await requirePermission(session.userId, session.schoolId, 'departments.read', session.isSuperAdmin);

  const rows = await query(
    `SELECT
       d.id,
       d.name,
       d.description,
       d.head_staff_id,
       d.created_at,
       CONCAT(p.first_name, ' ', p.last_name) AS head_name,
       COUNT(DISTINCT s.id) AS staff_count
     FROM departments d
     LEFT JOIN staff h ON d.head_staff_id = h.id
     LEFT JOIN people p ON h.person_id = p.id
     LEFT JOIN staff s ON s.department_id = d.id AND s.deleted_at IS NULL AND s.school_id = d.school_id
     WHERE d.school_id = ? AND d.deleted_at IS NULL
     GROUP BY d.id, d.name, d.description, d.head_staff_id, d.created_at, p.first_name, p.last_name
     ORDER BY d.name`,
    [session.schoolId],
  );

  return NextResponse.json({ success: true, message: 'Departments loaded', data: rows });
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'departments.manage', session.isSuperAdmin);

  const { name, description = null, head_staff_id = null } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const dup = await query(
    `SELECT id FROM departments WHERE school_id = ? AND name = ? AND deleted_at IS NULL LIMIT 1`,
    [session.schoolId, name.trim()],
  );
  if (dup.length) return NextResponse.json({ error: 'Department with this name already exists' }, { status: 409 });

  const rows = await query(
    `INSERT INTO departments (school_id, name, description, head_staff_id)
     VALUES (?, ?, ?, ?)`,
    [session.schoolId, name.trim(), description, head_staff_id],
  );

  const insertId = (rows as any).insertId;

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   AuditAction.CREATED_DEPARTMENT,
    entityType: 'department',
    entityId:   insertId,
    details: { name, description, head_staff_id },
    ip: getIp(req),
  });

  return NextResponse.json({ success: true, id: insertId }, { status: 201 });
});
