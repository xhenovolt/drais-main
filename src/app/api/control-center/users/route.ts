/**
 * Control Center operators.
 * GET  → operators with their permissions, scope, expiry and activity, plus the
 *        permission catalog and presets the Operators screen builds from (operators.view)
 * POST → create an operator { name, email, password, role, permissions?, school_scope?,
 *        access_expires_at?, notes? } (operators.create; see lib/control/operators for the rules)
 * All actions audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/control/db';
import { controlAudit, clientIp } from '@/lib/control/auth';
import { requireControl } from '@/lib/control/guard';
import { CONTROL_AREAS, CONTROL_PRESETS, SUPER_ADMIN_ONLY, PLATFORM_WIDE_AREAS, controlCan, permissionsFor } from '@/lib/control/permissions';
import { listOperators, createOperator } from '@/lib/control/operators';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const g = await requireControl(req, 'operators.view');
  if (g.res) return g.res;
  const user = g.user;
  const [rows, schools] = await Promise.all([
    listOperators(),
    query(`SELECT id, name, short_code FROM schools WHERE deleted_at IS NULL ORDER BY name ASC`, []).catch(() => []) as Promise<any[]>,
  ]);
  return NextResponse.json({
    success: true, rows,
    catalog: { areas: CONTROL_AREAS, presets: CONTROL_PRESETS, superAdminOnly: SUPER_ADMIN_ONLY, platformWideAreas: PLATFORM_WIDE_AREAS },
    schools,
    me: {
      id: user.id, role: user.role, permissions: permissionsFor(user), school_scope: user.schoolScope ?? null,
      can: {
        create: controlCan(user, 'operators.create'), edit: controlCan(user, 'operators.edit'),
        delete: controlCan(user, 'operators.delete'), audit: controlCan(user, 'audit.view'),
      },
    },
  });
}

export async function POST(req: NextRequest) {
  const g = await requireControl(req, 'operators.create');
  if (g.res) return g.res;
  const user = g.user;
  const b = await req.json().catch(() => null);
  const created = await createOperator(user, b);
  if (!created.ok) return NextResponse.json({ error: created.reason }, { status: created.status });
  await controlAudit(user.id, 'operator_created', `control_users:${created.id}`, {
    email: b?.email, role: b?.role, permissions: b?.permissions ?? null, school_scope: b?.school_scope ?? null,
    access_expires_at: b?.access_expires_at ?? null,
  }, clientIp(req));
  return NextResponse.json({ success: true, id: created.id });
}
