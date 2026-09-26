-- Confirmation SMS after a successful SMS top-up.
--
-- notify_phone     the number that paid; kept ONLY until the confirmation is sent (or given up), then cleared.
-- confirm_sent_at  set once the confirmation SMS was accepted by the provider (it is never sent twice).
-- confirm_attempts / confirm_claimed_at   bounded retry + a short claim so two requests never send it together.
-- confirm_error    last provider error, for the operator.
ALTER TABLE sms_topups ADD COLUMN notify_phone VARCHAR(20) DEFAULT NULL;
ALTER TABLE sms_topups ADD COLUMN confirm_sent_at DATETIME DEFAULT NULL;
ALTER TABLE sms_topups ADD COLUMN confirm_attempts TINYINT NOT NULL DEFAULT 0;
ALTER TABLE sms_topups ADD COLUMN confirm_claimed_at DATETIME DEFAULT NULL;
ALTER TABLE sms_topups ADD COLUMN confirm_error VARCHAR(160) DEFAULT NULL;
