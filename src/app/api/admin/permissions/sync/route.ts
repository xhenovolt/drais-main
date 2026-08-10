import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { syncPermissionCatalog } from '@/lib/rbac/sync';
import { authorize } from '@/lib/rbac/authorize';
import { checkAnyPermission } from '@/lib/rbac';

/**
 * POST /api/admin/permissions/sync
 *
 * Reconciles the `permissions` table with the declarative catalog in
 * `src/lib/rbac/catalog.ts`. Returns a structured diff.
 *
 * Super-admin always allowed. Other roles need the
 * `roles.permission.sync` permission.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const denied = await checkAnyPermission(session.userId, session.schoolId, ['roles.permission.sync', 'roles.manage'], session.isSuperAdmin);
  if (denied) return denied;

  const auth = await authorize(session, 'roles.permission.sync');
  if (!auth.allowed) {
    return NextResponse.json(
      { error: auth.reason, code: 'FORBIDDEN', deniedCode: auth.deniedCode },
      { status: 403 },
    );
  }

  try {
    const report = await syncPermissionCatalog();
    return NextResponse.json({
      success: true,
      report,
      summary: {
        inserted:  report.inserted.length,
        updated:   report.updated.length,
        activated: report.activated.length,
        orphaned:  report.orphaned.length,
        unchanged: report.unchanged,
      },
    });
  } catch (e: unknown) {
    console.error('[permissions/sync]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sync failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/permissions/sync
 *
 * Dry-run: return what the next sync would change without applying it.
 * (Compares catalog to DB but does not write.)
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

  // Import dynamically to keep query() out of edge runtime concerns
  const { ALL_PERMISSION_CODES, PERMISSIONS } = await import('@/lib/rbac/catalog');
  const { query } = await import('@/lib/db');

  const dbRows = (await query(
    `SELECT code, module, resource, action, description, is_active FROM permissions`,
    [],
  )) as Array<{ code: string; module: string | null; resource: string | null; action: string | null; description: string | null; is_active: number }>;
  const byCode = new Map(dbRows.map(r => [r.code, r]));

  const wouldInsert: string[] = [];
  const wouldUpdate: string[] = [];
  const wouldActivate: string[] = [];
  const wouldOrphan: string[] = [];

  for (const code of ALL_PERMISSION_CODES) {
    const d = PERMISSIONS[code];
    const existing = byCode.get(code);
    if (!existing) { wouldInsert.push(code); continue; }
    if (existing.is_active !== 1) { wouldActivate.push(code); continue; }
    if (
      existing.module   !== d.module ||
      existing.resource !== d.resource ||
      existing.action   !== d.action  ||
      (existing.description ?? '') !== d.description
    ) wouldUpdate.push(code);
  }

  const catalogSet = new Set(ALL_PERMISSION_CODES);
  for (const r of dbRows) {
    if (!catalogSet.has(r.code) && r.is_active === 1) wouldOrphan.push(r.code);
  }

  return NextResponse.json({
    success:     true,
    catalogSize: ALL_PERMISSION_CODES.length,
    dbSize:      dbRows.length,
    plan: {
      wouldInsert,
      wouldUpdate,
      wouldActivate,
      wouldOrphan,
    },
  });
}
