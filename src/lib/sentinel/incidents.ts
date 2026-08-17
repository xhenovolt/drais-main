/**
 * DRAIS Sentinel — incident engine.
 *
 * Normalizes an Observation from any observer into a persisted Incident.
 * This is the anti-noise core: the SAME problem recurring never becomes a
 * second row. It becomes the SAME row with occurrence_count incremented and
 * severity re-evaluated against persistence (severity.ts).
 *
 * recordIncident() is the single entry point every observer calls. It:
 *   1. Computes the dedup key (explicit override, or derived from
 *      kind+scope+school+module).
 *   2. Upserts by that key — INSERT for a new problem, UPDATE for a
 *      recurrence (occurrence_count + 1, last_detected_at bumped, severity
 *      escalated by persistence, evidence refreshed to the latest sample).
 *   3. Never re-opens a problem the operator already resolved/suppressed
 *      TODAY unless it re-escalates severity — a human decision should not
 *      be silently overwritten by the next sweep tick.
 *   4. Decides whether this crossing requires an SMS alert and, if so,
 *      calls the independent alert path (alert.ts) — never notification_outbox.
 */
import { query } from '@/lib/db';
import { ensureSentinelSchema } from './schema';
import { requiresSmsAlert, RENOTIFY_COOLDOWN_SECONDS } from './severity';
import { decideTransition } from './incident-transition';
import { dispatchSentinelAlert } from './alert';
import type { Incident, IncidentStatus, Observation, Severity } from './types';

function deriveDedupKey(o: Observation): string {
  if (o.dedupKey) return o.dedupKey;
  return [o.kind, o.schoolId ?? 'global', o.module].join('::').slice(0, 190);
}

function parseEvidence(raw: any): Incident['evidence'] {
  if (!raw) return [];
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
}

function rowToIncident(r: any): Incident {
  return {
    id: Number(r.id),
    dedupKey: r.dedup_key,
    kind: r.kind,
    observer: r.observer,
    scope: r.scope,
    schoolId: r.school_id != null ? Number(r.school_id) : null,
    schoolName: r.school_name ?? null,
    module: r.module,
    severity: r.severity,
    confidence: Number(r.confidence),
    status: r.status,
    firstDetectedAt: new Date(r.first_detected_at).toISOString(),
    lastDetectedAt: new Date(r.last_detected_at).toISOString(),
    occurrenceCount: Number(r.occurrence_count),
    probableCause: r.probable_cause ?? '',
    userImpact: r.user_impact ?? '',
    technicalImpact: r.technical_impact ?? '',
    evidence: parseEvidence(r.evidence),
    recommendedAction: r.recommended_action ?? '',
    autoRemediationSafe: !!r.auto_remediation_safe,
    notifyRequired: !!r.notify_required,
    notifiedAt: r.notified_at ? new Date(r.notified_at).toISOString() : null,
    acknowledgedBy: r.acknowledged_by != null ? Number(r.acknowledged_by) : null,
    acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : null,
    resolvedBy: r.resolved_by != null ? Number(r.resolved_by) : null,
    resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    suppressedReason: r.suppressed_reason ?? null,
  };
}

export interface RecordResult {
  incident: Incident;
  isNew: boolean;
  escalated: boolean;
  alerted: boolean;
}

/**
 * The single entry point every observer uses. Idempotent, dedup-aware,
 * never throws (an observer's failure to record must never break the
 * request path it was observing).
 */
export async function recordIncident(o: Observation): Promise<RecordResult | null> {
  try {
    await ensureSentinelSchema();
    const dedupKey = deriveDedupKey(o);
    const scope: 'global' | 'school' = o.schoolId == null ? 'global' : 'school';

    const existingRows = (await query(
      `SELECT * FROM sentinel_incidents WHERE dedup_key = ? LIMIT 1`, [dedupKey],
    ).catch(() => [])) as any[];
    const existing = existingRows[0] ?? null;

    // All dedup/escalation/reopen/silent-recurrence decisions live in the
    // PURE, unit-tested decideTransition() — see incident-transition.ts and
    // its chaos-suite coverage.
    const transition = decideTransition(
      existing ? { occurrenceCount: Number(existing.occurrence_count), status: existing.status, severity: existing.severity } : null,
      o.severity,
    );
    const { isNew, occurrenceCount, severity, status } = transition;

    if (existing && transition.silentRecurrence) {
      // Still record the occurrence for trend purposes, but do not reopen
      // or re-alert — a human already closed this at an equal-or-higher bar.
      await query(
        `UPDATE sentinel_incidents SET occurrence_count = ?, last_detected_at = NOW() WHERE id = ?`,
        [occurrenceCount, existing.id],
      ).catch(() => {});
      return { incident: rowToIncident({ ...existing, occurrence_count: occurrenceCount }), isNew: false, escalated: false, alerted: false };
    }

    if (existing) {
      await query(
        `UPDATE sentinel_incidents
            SET severity = ?, confidence = ?, status = ?, last_detected_at = NOW(),
                occurrence_count = ?, probable_cause = ?, user_impact = ?, technical_impact = ?,
                evidence = ?, recommended_action = ?, auto_remediation_safe = ?, notify_required = ?
          WHERE id = ?`,
        [
          severity, o.confidence, status, occurrenceCount,
          o.probableCause.slice(0, 400), o.userImpact.slice(0, 400), o.technicalImpact.slice(0, 400),
          JSON.stringify(o.evidence).slice(0, 8000), o.recommendedAction.slice(0, 400),
          o.autoRemediationSafe, o.notifyRequired, existing.id,
        ],
      );
    } else {
      await query(
        `INSERT INTO sentinel_incidents
           (dedup_key, kind, observer, scope, school_id, module, severity, confidence, status,
            probable_cause, user_impact, technical_impact, evidence, recommended_action,
            auto_remediation_safe, notify_required)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
        [
          dedupKey, o.kind, o.observer, scope, o.schoolId, o.module, severity, o.confidence,
          o.probableCause.slice(0, 400), o.userImpact.slice(0, 400), o.technicalImpact.slice(0, 400),
          JSON.stringify(o.evidence).slice(0, 8000), o.recommendedAction.slice(0, 400),
          o.autoRemediationSafe, o.notifyRequired,
        ],
      );
    }

    const rows = (await query(`SELECT * FROM sentinel_incidents WHERE dedup_key = ? LIMIT 1`, [dedupKey]).catch(() => [])) as any[];
    const saved = rows[0];
    if (!saved) return null;
    const incident = rowToIncident(saved);

    let alerted = false;
    if (o.notifyRequired && requiresSmsAlert(severity)) {
      const lastNotifiedMs = saved.notified_at ? new Date(saved.notified_at).getTime() : 0;
      const withinCooldown = Date.now() - lastNotifiedMs < RENOTIFY_COOLDOWN_SECONDS * 1000;
      const severityRoseSinceNotify = !existing || severity !== existing.severity;
      if (!withinCooldown || severityRoseSinceNotify) {
        const sent = await dispatchSentinelAlert(incident).catch(() => false);
        if (sent) {
          await query(`UPDATE sentinel_incidents SET notified_at = NOW() WHERE id = ?`, [incident.id]).catch(() => {});
          alerted = true;
        }
      }
    }

    return { incident, isNew, escalated: !isNew && severity !== o.severity, alerted };
  } catch (err) {
    console.warn('[sentinel] recordIncident failed (non-fatal):', err);
    return null;
  }
}

export interface ListFilter {
  status?: IncidentStatus | 'active';
  severity?: Severity;
  schoolId?: number;
  limit?: number;
}

export async function listIncidents(filter: ListFilter = {}): Promise<Incident[]> {
  await ensureSentinelSchema();
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status === 'active') where.push(`i.status IN ('open','acknowledged')`);
  else if (filter.status) { where.push(`i.status = ?`); params.push(filter.status); }
  if (filter.severity) { where.push(`i.severity = ?`); params.push(filter.severity); }
  if (filter.schoolId) { where.push(`i.school_id = ?`); params.push(filter.schoolId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(200, Math.max(1, filter.limit ?? 100));

  const rows = (await query(
    `SELECT i.*, s.name AS school_name FROM sentinel_incidents i
       LEFT JOIN schools s ON s.id = i.school_id
      ${whereSql}
      ORDER BY FIELD(i.severity,'critical','high','medium','low','info'), i.last_detected_at DESC
      LIMIT ${limit}`,
    params,
  ).catch(() => [])) as any[];
  return rows.map(rowToIncident);
}

export async function getIncident(id: number): Promise<Incident | null> {
  await ensureSentinelSchema();
  const rows = (await query(
    `SELECT i.*, s.name AS school_name FROM sentinel_incidents i
       LEFT JOIN schools s ON s.id = i.school_id WHERE i.id = ? LIMIT 1`,
    [id],
  ).catch(() => [])) as any[];
  return rows[0] ? rowToIncident(rows[0]) : null;
}

export async function acknowledgeIncident(id: number, byUserId: number): Promise<void> {
  await ensureSentinelSchema();
  await query(
    `UPDATE sentinel_incidents SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = NOW()
      WHERE id = ? AND status = 'open'`,
    [byUserId, id],
  ).catch(() => {});
}

export async function resolveIncident(id: number, byUserId: number): Promise<void> {
  await ensureSentinelSchema();
  await query(
    `UPDATE sentinel_incidents SET status = 'resolved', resolved_by = ?, resolved_at = NOW()
      WHERE id = ? AND status IN ('open','acknowledged')`,
    [byUserId, id],
  ).catch(() => {});
}

export async function suppressIncident(id: number, reason: string, byUserId: number): Promise<void> {
  await ensureSentinelSchema();
  await query(
    `UPDATE sentinel_incidents SET status = 'suppressed', suppressed_reason = ?, resolved_by = ?, resolved_at = NOW()
      WHERE id = ?`,
    [reason.slice(0, 300), byUserId, id],
  ).catch(() => {});
}

/** For the "re-run diagnostic" affordance — clears nothing, just re-fetches current truth. */
export async function activeIncidentSummary(): Promise<{ critical: number; high: number; medium: number; low: number; info: number; total: number }> {
  await ensureSentinelSchema();
  const rows = (await query(
    `SELECT severity, COUNT(*) n FROM sentinel_incidents WHERE status IN ('open','acknowledged') GROUP BY severity`,
  ).catch(() => [])) as any[];
  const out = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
  for (const r of rows) { (out as any)[r.severity] = Number(r.n); out.total += Number(r.n); }
  return out;
}
