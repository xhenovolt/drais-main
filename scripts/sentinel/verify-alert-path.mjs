import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { setDbMode } from '../../src/lib/db/db-mode.ts';
setDbMode('online');
import { setAlertPhone, getAlertPhone, dispatchSentinelAlert, recentAlerts } from '../../src/lib/sentinel/alert.ts';
import { heartbeatStatus, HEARTBEATS } from '../../src/lib/sentinel/heartbeat.ts';

const PHONE = process.argv[2];
if (!PHONE) { console.error('Usage: verify-alert-path.mjs <phone>'); process.exit(1); }

async function main() {
  console.log(`Configuring Sentinel alert phone via the REAL config path (setAlertPhone — same function the Control Centre /sentinel/config route calls)...`);
  await setAlertPhone(PHONE);
  const configured = await getAlertPhone();
  console.log('Configured phone:', configured);

  const synthetic = {
    id: 0, dedupKey: 'verify-e2e', kind: 'sentinel_self_degraded', observer: 'self',
    scope: 'global', schoolId: null, schoolName: null, module: 'Sentinel end-to-end verification',
    severity: 'high', confidence: 100, status: 'open',
    firstDetectedAt: new Date().toISOString(), lastDetectedAt: new Date().toISOString(),
    occurrenceCount: 1,
    probableCause: 'This is a real end-to-end verification of dispatchSentinelAlert() — the exact function a real HIGH/CRITICAL incident calls.',
    userImpact: 'None — this is a verification run.', technicalImpact: 'None — this is a verification run.',
    evidence: [], recommendedAction: 'No action needed.',
    autoRemediationSafe: false, notifyRequired: true, notifiedAt: null,
    acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, suppressedReason: null,
  };

  console.log('\nCalling dispatchSentinelAlert() — the SAME function a real incident calls, through the SAME code path as the /test-alert route...');
  const sent = await dispatchSentinelAlert(synthetic);
  console.log('dispatchSentinelAlert() returned:', sent);

  const beat = await heartbeatStatus(HEARTBEATS.SENTINEL_ALERT_DISPATCH);
  console.log('sentinel_alert_dispatch heartbeat now:', JSON.stringify(beat));

  const alerts = await recentAlerts(3);
  console.log('Most recent sentinel_alerts rows:', JSON.stringify(alerts, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED', e); process.exit(1); });
