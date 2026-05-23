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
    `SELECT id, code, name, category, module, resource, action, description, is_active
     FROM permissions
     WHERE is_active = TRUE
     ORDER BY module, resource, action, code`,
    [],
  );

  // Three views in the same response:
  //   `data`    — legacy shape (module → Permission[]) for backward compat
  //   `grouped` — module → resource → Permission[] for the tree UI
  //   `flat`    — full flat list with description, for search-driven UI
  const data:    Record<string, any[]>                 = {};
  const grouped: Record<string, Record<string, any[]>> = {};
  const flat: any[] = [];
  for (const row of rows) {
    const parts    = String(row.code).split('.');
    const moduleId = row.module   || parts[0] || 'general';
    const resource = row.resource || parts[1] || '';
    const action   = row.action   || (parts.length > 2 ? parts.slice(2).join('.') : parts[1] ?? row.code);

    const item = {
      id:          row.id,
      code:        row.code,
      name:        row.name || row.code,
      description: row.description || '',
      module: moduleId, resource, action,
    };

    (data[moduleId] ??= []).push(item);
    ((grouped[moduleId] ??= {})[resource] ??= []).push(item);
    flat.push(item);
  }

  return NextResponse.json({ success: true, data, grouped, flat });
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
