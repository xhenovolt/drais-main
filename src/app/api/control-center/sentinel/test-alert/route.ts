/**
 * Control Center — send one real test SMS through the Sentinel alert path.
 * XHENVOLT_SUPER_ADMIN only. This sends an ACTUAL message to the configured
 * number via the same dispatchSentinelAlert() a real incident would use —
 * it exists specifically so the operator can verify the independent path
 * works BEFORE trusting it at 3am, without waiting for a real anomaly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { dispatchSentinelAlert } from '@/lib/sentinel/alert';
import type { Incident } from '@/lib/sentinel/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (user.role !== 'XHENVOLT_SUPER_ADMIN') {
    return NextResponse.json({ error: 'Only a Super Admin may send a Sentinel test alert' }, { status: 403 });
  }

  const synthetic: Incident = {
    id: 0, dedupKey: 'test', kind: 'sentinel_self_degraded', observer: 'self',
    scope: 'global', schoolId: null, schoolName: null, module: 'Sentinel test alert',
    severity: 'high', confidence: 100, status: 'open',
    firstDetectedAt: new Date().toISOString(), lastDetectedAt: new Date().toISOString(),
    occurrenceCount: 1,
    probableCause: 'This is a test alert triggered manually from Control Centre.',
    userImpact: 'None — this is a drill.', technicalImpact: 'None — this is a drill.',
    evidence: [], recommendedAction: 'No action needed.',
    autoRemediationSafe: false, notifyRequired: true, notifiedAt: null,
    acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, suppressedReason: null,
  };

  const sent = await dispatchSentinelAlert(synthetic);
  await controlAudit(user.id, 'sentinel_test_alert', 'sentinel:test-alert', { sent }, clientIp(req)).catch(() => {});

  return NextResponse.json({ success: sent, message: sent ? 'Test alert sent.' : 'Test alert failed — check the alert phone configuration and SMS provider credentials.' });
}
