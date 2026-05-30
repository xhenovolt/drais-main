-- ============================================================================
-- Phase 6 — Per-school default locale
--
-- Adds a single optional column to `schools` that names the language a
-- school prefers to operate in by default. Strictly additive — every
-- existing row keeps working because the column is NULL-able and the
-- application reads NULL as "fall back to 'en'".
--
-- Resolution order at login (implemented in /api/auth/me + I18nProvider):
--   1. User-level localStorage override        (highest priority)
--   2. schools.default_locale                  (this column)
--   3. Application default 'en'                (lowest)
--
-- This means a school that sets default_locale='ar' will greet every
-- first-time visitor in Arabic, but any user who has explicitly toggled
-- to English keeps their override on subsequent visits. The user-level
-- localStorage flag is the only way to override per session.
--
-- The dataHash invariant is preserved: this column lives on `schools`,
-- not on any snapshot, and renderer-side locale is already independent
-- of meta.dataHash (proven in
-- src/lib/drce/__tests__/i18n-hash-invariant.test.mjs).
--
-- Rollback:
--   ALTER TABLE schools DROP COLUMN default_locale;
-- ============================================================================

ALTER TABLE schools
  ADD COLUMN default_locale ENUM('en','ar')
    NULL
    COMMENT 'Phase 6 — preferred operating language for first-time visitors. NULL = no preference, app falls back to en.'
    AFTER school_type;

-- No data backfill. Every existing row has default_locale=NULL which is
-- semantically identical to the pre-migration behaviour.
