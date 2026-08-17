/**
 * DRAIS Sentinel — academics observer.
 *
 * Reuses the EXISTING report_snapshots status machine
 * (generating → ready | failed | cancelled | stale — sql/report_snapshots.sql,
 * src/lib/snapshots/lifecycle.ts) rather than inventing a parallel signal.
 * Two real failure shapes, both already representable in that table:
 *
 *   1. status='failed' with a recorded error_message — report-card
 *      generation actually failed and DRAIS already knows why.
 *   2. status='generating' stuck well past a normal generation time — the
 *      single-flight lock (uk_inflight) never resolved, which blocks any
 *      retry for that (school, term, year, type) until it's cleared.
 *
 * Results-submission-specific status tracking was not found as an
 * equally clean existing signal in the time available this session — see
 * the Sentinel final validation report's "not yet detectable" section.
 * `academic_generation_failure` already covers what's implemented here;
 * a results-submission-specific IncidentKind can be added the same way
 * once an equivalent status/error column is identified.
 */
import { query } from '@/lib/db';
import type { Observation } from '../types';

const STUCK_GENERATING_MINUTES = 15; // normal generation is seconds; 15m is unambiguous

export async function observeAcademics(): Promise<Observation[]> {
  const observations: Observation[] = [];

  const failed = (await query(
    `SELECT rs.school_id, s.name, rs.type, rs.term_id, rs.year_id, rs.error_message, COUNT(*) n, MAX(rs.generated_at) latest
       FROM report_snapshots rs LEFT JOIN schools s ON s.id = rs.school_id
      WHERE rs.status = 'failed' AND rs.generated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY rs.school_id, s.name, rs.type, rs.term_id, rs.year_id, rs.error_message`,
  ).catch(() => [])) as Array<{ school_id: number; name: string; type: string; n: number; error_message: string | null; latest: string }>;

  for (const row of failed) {
    observations.push({
      kind: 'academic_generation_failure',
      observer: 'academics',
      schoolId: Number(row.school_id) || null,
      module: 'Report card generation',
      severity: row.n >= 5 ? 'high' : 'medium',
      confidence: 90,
      probableCause: row.error_message || 'Report snapshot generation failed without a recorded error message.',
      userImpact: 'A teacher or admin tried to generate report cards and it did not work — they may be retrying repeatedly without knowing why.',
      technicalImpact: `${row.n} failed generation(s) in 24h for type=${row.type}.`,
      evidence: [
        { label: 'Failures (24h)', value: row.n },
        { label: 'Report type', value: row.type },
        { label: 'Last failure', value: row.latest },
        ...(row.error_message ? [{ label: 'Error', value: row.error_message.slice(0, 200) }] : []),
      ],
      recommendedAction: 'Check error_message on the failed report_snapshots row(s); likely a data-completeness or template issue for this term.',
      autoRemediationSafe: false,
      notifyRequired: row.n >= 5,
      dedupKey: `academic_generation_failure::${row.school_id ?? 'global'}::failed::${row.type}`,
    });
  }

  const stuck = (await query(
    `SELECT rs.school_id, s.name, rs.type, COUNT(*) n, MIN(rs.generated_at) oldest
       FROM report_snapshots rs LEFT JOIN schools s ON s.id = rs.school_id
      WHERE rs.status = 'generating' AND rs.generated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
      GROUP BY rs.school_id, s.name, rs.type`,
    [STUCK_GENERATING_MINUTES],
  ).catch(() => [])) as Array<{ school_id: number; name: string; type: string; n: number; oldest: string }>;

  for (const row of stuck) {
    observations.push({
      kind: 'academic_generation_failure',
      observer: 'academics',
      schoolId: Number(row.school_id) || null,
      module: 'Report card generation',
      severity: 'high',
      confidence: 85,
      probableCause: 'A report-snapshot generation started and never reached ready/failed — the single-flight lock for this (term, type) is stuck.',
      userImpact: 'Nobody can regenerate report cards for this term/type until the stuck lock clears — every attempt will be rejected as already in progress.',
      technicalImpact: `${row.n} snapshot(s) stuck in 'generating' for over ${STUCK_GENERATING_MINUTES} minutes, oldest since ${row.oldest}.`,
      evidence: [{ label: 'Stuck count', value: row.n }, { label: 'Oldest since', value: row.oldest }],
      recommendedAction: 'The existing stale-lock reclaim in src/lib/snapshots/lifecycle.ts should have cleared this — investigate why it did not run or was skipped for this row.',
      autoRemediationSafe: false,
      notifyRequired: true,
      dedupKey: `academic_generation_failure::${row.school_id ?? 'global'}::stuck::${row.type}`,
    });
  }

  return observations;
}
