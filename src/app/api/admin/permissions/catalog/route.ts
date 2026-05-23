import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { authorize } from '@/lib/rbac/authorize';
import { PERMISSIONS, buildPermissionTree } from '@/lib/rbac/catalog';
import { query } from '@/lib/db';

/**
 * GET /api/admin/permissions/catalog
 *
 * Returns:
 *   * The full declarative catalog (descriptors + tree grouping)
 *   * The current DB state per code (active / orphaned / unknown)
 *
 * Drives the permission tree UI on /admin/roles/[id].
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const auth = await authorize(session, 'roles.permission.view');
  if (!auth.allowed) {
    return NextResponse.json(
      { error: auth.reason, code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  const tree = buildPermissionTree();

  // Joined DB state — code → { id, is_active }
  const dbRows = (await query(
    `SELECT id, code, is_active FROM permissions`,
    [],
  )) as Array<{ id: number; code: string; is_active: number }>;
  const dbState = new Map(dbRows.map(r => [r.code, { id: r.id, isActive: r.is_active === 1 }]));

  // Build a flat catalog with merged DB state
  const flat = Object.entries(PERMISSIONS).map(([code, d]) => {
    const db = dbState.get(code);
    return {
      code,
      module:      d.module,
      resource:    d.resource,
      action:      d.action,
      description: d.description,
      category:    d.category ?? d.module,
      dbId:        db?.id     ?? null,
      isActive:    db?.isActive ?? false,
      inCatalog:   true,
    };
  });

  // Append orphans (in DB, not in catalog) so the UI shows them as legacy
  const catalogSet = new Set(Object.keys(PERMISSIONS));
  for (const r of dbRows) {
    if (catalogSet.has(r.code)) continue;
    const parts = r.code.split('.');
    flat.push({
      code:        r.code,
      module:      parts[0] ?? 'orphan',
      resource:    parts[1] ?? '',
      action:      parts.slice(2).join('.') || '',
      description: 'Orphaned permission (not in catalog) — kept for audit',
      category:    parts[0] ?? 'orphan',
      dbId:        r.id,
      isActive:    r.is_active === 1,
      inCatalog:   false,
    });
  }

  return NextResponse.json({
    success: true,
    tree,
    permissions: flat,
    summary: {
      catalogSize: Object.keys(PERMISSIONS).length,
      dbSize:      dbRows.length,
      orphans:     flat.filter(p => !p.inCatalog).length,
      modules:     Object.keys(tree).length,
    },
  });
}
