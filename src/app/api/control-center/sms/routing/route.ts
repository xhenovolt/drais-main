/**
 * Control Center — which SMS provider/account each school sends through.
 *
 *   GET  → every school with its route, what it effectively resolves to, and the available providers.
 *   PUT  { schoolIds: number[] | 'all', mode: 'inherit'|'central'|'own'|'same_as',
 *          centralProviderId?, sourceSchoolId?, note? }
 *        → apply one route to one school, several schools, or all schools.
 *
 * "same_as" is "school A uses whatever school B uses": no secret is copied; it is resolved live.
 * Secrets are never returned. Control-session gated, validated (no loops, no dangling sources) and audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { query } from '@/lib/db';
import {
  ROUTE_MODES, clearRouteCache, ensureRoutesTable, getActiveCentralId, loadRoutes, resolveRoutePlan,
  schoolsWithOwnCreds, validateProposedRoute, type RouteMode, type RoutePlan, type RouteRow,
} from '@/lib/sms/school-routing';

export const runtime = 'nodejs';

const describe = (plan: RoutePlan, schoolName: (id: number) => string, providerName: (id: number) => string, activeName: string | null) => {
  switch (plan.kind) {
    case 'legacy': return { label: 'Default (no explicit route)', detail: `Composer & event SMS: platform provider${activeName ? ` (${activeName})` : ''}. Attendance & bulk SMS: the school's own Africa's Talking account, else the platform's.`, ok: true };
    case 'central': return { label: providerName(plan.providerId), detail: 'Central provider', ok: true };
    case 'own': return { label: plan.via.length > 1 ? `Account of ${schoolName(plan.schoolId)}` : 'Own account', detail: "Africa's Talking credentials", ok: true };
    case 'error': return { label: 'Not working', detail: plan.reason, ok: false };
  }
};

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.route.view')) return NextResponse.json({ error: 'You do not have permission to view SMS routing' }, { status: 403 });
  await ensureRoutesTable();

  const [schools, routes, creds, activeId, providers, settings] = await Promise.all([
    query(`SELECT id, name FROM schools WHERE deleted_at IS NULL ORDER BY name ASC`, []).catch(() => []) as Promise<any[]>,
    loadRoutes(), schoolsWithOwnCreds(), getActiveCentralId(),
    query(`SELECT id, provider_type, display_name, enabled, is_active, status FROM sms_provider_configs ORDER BY id`, []).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, sms_enabled FROM comm_settings`, []).catch(() => []) as Promise<any[]>,
  ]);
  const names = new Map<number, string>(schools.map((s) => [Number(s.id), String(s.name)]));
  const pnames = new Map<number, string>(providers.map((p) => [Number(p.id), String(p.display_name)]));
  const smsOn = new Map<number, boolean>(settings.map((s) => [Number(s.school_id), Number(s.sms_enabled) === 1]));
  const activeName = activeId ? pnames.get(activeId) ?? null : null;
  const has = (id: number) => creds.has(id);

  return NextResponse.json({
    success: true,
    canManage: controlCan(user.role, 'sms.route.manage'),
    activeProviderId: activeId,
    providers: providers.map((p) => ({ id: Number(p.id), type: p.provider_type, name: p.display_name, enabled: Number(p.enabled) === 1, active: Number(p.is_active) === 1, status: p.status })),
    schools: schools.map((s) => {
      const id = Number(s.id);
      const row = routes.get(id) ?? { mode: 'inherit' as RouteMode, centralProviderId: null, sourceSchoolId: null };
      const eff = describe(resolveRoutePlan(id, routes, has, activeId), (i) => names.get(i) ?? `School ${i}`, (i) => pnames.get(i) ?? `Provider ${i}`, activeName);
      return {
        id, name: s.name, mode: row.mode, centralProviderId: row.centralProviderId, sourceSchoolId: row.sourceSchoolId,
        sourceSchoolName: row.sourceSchoolId ? names.get(row.sourceSchoolId) ?? null : null,
        hasOwnCredentials: has(id), smsEnabled: smsOn.get(id) ?? true, effective: eff,
      };
    }),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.route.manage')) return NextResponse.json({ error: 'You do not have permission to change SMS routing' }, { status: 403 });
  await ensureRoutesTable();

  const body = await req.json().catch(() => null) as any;
  if (!body || !ROUTE_MODES.includes(body.mode)) return NextResponse.json({ error: 'A valid mode is required' }, { status: 400 });
  const mode = body.mode as RouteMode;

  const allSchools = (await query(`SELECT id FROM schools WHERE deleted_at IS NULL`, []).catch(() => [])) as any[];
  const valid = new Set(allSchools.map((s) => Number(s.id)));
  const proposed: RouteRow = {
    mode,
    centralProviderId: mode === 'central' ? Number(body.centralProviderId) || null : null,
    sourceSchoolId: mode === 'same_as' ? Number(body.sourceSchoolId) || null : null,
  };

  let targets: number[] = body.schoolIds === 'all'
    ? [...valid]
    : Array.isArray(body.schoolIds) ? body.schoolIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
  if (proposed.mode === 'same_as' && proposed.sourceSchoolId) targets = targets.filter((t) => t !== proposed.sourceSchoolId);
  targets = [...new Set(targets)].filter((t) => valid.has(t));
  if (targets.length === 0) return NextResponse.json({ error: 'Choose at least one school' }, { status: 400 });
  if (targets.length > 500) return NextResponse.json({ error: 'Too many schools in one change' }, { status: 400 });

  if (proposed.mode === 'central') {
    const p = ((await query(`SELECT id, enabled FROM sms_provider_configs WHERE id = ? LIMIT 1`, [proposed.centralProviderId]).catch(() => [])) as any[])[0];
    if (!p || Number(p.enabled) !== 1) return NextResponse.json({ error: 'Choose an enabled provider' }, { status: 400 });
  }
  if (proposed.mode === 'same_as' && (!proposed.sourceSchoolId || !valid.has(proposed.sourceSchoolId))) {
    return NextResponse.json({ error: 'Choose the school whose provider should be used' }, { status: 400 });
  }

  const [routes, creds, activeId] = await Promise.all([loadRoutes(), schoolsWithOwnCreds(), getActiveCentralId()]);
  if (mode !== 'inherit') {
    const problem = validateProposedRoute(targets, proposed, routes, (id) => creds.has(id), activeId);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const note = typeof body.note === 'string' ? body.note.slice(0, 255) : null;
  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    if (mode === 'inherit') {
      await query(`DELETE FROM school_sms_routes WHERE school_id IN (${chunk.map(() => '?').join(',')})`, chunk);
    } else {
      await query(
        `INSERT INTO school_sms_routes (school_id, mode, central_provider_id, source_school_id, note, updated_by)
         VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}
         ON DUPLICATE KEY UPDATE mode = VALUES(mode), central_provider_id = VALUES(central_provider_id),
           source_school_id = VALUES(source_school_id), note = VALUES(note), updated_by = VALUES(updated_by)`,
        chunk.flatMap((id) => [id, mode, proposed.centralProviderId, proposed.sourceSchoolId, note, user.id]),
      );
    }
  }
  clearRouteCache();
  await controlAudit(user.id, 'set_sms_route', `schools:${targets.length === valid.size ? 'all' : targets.slice(0, 20).join(',')}`,
    { mode, centralProviderId: proposed.centralProviderId, sourceSchoolId: proposed.sourceSchoolId, count: targets.length }, clientIp(req)).catch(() => {});

  return NextResponse.json({ success: true, updated: targets.length, mode });
}
