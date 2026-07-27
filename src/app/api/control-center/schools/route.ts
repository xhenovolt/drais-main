/**
 * GET /api/control-center/schools — every school with operational vitals:
 * status, subscription, learners, staff, devices (online), last attendance
 * sync, enabled modules. Control-session gated + audited.
 *
 * Paginated + server-side searchable (P21): the list query is bounded and the
 * per-school aggregate roll-ups are scoped to just the visible page's IDs, so
 * cost stays flat as the tenant count grows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { parsePageParams, totalPages } from '@/lib/control/pagination';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  // ?include_deleted=1 also returns soft-deleted schools (so they can be restored).
  const includeDeleted = sp.get('include_deleted') === '1';
  const { page, limit, offset } = parsePageParams(sp.get('page'), sp.get('limit'), { defaultLimit: 25, maxLimit: 100 });
  const q = (sp.get('q') || '').trim().toLowerCase();

  const conditions: string[] = [];
  const whereParams: any[] = [];
  if (!includeDeleted) conditions.push('s.deleted_at IS NULL');
  if (q) {
    conditions.push('(LOWER(s.name) LIKE ? OR LOWER(s.short_code) LIKE ? OR LOWER(s.district) LIKE ? OR LOWER(s.country) LIKE ?)');
    const like = `%${q}%`;
    whereParams.push(like, like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRows = (await query(`SELECT COUNT(*) AS total FROM schools s ${where}`, whereParams)) as any[];
  const total = Number(countRows[0]?.total || 0);

  const schools = (await query(
    `SELECT s.id, s.name, s.short_code, s.status, s.subscription_plan, s.subscription_status,
            s.district, s.country, s.created_at, s.deleted_at
       FROM schools s ${where}
      ORDER BY s.name ASC
      LIMIT ${limit} OFFSET ${offset}`,
    whereParams,
  )) as any[];

  // Roll-ups only for the schools on THIS page (flat cost regardless of tenant count).
  const ids = schools.map((s) => Number(s.id));
  const inClause = ids.length ? `(${ids.map(() => '?').join(',')})` : '(NULL)';
  const [counts, devs, lastSync, modules, staffCounts] = ids.length ? await Promise.all([
    query(`SELECT school_id, SUM(1) AS learners FROM students WHERE deleted_at IS NULL AND status = 'active' AND school_id IN ${inClause} GROUP BY school_id`, ids).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, COUNT(*) total, SUM(is_online = 1) online FROM devices WHERE school_id IN ${inClause} GROUP BY school_id`, ids).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, MAX(ingested_at) last_sync FROM attendance_raw_events WHERE school_id IN ${inClause} GROUP BY school_id`, ids).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, module_code FROM school_modules WHERE is_enabled = 1 AND school_id IN ${inClause}`, ids).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, COUNT(*) staff FROM staff WHERE deleted_at IS NULL AND status = 'active' AND school_id IN ${inClause} GROUP BY school_id`, ids).catch(() => []) as Promise<any[]>,
  ]) : [[], [], [], [], []];

  const by = <T extends { school_id: number }>(rows: T[]) => {
    const m = new Map<number, T>(); for (const r of rows) m.set(Number(r.school_id), r); return m;
  };
  const learnersBy = by(counts as any[]), devBy = by(devs as any[]), syncBy = by(lastSync as any[]), staffBy = by(staffCounts as any[]);
  const modsBy = new Map<number, string[]>();
  for (const m of modules as any[]) {
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
    pagination: { page, limit, total, totalPages: totalPages(total, limit) },
  });
}
