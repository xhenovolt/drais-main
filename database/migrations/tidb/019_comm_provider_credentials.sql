-- 019_comm_provider_credentials.sql
-- Per-school SMS provider credentials. Previously the Africa's Talking
-- username/API key existed ONLY as env vars, so "configuring SMS in
-- settings" never stored the real credentials and sends failed with
-- "SMS service not configured" on any host without the env vars. These
-- columns let each school store its own provider credentials.
--
-- NOTE: api key is stored as-is (plaintext) to match existing settings
-- patterns; treat the DB as sensitive. Encrypting at rest is a follow-up.

ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS provider_username VARCHAR(128) NULL
    COMMENT 'SMS provider username (Africa''s Talking). NULL = use env fallback';
ALTER TABLE comm_settings
  ADD COLUMN IF NOT EXISTS provider_api_key VARCHAR(255) NULL
    COMMENT 'SMS provider API key. NULL = use env fallback';
-- Sender ID is the EXISTING comm_settings.sender_name (optional, alphanumeric,
-- must be pre-registered with the provider). Left blank → provider default
-- sender is used (required for accounts without a registered sender ID).
