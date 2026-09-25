-- 053 - SMS usage ledger.
--
-- The "SMS left" figure was derived from audit_logs rows with action='SMS_SENT', which ONLY the
-- single-message composer wrote. Attendance SMS (outbox drain), event dispatches and bulk
-- broadcasts never recorded usage, so a school given 6000 SMS still saw 6000 after sending.
-- Every send path now appends one row here; remaining = allocation - usage since the allocation was set.
--
-- sms_allocations already exists in production (created lazily by sms-economics.ts); declared here
-- so a fresh database has it too.
--
-- Historical sends are backfilled (INSERT IGNORE on a unique source+ref, so re-running is harmless).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS sms_usage_events;

CREATE TABLE IF NOT EXISTS sms_allocations (
  school_id   INT PRIMARY KEY,
  quota_sms   INT NOT NULL DEFAULT 0,
  note        VARCHAR(255) NULL,
  updated_by  BIGINT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sms_usage_events (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id  BIGINT NOT NULL,
  source     VARCHAR(24) NOT NULL,
  ref        VARCHAR(64) DEFAULT NULL,
  segments   INT NOT NULL DEFAULT 1,
  success    TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usage_ref (source, ref),
  KEY idx_usage_school (school_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO sms_usage_events (school_id, source, ref, segments, success, created_at)
SELECT d.school_id, 'attendance', CONCAT('nd:', d.id), GREATEST(1, CEIL(CHAR_LENGTH(o.body) / 160)), 1, COALESCE(d.delivered_at, NOW())
  FROM notification_deliveries d
  JOIN notification_outbox o ON o.id = d.outbox_id
 WHERE d.success = 1;

INSERT IGNORE INTO sms_usage_events (school_id, source, ref, segments, success, created_at)
SELECT school_id, 'dispatch', CONCAT('dl:', id), GREATEST(1, CEIL(CHAR_LENGTH(COALESCE(message_body, '')) / 160)), 1, COALESCE(sent_at, created_at)
  FROM comm_dispatch_log
 WHERE channel = 'sms' AND status = 'sent';

INSERT IGNORE INTO sms_usage_events (school_id, source, ref, segments, success, created_at)
SELECT school_id, 'single', CONCAT('al:', id), GREATEST(1, CAST(JSON_UNQUOTE(JSON_EXTRACT(details, '$.segments')) AS UNSIGNED)), 1, created_at
  FROM audit_logs
 WHERE action = 'SMS_SENT' AND JSON_EXTRACT(details, '$.success') = true;
