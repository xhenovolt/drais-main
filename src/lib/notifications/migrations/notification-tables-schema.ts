/**
 * Phase 5 — runtime schema-ensure for the notification tables.
 *
 * Mirrors the Phase 1/2/3/4 helpers.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureNotificationSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS notification_policies (
           id              BIGINT PRIMARY KEY AUTO_INCREMENT,
           school_id       BIGINT NOT NULL,
           name            VARCHAR(120) NOT NULL,
           event_type      VARCHAR(60) NOT NULL,
           target_role     ENUM('guardian','self','staff_room','admin') NOT NULL DEFAULT 'guardian',
           channel         ENUM('sms','email','push') NOT NULL DEFAULT 'sms',
           conditions      JSON DEFAULT NULL,
           template_body   VARCHAR(480) DEFAULT NULL,
           is_active       BOOLEAN NOT NULL DEFAULT TRUE,
           daily_cap       INT NOT NULL DEFAULT 5000,
           created_by      BIGINT DEFAULT NULL,
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           KEY idx_school_event (school_id, event_type, is_active)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      await query(
        `CREATE TABLE IF NOT EXISTS notification_outbox (
           id              BIGINT PRIMARY KEY AUTO_INCREMENT,
           policy_id       BIGINT NOT NULL,
           school_id       BIGINT NOT NULL,
           subject_person_id BIGINT DEFAULT NULL,
           recipient_phone VARCHAR(30) DEFAULT NULL,
           recipient_email VARCHAR(150) DEFAULT NULL,
           recipient_name  VARCHAR(120) DEFAULT NULL,
           channel         ENUM('sms','email','push') NOT NULL,
           body            VARCHAR(480) NOT NULL,
           status          ENUM('queued','sending','delivered','failed','expired') NOT NULL DEFAULT 'queued',
           attempts        INT NOT NULL DEFAULT 0,
           max_attempts    INT NOT NULL DEFAULT 3,
           last_error      VARCHAR(255) DEFAULT NULL,
           dedup_key       VARCHAR(120) DEFAULT NULL,
           scheduled_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           attempted_at    TIMESTAMP NULL,
           delivered_at    TIMESTAMP NULL,
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           UNIQUE KEY uk_dedup (dedup_key),
           KEY idx_status_sched (status, scheduled_at),
           KEY idx_school_status (school_id, status, created_at),
           KEY idx_policy (policy_id)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      await query(
        `CREATE TABLE IF NOT EXISTS notification_deliveries (
           id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
           outbox_id          BIGINT NOT NULL,
           school_id          BIGINT NOT NULL,
           provider           VARCHAR(40) NOT NULL,
           provider_message_id VARCHAR(120) DEFAULT NULL,
           cost               VARCHAR(20) DEFAULT NULL,
           success            BOOLEAN NOT NULL,
           error              VARCHAR(255) DEFAULT NULL,
           delivered_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           KEY idx_outbox (outbox_id),
           KEY idx_school_day (school_id, delivered_at)
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
