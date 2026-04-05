/**
 * GET    /api/admin/departments/[id]  — single department
 * PATCH  /api/admin/departments/[id]  — update
 * DELETE /api/admin/departments/[id]  — soft-delete
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

function getIp(r: NextRequest) {
  return r.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
}

export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'departments.read', session.isSuperAdmin);

  const { id } = await params;
  const rows = await query(
    `SELECT d.*, CONCAT(p.first_name,' ',p.last_name) AS head_name
     FROM departments d
     LEFT JOIN staff h ON d.head_staff_id = h.id
     LEFT JOIN people p ON h.person_id = p.id
     WHERE d.id = ? AND d.school_id = ? AND d.deleted_at IS NULL LIMIT 1`,
    [Number(id), session.schoolId],
  );
  if (!rows.length) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: rows[0] });
});

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'departments.manage', session.isSuperAdmin);

  const { id: rawId } = await params;
  const id   = Number(rawId);
  const body = await req.json();

  const existing = await query(
    `SELECT id FROM departments WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, session.schoolId],
  );
  if (!existing.length) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

  const { name, description, head_staff_id } = body;

  await query(
    `UPDATE departments
     SET name          = COALESCE(?, name),
         description   = COALESCE(?, description),
         head_staff_id = COALESCE(?, head_staff_id),
         updated_at    = NOW()
     WHERE id = ? AND school_id = ?`,
    [name ?? null, description ?? null, head_staff_id ?? null, id, session.schoolId],
  );

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   AuditAction.UPDATED_DEPARTMENT,
    entityType: 'department',
    entityId:   id,
    details: body,
    ip: getIp(req),
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'departments.manage', session.isSuperAdmin);

  const { id: rawId } = await params;
  const id = Number(rawId);

  const existing = await query(
    `SELECT id FROM departments WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id, session.schoolId],
  );
  if (!existing.length) return NextResponse.json({ error: 'Department not found' }, { status: 404 });

  await query(
    `UPDATE departments SET deleted_at = NOW() WHERE id = ? AND school_id = ?`,
    [id, session.schoolId],
  );

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   AuditAction.DELETED_DEPARTMENT,
    entityType: 'department',
    entityId:   id,
    details: {},
    ip: getIp(req),
  });

  return NextResponse.json({ success: true });
});
