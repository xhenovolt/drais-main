/**
 * Control Center — per-tenant data export (Phase 22 / E-19).
 *   GET → downloads the school's full dataset as JSON (super-admin, audited).
 * The operator-controlled backup / DR extract / data-portability artefact.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, controlAudit, clientIp } from '@/lib/control/auth';
import { exportSchoolData } from '@/lib/control/data-export';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });
  const { id } = await ctx.params;
  const schoolId = Number(id);

  const res = await exportSchoolData(schoolId);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 404 });

  await controlAudit(user.id, 'school_data_exported', `schools:${schoolId}`,
    { tables: res.data!.table_count, rows: res.data!.total_rows }, clientIp(req));

  const slug = String(res.data!.school?.name || `school-${schoolId}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `drais-export-${slug || schoolId}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(res.data, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
