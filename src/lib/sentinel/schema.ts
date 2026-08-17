/**
 * DRAIS Sentinel — storage (v1).
 *
 * Follows the exact idempotent runtime-ensure convention already used
 * throughout DRAIS (notification-tables-schema.ts, health-history.ts,
 * job-runner.ts, control/auth.ts): CREATE TABLE IF NOT EXISTS, promise-gated,
 * applied lazily on first real use. No new migration tool, no manual DDL step —
 * Sentinel bootstraps itself in production the same way every other subsystem
 * in this codebase does.
 *
 * FIVE tables, each earning its place with a distinct access/retention pattern
 * (deliberately not the full menu the spec sketched — no separate
 * "suppressions" table; suppression is a status + reason column on the
 * incident, because a suppressed incident is still the same incident):
 *
 *   sentinel_incidents     — the incident model. Low volume, long retention.
 *   sentinel_observations  — lightweight per-request signal taps. High
 *                            volume, short retention (see retention.ts).
 *   sentinel_heartbeats    — ONE row per named heartbeat source, updated in
 *                            place (not a log). This is how "job started /
 *                            job completed / Sentinel itself is alive" gets
 *                            answered without a growing table.
 *   sentinel_alerts        — delivery log for the INDEPENDENT critical-alert
 *                            path. Deliberately separate from
 *                            notification_outbox (see alert.ts) so a broken
 *                            school-notification queue can never silently
 *                            swallow an operator page.
 *   sentinel_diagnostics   — persisted Full System Diagnosis reports.
 *                            Low volume, long retention (these are the
 *                            historical record the founder reads later).
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureSentinelSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS sentinel_incidents (
           id                    BIGINT PRIMARY KEY AUTO_INCREMENT,
           dedup_key             VARCHAR(190) NOT NULL,
           kind                  VARCHAR(60)  NOT NULL,
           observer              VARCHAR(40)  NOT NULL,
           scope                 ENUM('global','school') NOT NULL DEFAULT 'school',
           school_id             BIGINT DEFAULT NULL,
           module                VARCHAR(120) NOT NULL,
           severity              ENUM('info','low','medium','high','critical') NOT NULL,
           confidence            TINYINT UNSIGNED NOT NULL DEFAULT 50,
           status                ENUM('open','acknowledged','resolved','suppressed') NOT NULL DEFAULT 'open',
           first_detected_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           last_detected_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           occurrence_count      INT NOT NULL DEFAULT 1,
           probable_cause        VARCHAR(400) DEFAULT NULL,
           user_impact           VARCHAR(400) DEFAULT NULL,
           technical_impact      VARCHAR(400) DEFAULT NULL,
           evidence              JSON DEFAULT NULL,
           recommended_action    VARCHAR(400) DEFAULT NULL,
           auto_remediation_safe BOOLEAN NOT NULL DEFAULT FALSE,
           notify_required       BOOLEAN NOT NULL DEFAULT FALSE,
           notified_at           TIMESTAMP NULL DEFAULT NULL,
           acknowledged_by       BIGINT DEFAULT NULL,
           acknowledged_at       TIMESTAMP NULL DEFAULT NULL,
           resolved_by           BIGINT DEFAULT NULL,
           resolved_at           TIMESTAMP NULL DEFAULT NULL,
           suppressed_reason     VARCHAR(300) DEFAULT NULL,
           created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           UNIQUE KEY uk_dedup (dedup_key),
           KEY idx_status_sev (status, severity, last_detected_at),
           KEY idx_school_status (school_id, status),
           KEY idx_kind (kind)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      // Short-retention, high-volume request taps. No payload bodies, no PII —
      // counts, status codes, durations, and a correlation id only.
      await query(
        `CREATE TABLE IF NOT EXISTS sentinel_observations (
           id             BIGINT PRIMARY KEY AUTO_INCREMENT,
           school_id      BIGINT DEFAULT NULL,
           module         VARCHAR(120) NOT NULL,
           status_code    SMALLINT DEFAULT NULL,
           duration_ms    INT DEFAULT NULL,
           error_class    VARCHAR(80) DEFAULT NULL,
           signal         JSON DEFAULT NULL,
           correlation_id VARCHAR(64) DEFAULT NULL,
           created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           KEY idx_module_time (module, created_at),
           KEY idx_school_time (school_id, created_at)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      // One row per heartbeat source, upserted in place — not a log.
      await query(
        `CREATE TABLE IF NOT EXISTS sentinel_heartbeats (
           name                      VARCHAR(80) PRIMARY KEY,
           last_started_at           TIMESTAMP NULL DEFAULT NULL,
           last_success_at           TIMESTAMP NULL DEFAULT NULL,
           last_failure_at           TIMESTAMP NULL DEFAULT NULL,
           last_error                VARCHAR(300) DEFAULT NULL,
           consecutive_failures      INT NOT NULL DEFAULT 0,
           expected_interval_seconds INT DEFAULT NULL,
           updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      // Independent critical-alert delivery log — deliberately NOT
      // notification_outbox. See alert.ts for why.
      await query(
        `CREATE TABLE IF NOT EXISTS sentinel_alerts (
           id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
           incident_id         BIGINT DEFAULT NULL,
           channel             VARCHAR(20) NOT NULL DEFAULT 'sms',
           destination         VARCHAR(40) DEFAULT NULL,
           message             VARCHAR(400) NOT NULL,
           status              ENUM('sent','failed','retrying') NOT NULL DEFAULT 'retrying',
           provider_message_id VARCHAR(120) DEFAULT NULL,
           error               VARCHAR(300) DEFAULT NULL,
           attempts            INT NOT NULL DEFAULT 0,
           attempted_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           delivered_at        TIMESTAMP NULL DEFAULT NULL,
           KEY idx_incident (incident_id),
           KEY idx_status_time (status, attempted_at)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      // Persisted Full System Diagnosis reports — the historical record.
      await query(
        `CREATE TABLE IF NOT EXISTS sentinel_diagnostics (
           id                BIGINT PRIMARY KEY AUTO_INCREMENT,
           triggered_by      BIGINT DEFAULT NULL,
           trigger_source    VARCHAR(20) NOT NULL DEFAULT 'manual',
           overall_score     TINYINT UNSIGNED DEFAULT NULL,
           readiness         VARCHAR(30) DEFAULT NULL,
           commit_sha        VARCHAR(40) DEFAULT NULL,
           sentinel_version  VARCHAR(20) NOT NULL,
           engine_version    VARCHAR(20) NOT NULL,
           report            JSON NOT NULL,
           created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           KEY idx_created (created_at)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );
    } catch (err) {
      ensured = null;
      throw err;
    }
  })();
  return ensured;
}
