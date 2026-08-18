-- 045_whatsapp_channel.sql
-- Adds a WhatsApp channel to the comm engine. comm_settings.channel on
-- comm_dispatch_log/comm_rules/comm_templates already includes 'whatsapp'
-- (they were built channel-generic from the start) — this migration only
-- adds the two things that were actually missing:
--
--   1. comm_settings gets its own WhatsApp slot, mirroring the SMS
--      platform-account-with-per-school-override pattern from
--      019_comm_provider_credentials.sql: a platform Infobip account via
--      env vars (INFOBIP_WHATSAPP_API_BASE_URL / INFOBIP_WHATSAPP_API_KEY)
--      is the default, with an optional per-school override stored here
--      (plaintext, same documented trade-off as provider_api_key above —
--      treat the DB as sensitive; encrypting at rest is a follow-up, not
--      introduced here).
--   2. comm_dispatch_log.status is a hard MySQL ENUM('queued','sent',
--      'failed','skipped') with no 'delivered'/'read' — fine for SMS
--      (a provider either accepts or rejects a send), but WhatsApp's
--      delivery-status webhook reports intermediate states a message
--      passes through after being accepted. Widened, not replaced — the
--      4 existing values keep their exact meaning for every existing
--      channel.

ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE
    COMMENT 'Per-school WhatsApp channel kill-switch, same role as sms_enabled';
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS whatsapp_provider VARCHAR(64) NOT NULL DEFAULT 'infobip_whatsapp'
    COMMENT 'Registered CommProvider name for the whatsapp channel — see src/lib/comm/providers.ts';
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS whatsapp_sender VARCHAR(64) NULL
    COMMENT 'WhatsApp Business sender/number, where the provider requires one';
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS whatsapp_provider_base_url VARCHAR(255) NULL
    COMMENT 'Per-school WhatsApp provider API base URL override. NULL = use env fallback (INFOBIP_WHATSAPP_API_BASE_URL)';
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS whatsapp_provider_api_key VARCHAR(255) NULL
    COMMENT 'Per-school WhatsApp provider API key override. NULL = use env fallback (INFOBIP_WHATSAPP_API_KEY)';

ALTER TABLE comm_dispatch_log
  MODIFY COLUMN status ENUM('queued','sent','failed','skipped','delivered','read') NOT NULL DEFAULT 'queued'
    COMMENT 'delivered/read are WhatsApp-only states reached via the provider delivery-status webhook, never written by the dispatcher itself';
