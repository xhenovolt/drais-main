/**
 * Control Center — Sentinel status (GET).
 * Overall picture for the Sentinel dashboard header: active incident
 * counts, background-job heartbeats, Sentinel's own self-check, and
 * whether an alert phone is configured. Read-only, any control session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { activeIncidentSummary } from '@/lib/sentinel/incidents';
import { allHeartbeats } from '@/lib/sentinel/heartbeat';
import { selfCheck } from '@/lib/sentinel/observers/self';
import { getAlertPhone, alertingEnabled } from '@/lib/sentinel/alert';
import { SENTINEL_VERSION, DIAGNOSTIC_ENGINE_VERSION } from '@/lib/sentinel/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [incidents, heartbeats, self, phone, enabled] = await Promise.all([
    activeIncidentSummary().catch(() => null),
    allHeartbeats().catch(() => []),
    selfCheck().catch(() => null),
    getAlertPhone().catch(() => null),
    alertingEnabled().catch(() => false),
  ]);

  return NextResponse.json({
    success: true,
    version: { sentinel: SENTINEL_VERSION, engine: DIAGNOSTIC_ENGINE_VERSION },
    incidents: incidents ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0, unavailable: true },
    heartbeats,
    self,
    alerting: { configured: !!phone, enabled, phoneMasked: phone ? phone.replace(/\d(?=\d{3})/g, '•') : null },
  });
}
