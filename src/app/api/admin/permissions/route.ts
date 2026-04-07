/**
 * GET  /api/admin/permissions  — list all permissions (grouped by module)
 * POST /api/admin/permissions  — create a custom permission
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'roles.read', session.isSuperAdmin);

  const rows: any[] = await query(
    `SELECT id, code, name, category
     FROM permissions
     WHERE is_active = TRUE
     ORDER BY category, code`,
    [],
  );

  // Group by category, derive module/action from code
  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    const mod    = row.category || 'general';
    const parts  = String(row.code).split('.');
    const action = parts.length > 1 ? parts[parts.length - 1] : row.code;

    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push({ id: row.id, code: row.code, name: row.name || row.code, module: mod, action });
  }

  return NextResponse.json({ success: true, data: grouped });
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'permissions.manage', session.isSuperAdmin);

  const { code, name, description = null, category = 'general' } = await req.json();
  if (!code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'code and name are required' }, { status: 400 });
  }

  const dup = await query(`SELECT id FROM permissions WHERE code = ? LIMIT 1`, [code.trim()]);
  if (dup.length) return NextResponse.json({ error: 'Permission code already exists' }, { status: 409 });

  const result = await query(
    `INSERT INTO permissions (code, name, description, category, is_active) VALUES (?, ?, ?, ?, TRUE)`,
    [code.trim(), name.trim(), description, category],
  );

  return NextResponse.json({ success: true, id: (result as any).insertId }, { status: 201 });
});
