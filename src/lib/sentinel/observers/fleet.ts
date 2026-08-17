/**
 * DRAIS Sentinel — fleet observer.
 *
 * Deliberately does NOT reimplement per-school scanning. It calls the
 * EXISTING getPlatformHealth() (src/lib/control/platform-health.ts, Phase 17)
 * — the same licence/attendance-flow/device/clock/SMS/sync scan the
 * pre-existing Platform Health Center page already uses — and converts each
 * HealthIssue into a full Sentinel Incident (severity, confidence, evidence,
 * user impact, recommended action, dedup/escalation, SMS eligibility).
 *
 * The pre-existing platform_alerts / AlertsFeed / health-history trend chart
 * are left completely untouched — this is a second, richer consumer of the
 * same underlying scan, not a replacement.
 */
import { getPlatformHealth, type HealthIssue, type Severity as HealthSeverity } from '@/lib/control/platform-health';
import type { IncidentKind, Observation, Severity } from '../types';

const SEV_MAP: Record<HealthSeverity, Severity> = { critical: 'high', warning: 'medium', info: 'info' };
const KIND_MAP: Record<string, IncidentKind> = {
  no_attendance: 'attendance_no_punches',
  devices_offline: 'device_offline',
  no_devices: 'device_offline',
  clock_drift: 'device_clock_drift',
  sms_failed: 'notification_delivery_failing',
  sync_out_of_sync: 'device_offline',
  licence_expired: 'background_job_stale', // closest existing kind; platform-owned, not device
  licence_expiring: 'background_job_stale',
};

function moduleFor(type: string): string {
  const labels: Record<string, string> = {
    no_attendance: 'Attendance flow', devices_offline: 'Devices', no_devices: 'Devices',
    clock_drift: 'Device clock health', sms_failed: 'SMS delivery', sync_out_of_sync: 'Device sync',
    licence_expired: 'Subscription', licence_expiring: 'Subscription',
  };
  return labels[type] ?? type;
}

function userImpactFor(issue: HealthIssue): string {
  const map: Record<string, string> = {
    no_attendance: 'Attendance is not being captured — the school may believe attendance is running when nothing is recording.',
    devices_offline: 'Biometric devices are unreachable — no new attendance can be captured until they reconnect.',
    no_devices: 'This school has no registered attendance devices.',
    clock_drift: 'Attendance timestamps for this school may be visibly wrong to anyone viewing logs.',
    sms_failed: 'Parents/staff are not receiving SMS notifications from this school.',
    sync_out_of_sync: 'A device has not synchronised recently; recent activity may be missing.',
    licence_expired: 'This school has lost access — a real support/business event, not a technical one.',
    licence_expiring: 'This school will lose access soon if not renewed.',
  };
  return map[issue.type] ?? issue.detail;
}

export async function observeFleet(): Promise<Observation[]> {
  const { schools } = await getPlatformHealth();
  const out: Observation[] = [];
  for (const school of schools) {
    for (const issue of school.issues) {
      out.push({
        kind: KIND_MAP[issue.type] ?? 'device_offline',
        observer: 'fleet',
        schoolId: school.id,
        module: moduleFor(issue.type),
        severity: SEV_MAP[issue.severity],
        confidence: 90,
        probableCause: issue.detail,
        userImpact: userImpactFor(issue),
        technicalImpact: issue.detail,
        evidence: [{ label: 'School', value: school.name }, { label: 'Issue type', value: issue.type }],
        recommendedAction: 'See Platform Health Center for this school\'s full issue register.',
        autoRemediationSafe: false,
        notifyRequired: issue.severity === 'critical',
        dedupKey: `fleet::${school.id}::${issue.type}`,
      });
    }
  }
  return out;
}
