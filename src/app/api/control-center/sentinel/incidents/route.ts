/**
 * Control Center — Sentinel incidents.
 *   GET  ?status=active|open|acknowledged|resolved|suppressed&severity=&school_id=
 *   POST { id, action: 'acknowledge'|'resolve'|'suppress', reason? }
 * Read = any control session. Mutations require sentinel.manage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { listIncidents, acknowledgeIncident, resolveIncident, suppressIncident, getIncident } from '@/lib/sentinel/incidents';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') as any;
  const severity = url.searchParams.get('severity') as any;
  const schoolId = url.searchParams.get('school_id');

  const incidents = await listIncidents({
    status: status ?? 'active',
    severity: severity || undefined,
    schoolId: schoolId ? Number(schoolId) : undefined,
    limit: 150,
  });
  return NextResponse.json({ success: true, incidents });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sentinel.manage')) {
    return NextResponse.json({ error: 'You do not have permission to manage Sentinel incidents' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  const action = body?.action;
  if (!Number.isFinite(id) || !['acknowledge', 'resolve', 'suppress'].includes(action)) {
    return NextResponse.json({ error: 'id and a valid action are required' }, { status: 400 });
  }

  if (action === 'acknowledge') await acknowledgeIncident(id, user.id);
  else if (action === 'resolve') await resolveIncident(id, user.id);
  else await suppressIncident(id, String(body?.reason || 'No reason given').slice(0, 300), user.id);

  await controlAudit(user.id, `sentinel_incident_${action}`, `sentinel_incidents:${id}`, { reason: body?.reason ?? null }, clientIp(req)).catch(() => {});

  const incident = await getIncident(id);
  return NextResponse.json({ success: true, incident });
}
