/**
 * DRAIS — results-submission log.
 *
 * The gap Sentinel's academics observer documented: /api/class_results/submit
 * and /api/class_results/bulk-submit had no persisted status/error signal at
 * all — a failure returned a 500 to the caller and left no trace. This is
 * the log table that closes it, following the exact same pattern already
 * used elsewhere in this codebase (deadline_reminder_log, ingestion_runs):
 * a narrow, additive, CREATE TABLE IF NOT EXISTS log table that the
 * existing route writes one row into per call, success or failure.
 *
 * Deliberately NOT a sentinel_* table — this is a DRAIS academic-domain
 * fact (did a results submission succeed), not Sentinel's internal
 * bookkeeping. Sentinel's observer reads it the same way it reads
 * report_snapshots and ingestion_runs: as evidence it did not create.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export async function ensureResultsSubmissionLogSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS results_submission_log (
          id              BIGINT       NOT NULL AUTO_INCREMENT,
          school_id       INT          NOT NULL,
          route           VARCHAR(32)  NOT NULL,
          status          ENUM('success','failed') NOT NULL,
          class_id        INT          NULL,
          subject_id      INT          NULL,
          result_type_id  INT          NULL,
          term_id         INT          NULL,
          inserted_count  INT          NOT NULL DEFAULT 0,
          ignored_count   INT          NOT NULL DEFAULT 0,
          error_count     INT          NOT NULL DEFAULT 0,
          error_message   TEXT         NULL,
          submitted_by    INT          NULL,
          created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_school_time (school_id, created_at DESC),
          KEY idx_status_time (status, created_at DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `).catch(() => {});
    })();
  }
  return ensured;
}

export interface ResultsSubmissionLogEntry {
  schoolId: number;
  route: 'submit' | 'bulk_submit';
  status: 'success' | 'failed';
  classId?: number | null;
  subjectId?: number | null;
  resultTypeId?: number | null;
  termId?: number | null;
  insertedCount?: number;
  ignoredCount?: number;
  errorCount?: number;
  errorMessage?: string | null;
  submittedBy?: number | null;
}

/**
 * Fire-and-forget by contract: never throws, never affects the caller's
 * response. A logging failure must not be allowed to turn a successful
 * results submission into a failed one, or vice versa.
 */
export async function logResultsSubmission(entry: ResultsSubmissionLogEntry): Promise<void> {
  try {
    await ensureResultsSubmissionLogSchema();
    await query(
      `INSERT INTO results_submission_log
         (school_id, route, status, class_id, subject_id, result_type_id, term_id,
          inserted_count, ignored_count, error_count, error_message, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.schoolId, entry.route, entry.status,
        entry.classId ?? null, entry.subjectId ?? null, entry.resultTypeId ?? null, entry.termId ?? null,
        entry.insertedCount ?? 0, entry.ignoredCount ?? 0, entry.errorCount ?? 0,
        entry.errorMessage ? entry.errorMessage.slice(0, 2000) : null,
        entry.submittedBy ?? null,
      ],
    );
  } catch {
    // Never let logging break the actual submission path.
  }
}
