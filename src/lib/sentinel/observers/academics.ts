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
 * A third check reuses ingestion_runs (migrations/ingestion_memory.sql),
 * which the bulk results-import pipeline (pipeline_name='results',
 * src/app/api/class_results/import/v2/route.ts) already writes with real
 * parsed/failed/orphaned counts and a full report_json per run.
 *
 * Confirmed narrower than "results submission" in general: this only covers
 * the bulk CSV/Excel import path. The everyday teacher-facing "enter marks
 * and submit" flow (/api/class_results/submit, /api/class_results/bulk-submit)
 * has no persisted status/error column at all — a failure there returns a
 * 500 to the caller and is never written to the database, so there is
 * nothing for an observer to read after the fact. Investigated directly
 * (class_results has no status/error column; audit_log has no status
 * column either) rather than assumed. Closing that gap for real would mean
 * adding a status/error_message column to class_results (or a new
 * class_results_submissions table), which is a schema change to an
 * existing core table — out of scope for an additive observer.
 */
import { query } from '@/lib/db';
import type { Observation } from '../types';

const STUCK_GENERATING_MINUTES = 15; // normal generation is seconds; 15m is unambiguous
const RESULTS_IMPORT_LOOKBACK_HOURS = 24;
const RESULTS_IMPORT_FAILURE_RATE_HIGH = 0.25;

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

  const imports = (await query(
    `SELECT ir.school_id, s.name,
            SUM(ir.parsed_count) parsed, SUM(ir.failed_count) failed, SUM(ir.orphaned_count) orphaned,
            COUNT(*) n, MAX(ir.finished_at) latest, MAX(ir.run_id) sample_run_id
       FROM ingestion_runs ir LEFT JOIN schools s ON s.id = ir.school_id
      WHERE ir.pipeline_name = 'results' AND ir.finished_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY ir.school_id, s.name`,
    [RESULTS_IMPORT_LOOKBACK_HOURS],
  ).catch(() => [])) as Array<{ school_id: number; name: string; parsed: number; failed: number; orphaned: number; n: number; latest: string; sample_run_id: string }>;

  for (const row of imports) {
    const attempted = Number(row.parsed) + Number(row.failed);
    if (attempted === 0) continue;
    const failureRate = Number(row.failed) / attempted;
    if (failureRate <= 0 && Number(row.orphaned) === 0) continue; // clean runs — no incident

    observations.push({
      kind: 'academic_results_import_failure',
      observer: 'academics',
      schoolId: Number(row.school_id) || null,
      module: 'Results bulk import',
      severity: failureRate >= RESULTS_IMPORT_FAILURE_RATE_HIGH ? 'high' : 'medium',
      confidence: 85,
      probableCause: `${row.failed} row(s) failed and ${row.orphaned} row(s) went unmatched (orphaned) across ${row.n} bulk results-import run(s) in the last ${RESULTS_IMPORT_LOOKBACK_HOURS}h.`,
      userImpact: 'A teacher/admin uploaded a results spreadsheet and some rows did not make it in — those students may show as missing results without anyone noticing.',
      technicalImpact: `parsed=${row.parsed}, failed=${row.failed}, orphaned=${row.orphaned} over ${row.n} run(s).`,
      evidence: [
        { label: 'Runs (lookback)', value: row.n },
        { label: 'Failed rows', value: row.failed },
        { label: 'Orphaned rows', value: row.orphaned },
        { label: 'Last run', value: row.latest },
        { label: 'Sample run_id', value: row.sample_run_id },
      ],
      recommendedAction: `Open ingestion_runs.report_json for run_id=${row.sample_run_id} (or the import-review UI) to see exactly which rows failed and why.`,
      autoRemediationSafe: false,
      notifyRequired: failureRate >= RESULTS_IMPORT_FAILURE_RATE_HIGH,
      dedupKey: `academic_results_import_failure::${row.school_id ?? 'global'}`,
    });
  }

  return observations;
}
