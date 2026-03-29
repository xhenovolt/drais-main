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

  const rows = await query(
    `SELECT id, code, name, description, module, route, action, category, is_active
     FROM permissions
     WHERE is_active = TRUE
     ORDER BY module, action, code`,
    [],
  );

  // Group by module for easy UI rendering
  const grouped: Record<string, typeof rows> = {};
  for (const row of rows as any[]) {
    const mod = row.module || 'general';
    if (!grouped[mod]) grouped[mod] = [];
    grouped[mod].push(row);
  }

  return NextResponse.json({ permissions: rows, grouped });
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'permissions.manage', session.isSuperAdmin);

  const { code, name, description = null, module: mod = 'general', route = null, action = 'read', category = 'general' } = await req.json();
  if (!code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'code and name are required' }, { status: 400 });
  }

  const dup = await query(`SELECT id FROM permissions WHERE code = ? LIMIT 1`, [code.trim()]);
  if (dup.length) return NextResponse.json({ error: 'Permission code already exists' }, { status: 409 });

  const result = await query(
    `INSERT INTO permissions (code, name, description, module, route, action, category, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [code.trim(), name.trim(), description, mod, route, action, category],
  );

  return NextResponse.json({ success: true, id: (result as any).insertId }, { status: 201 });
});
