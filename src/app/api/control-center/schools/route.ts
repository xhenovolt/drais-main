/**
 * GET /api/control-center/schools — every school with operational vitals:
 * status, subscription, learners, staff, devices (online), last attendance
 * sync, enabled modules. Control-session gated + audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // ?include_deleted=1 also returns soft-deleted schools (so they can be restored).
  const includeDeleted = new URL(req.url).searchParams.get('include_deleted') === '1';
  const schools = (await query(
    `SELECT s.id, s.name, s.short_code, s.status, s.subscription_plan, s.subscription_status,
            s.district, s.country, s.created_at, s.deleted_at
       FROM schools s ${includeDeleted ? '' : 'WHERE s.deleted_at IS NULL'} ORDER BY s.name ASC`, [],
  )) as any[];

  const [counts, devs, lastSync, modules] = await Promise.all([
    query(`SELECT s.school_id,
                  SUM(1) AS learners
             FROM students s WHERE s.deleted_at IS NULL AND s.status = 'active'
            GROUP BY s.school_id`, []).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, COUNT(*) total, SUM(is_online = 1) online FROM devices GROUP BY school_id`, []).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, MAX(ingested_at) last_sync FROM attendance_raw_events GROUP BY school_id`, []).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, module_code FROM school_modules WHERE is_enabled = 1`, []).catch(() => []) as Promise<any[]>,
  ]);
  const staffCounts = (await query(
    `SELECT school_id, COUNT(*) staff FROM staff WHERE deleted_at IS NULL AND status = 'active' GROUP BY school_id`, [],
  ).catch(() => [])) as any[];

  const by = <T extends { school_id: number }>(rows: T[]) => {
    const m = new Map<number, T>(); for (const r of rows) m.set(Number(r.school_id), r); return m;
  };
  const learnersBy = by(counts), devBy = by(devs), syncBy = by(lastSync), staffBy = by(staffCounts);
  const modsBy = new Map<number, string[]>();
  for (const m of modules) {
    const k = Number(m.school_id);
    if (!modsBy.has(k)) modsBy.set(k, []);
    modsBy.get(k)!.push(m.module_code);
  }

  await controlAudit(user.id, 'viewed_schools', 'schools', null, clientIp(req));
  return NextResponse.json({
    success: true,
    rows: schools.map((s) => ({
      id: Number(s.id), name: s.name, short_code: s.short_code,
      status: s.status || 'active', deleted_at: s.deleted_at ?? null,
      subscription: { plan: s.subscription_plan, status: s.subscription_status },
      district: s.district, country: s.country, created_at: s.created_at,
      learners: Number((learnersBy.get(Number(s.id)) as any)?.learners || 0),
      staff: Number((staffBy.get(Number(s.id)) as any)?.staff || 0),
      devices: {
        total: Number((devBy.get(Number(s.id)) as any)?.total || 0),
        online: Number((devBy.get(Number(s.id)) as any)?.online || 0),
      },
      last_sync: (syncBy.get(Number(s.id)) as any)?.last_sync ?? null,
      modules: modsBy.get(Number(s.id)) || [],
    })),
  });
}
