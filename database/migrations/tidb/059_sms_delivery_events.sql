-- 059 - SMS delivery events: what the provider reported after accepting a message.
--
-- One row per (provider message, state): sent (on the mobile network), delivered (reached the
-- phone) or failed (rejected / undeliverable). Written only by the signature-verified delivery
-- webhooks (/api/comm/webhooks/*). Feeds the SMS Outbox timeline and the real-time delivery
-- toasts; the live-scan stream tails it by (school_id, id).
--
-- Also created on demand by ensureDeliveryEventsTable() in src/lib/sms/delivery-events.ts.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS sms_delivery_events;

CREATE TABLE IF NOT EXISTS sms_delivery_events (
  id                  BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id           BIGINT DEFAULT NULL,
  provider            VARCHAR(40) DEFAULT NULL,
  provider_message_id VARCHAR(120) NOT NULL,
  state               VARCHAR(20) NOT NULL,
  provider_status     VARCHAR(60) DEFAULT NULL,
  reason              VARCHAR(255) DEFAULT NULL,
  network             VARCHAR(60) DEFAULT NULL,
  recipient_phone     VARCHAR(40) DEFAULT NULL,
  recipient_name      VARCHAR(150) DEFAULT NULL,
  learner_name        VARCHAR(150) DEFAULT NULL,
  outbox_id           BIGINT DEFAULT NULL,
  dispatch_log_id     BIGINT DEFAULT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sde_message_state (provider_message_id, state),
  KEY idx_sde_school (school_id, id),
  KEY idx_sde_outbox (outbox_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
