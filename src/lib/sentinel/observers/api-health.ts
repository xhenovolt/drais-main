/**
 * DRAIS Sentinel — API error-rate / latency observer.
 *
 * Reuses recentModuleStatsBySchool() (observe.ts) — the read side of the
 * lightweight per-request tap already wired into /api/attendance/history,
 * broken out per school rather than aggregated platform-wide. Only modules
 * that are actually instrumented produce stats; everything else is simply
 * absent from the result, which is the correct UNMONITORED behaviour (this
 * observer only asserts on what it has evidence for, never on silence).
 *
 * Kept as its own file rather than folded into sweep.ts so the thresholds
 * are named and adjustable in one place.
 */
import { recentModuleStatsBySchool } from '../observe';
import type { Observation } from '../types';

const MIN_SAMPLE = 10;          // below this, a single error looks like 100% — not enough evidence to act on
const ERROR_RATE_HIGH = 0.25;   // 1-in-4 requests failing is unambiguous
const ERROR_RATE_MEDIUM = 0.05;
const P95_LATENCY_HIGH_MS = 5000;

export async function observeApiHealth(): Promise<Observation[]> {
  const stats = await recentModuleStatsBySchool(60);
  const observations: Observation[] = [];

  for (const s of stats) {
    if (s.count < MIN_SAMPLE) continue;
    const scopeLabel = s.schoolId ? `school #${s.schoolId}` : 'platform-wide';
    const dedupScope = s.schoolId ?? 'platform';

    if (s.errorRate >= ERROR_RATE_MEDIUM) {
      observations.push({
        kind: 'api_error_rate_anomaly',
        observer: 'route',
        schoolId: s.schoolId,
        module: s.module,
        severity: s.errorRate >= ERROR_RATE_HIGH ? 'high' : 'medium',
        confidence: Math.min(95, 60 + s.count),
        probableCause: `${Math.round(s.errorRate * 100)}% of the last ${s.count} observed request(s) to ${s.module} (${scopeLabel}) returned a server error (5xx).`,
        userImpact: `Users of ${s.module} are seeing failures at an elevated rate.`,
        technicalImpact: `${s.errorCount}/${s.count} 5xx responses in the last 60 minutes.`,
        evidence: [{ label: 'Sample size (60m)', value: s.count }, { label: 'Error rate', value: `${Math.round(s.errorRate * 100)}%` }],
        recommendedAction: `Check system_errors / server logs for ${s.module} in the last hour.`,
        autoRemediationSafe: false,
        notifyRequired: s.errorRate >= ERROR_RATE_HIGH,
        dedupKey: `api_error_rate_anomaly::${dedupScope}::${s.module}`,
      });
    }

    if (s.p95DurationMs >= P95_LATENCY_HIGH_MS) {
      observations.push({
        kind: 'api_latency_anomaly',
        observer: 'route',
        schoolId: s.schoolId,
        module: s.module,
        severity: 'medium',
        confidence: Math.min(90, 55 + s.count),
        probableCause: `p95 response time for ${s.module} (${scopeLabel}) is ${s.p95DurationMs}ms over the last ${s.count} observed request(s).`,
        userImpact: `${s.module} feels slow to users at the tail — the median may be fine while some requests hang.`,
        technicalImpact: `p50=${s.p50DurationMs}ms, p95=${s.p95DurationMs}ms.`,
        evidence: [{ label: 'p50', value: `${s.p50DurationMs}ms` }, { label: 'p95', value: `${s.p95DurationMs}ms` }, { label: 'Sample size', value: s.count }],
        recommendedAction: `Profile ${s.module} for slow queries or an unbounded result set.`,
        autoRemediationSafe: false,
        notifyRequired: false,
        dedupKey: `api_latency_anomaly::${dedupScope}::${s.module}`,
      });
    }
  }

  return observations;
}
