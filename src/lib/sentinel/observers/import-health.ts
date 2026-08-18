/**
 * DRAIS Sentinel — import-health observer (import redesign Phase D).
 *
 * Generic across every pipeline built on the unified ingestion contract
 * (students, fees, results — src/lib/ingestion/pipeline.ts) via the
 * shared ingestion_runs audit table (migrations/ingestion_memory.sql).
 * Deliberately NOT split per-domain: students/fees imports aren't
 * academics, and a per-domain copy of this same check would have
 * double-reported the same ingestion_runs row as two separate incidents.
 * (The results-specific version of this check used to live in
 * observers/academics.ts — moved here for that reason.)
 *
 * Per the original import-redesign brief's Sentinel-integration
 * requirement: "abnormal import failure rates, repeated import failures,
 * unusually high duplicate rates... unusually large imports... repeated
 * financial import conflicts." Three checks below map directly onto
 * that list. Sentinel only OBSERVES ingestion_runs after the fact — it
 * is never in the import's own request path, so imports keep working
 * exactly as before if Sentinel itself is degraded or unavailable.
 */
import { query } from '@/lib/db';
import type { Observation, IncidentKind } from '../types';

const LOOKBACK_HOURS = 24;
const FAILURE_RATE_HIGH = 0.25;
const REPEATED_FAILURE_RUN_THRESHOLD = 3; // 3+ consecutive failing runs = a persistent problem, not a blip
const LARGE_IMPORT_ROW_THRESHOLD = 5000;

const PIPELINE_LABEL: Record<string, string> = {
  students: 'Student import',
  fees: 'Fee import',
  results: 'Results bulk import',
};

function pipelineModule(pipelineName: string): string {
  return PIPELINE_LABEL[pipelineName] ?? `${pipelineName} import`;
}

/** fees gets its own userImpact wording — a "failure" there is a payment
 *  that couldn't be recorded, not a row that vanished silently. */
function userImpactFor(pipelineName: string, kind: 'failure' | 'orphan'): string {
  if (pipelineName === 'fees') {
    return kind === 'orphan'
      ? 'A payment row referenced a student DRAIS could not find — held for review rather than guessed at, but the payment is not recorded until someone resolves it.'
      : 'A payment row failed to record — money that was actually paid may not show up in the student\'s ledger.';
  }
  if (pipelineName === 'students') {
    return kind === 'orphan'
      ? 'A student row could not be confidently matched or created — held for review.'
      : 'A student row failed to import.';
  }
  return kind === 'orphan'
    ? 'A row could not be matched to an existing student — those students may show as missing data without anyone noticing.'
    : 'Rows failed to import and were not recorded.';
}

export async function observeImportHealth(): Promise<Observation[]> {
  const observations: Observation[] = [];

  // ── 1. Failure-rate anomaly per (school, pipeline), last 24h ──────────────
  const byRun = (await query(
    `SELECT ir.school_id, s.name, ir.pipeline_name,
            SUM(ir.parsed_count) parsed, SUM(ir.failed_count) failed, SUM(ir.orphaned_count) orphaned,
            COUNT(*) n, MAX(ir.finished_at) latest, MAX(ir.run_id) sample_run_id
       FROM ingestion_runs ir LEFT JOIN schools s ON s.id = ir.school_id
      WHERE ir.finished_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      GROUP BY ir.school_id, s.name, ir.pipeline_name`,
    [LOOKBACK_HOURS],
  ).catch(() => [])) as Array<{ school_id: number; name: string; pipeline_name: string; parsed: number; failed: number; orphaned: number; n: number; latest: string; sample_run_id: string }>;

  for (const row of byRun) {
    const attempted = Number(row.parsed) + Number(row.failed);
    if (attempted === 0) continue;
    const failureRate = Number(row.failed) / attempted;
    if (failureRate <= 0 && Number(row.orphaned) === 0) continue; // clean runs — no incident

    const kind: IncidentKind = 'import_failure_rate_anomaly';
    observations.push({
      kind,
      observer: 'import_health',
      schoolId: Number(row.school_id) || null,
      module: pipelineModule(row.pipeline_name),
      severity: failureRate >= FAILURE_RATE_HIGH ? 'high' : 'medium',
      confidence: 85,
      probableCause: `${row.failed} row(s) failed and ${row.orphaned} row(s) went unmatched (orphaned) across ${row.n} ${row.pipeline_name} import run(s) in the last ${LOOKBACK_HOURS}h.`,
      userImpact: userImpactFor(row.pipeline_name, row.failed > 0 ? 'failure' : 'orphan'),
      technicalImpact: `parsed=${row.parsed}, failed=${row.failed}, orphaned=${row.orphaned} over ${row.n} run(s).`,
      evidence: [
        { label: 'Pipeline', value: row.pipeline_name },
        { label: 'Runs (lookback)', value: row.n },
        { label: 'Failed rows', value: row.failed },
        { label: 'Orphaned rows', value: row.orphaned },
        { label: 'Last run', value: row.latest },
        { label: 'Sample run_id', value: row.sample_run_id },
      ],
      recommendedAction: `Open ingestion_runs.report_json for run_id=${row.sample_run_id} to see exactly which rows failed and why.`,
      autoRemediationSafe: false,
      notifyRequired: failureRate >= FAILURE_RATE_HIGH,
      dedupKey: `import_failure_rate_anomaly::${row.school_id ?? 'global'}::${row.pipeline_name}`,
    });
  }

  // ── 2. Repeated failures — a persistent problem, not a one-off blip ──────
  // Distinct from #1: this looks at CONSECUTIVE recent runs having ANY
  // failure at all, regardless of rate within each run — catches a school
  // whose export format quietly broke and every subsequent daily/weekly
  // re-upload keeps failing the same way.
  const recentRuns = (await query(
    `SELECT ir.school_id, s.name, ir.pipeline_name, ir.run_id, ir.failed_count, ir.finished_at,
            ROW_NUMBER() OVER (PARTITION BY ir.school_id, ir.pipeline_name ORDER BY ir.finished_at DESC) AS rn
       FROM ingestion_runs ir LEFT JOIN schools s ON s.id = ir.school_id
      WHERE ir.finished_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  ).catch(() => [])) as Array<{ school_id: number; name: string; pipeline_name: string; run_id: string; failed_count: number; finished_at: string; rn: number }>;

  const byGroup = new Map<string, typeof recentRuns>();
  for (const r of recentRuns) {
    if (r.rn > REPEATED_FAILURE_RUN_THRESHOLD) continue; // only look at the most recent N runs per group
    const key = `${r.school_id ?? 'null'}::${r.pipeline_name}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(r);
  }
  for (const [key, runs] of byGroup) {
    if (runs.length < REPEATED_FAILURE_RUN_THRESHOLD) continue; // not enough history yet to call it a pattern
    const allFailed = runs.every((r) => Number(r.failed_count) > 0);
    if (!allFailed) continue;
    const [schoolIdStr, pipelineName] = key.split('::');
    const schoolId = schoolIdStr === 'null' ? null : Number(schoolIdStr);
    observations.push({
      kind: 'import_repeated_failures',
      observer: 'import_health',
      schoolId,
      module: pipelineModule(pipelineName),
      severity: 'high',
      confidence: 90,
      probableCause: `The last ${runs.length} ${pipelineName} import runs for this school ALL had at least one failed row — this looks like a persistently broken export format or mapping, not an occasional bad row.`,
      userImpact: 'This school has likely been re-uploading the same broken export repeatedly without it ever fully succeeding.',
      technicalImpact: `${runs.length}/${runs.length} of the most recent runs failed at least one row.`,
      evidence: runs.map((r) => ({ label: `Run ${r.run_id.slice(0, 8)}`, value: `${r.failed_count} failed, ${r.finished_at}` })),
      recommendedAction: 'Reach out to the school directly — a persistent format mismatch usually needs a human conversation, not another retry.',
      autoRemediationSafe: false,
      notifyRequired: true,
      dedupKey: `import_repeated_failures::${schoolId ?? 'global'}::${pipelineName}`,
    });
  }

  // ── 3. Unusually large single-run imports — awareness, not necessarily bad ─
  const largeRuns = (await query(
    `SELECT ir.school_id, s.name, ir.pipeline_name, ir.run_id, ir.parsed_count, ir.finished_at
       FROM ingestion_runs ir LEFT JOIN schools s ON s.id = ir.school_id
      WHERE ir.finished_at >= DATE_SUB(NOW(), INTERVAL ? HOUR) AND ir.parsed_count >= ?`,
    [LOOKBACK_HOURS, LARGE_IMPORT_ROW_THRESHOLD],
  ).catch(() => [])) as Array<{ school_id: number; name: string; pipeline_name: string; run_id: string; parsed_count: number; finished_at: string }>;

  for (const row of largeRuns) {
    observations.push({
      kind: 'import_unusually_large',
      observer: 'import_health',
      schoolId: Number(row.school_id) || null,
      module: pipelineModule(row.pipeline_name),
      severity: 'low',
      confidence: 100,
      probableCause: `A single ${row.pipeline_name} import run processed ${row.parsed_count} rows — well above the ${LARGE_IMPORT_ROW_THRESHOLD}-row awareness threshold.`,
      userImpact: 'None inherently — this is informational. A run this large is worth a quick look to confirm it was intentional (e.g. a full-year re-import) rather than a duplicate/accidental re-upload.',
      technicalImpact: `${row.parsed_count} rows in one run (run_id=${row.run_id}).`,
      evidence: [{ label: 'Rows in run', value: row.parsed_count }, { label: 'Run', value: row.run_id }, { label: 'Finished', value: row.finished_at }],
      recommendedAction: 'No action required unless this size is unexpected for this school.',
      autoRemediationSafe: false,
      notifyRequired: false,
      dedupKey: `import_unusually_large::${row.school_id ?? 'global'}::${row.run_id}`,
    });
  }

  return observations;
}
