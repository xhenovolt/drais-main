-- 061 - Delivery-status alerts by SMS (per school).
--
-- A school can name one phone number that DRAIS texts when the provider reports what happened
-- to a message. Providers only report to a webhook URL, never to a phone, so DRAIS turns the
-- report into an SMS itself (src/lib/sms/delivery-alerts.ts).
--
--   comm_settings.delivery_alert_phone   number to text; NULL = off
--   comm_settings.delivery_alert_mode    'failed' (default) | 'all' | 'off'
--   sms_status_alerts                    every alert sent; also enforces the per-hour cap
--
-- Also created on demand by ensureDeliveryAlertSchema().
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS sms_status_alerts;
--   ALTER TABLE comm_settings DROP COLUMN delivery_alert_mode;
--   ALTER TABLE comm_settings DROP COLUMN delivery_alert_phone;

-- Separate statements: TiDB rejects several changes in one ALTER here.
ALTER TABLE comm_settings ADD COLUMN delivery_alert_phone VARCHAR(40) DEFAULT NULL;
ALTER TABLE comm_settings ADD COLUMN delivery_alert_mode VARCHAR(12) NOT NULL DEFAULT 'failed';

CREATE TABLE IF NOT EXISTS sms_status_alerts (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id       BIGINT NOT NULL,
  alert_phone     VARCHAR(40) NOT NULL,
  state           VARCHAR(20) NOT NULL,
  outbox_id       BIGINT DEFAULT NULL,
  dispatch_log_id BIGINT DEFAULT NULL,
  body            VARCHAR(480) NOT NULL,
  success         TINYINT(1) NOT NULL DEFAULT 0,
  error           VARCHAR(255) DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ssa_school_time (school_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
