-- ============================================================================
-- RBAC overhaul — add module/resource/action columns to permissions
--
-- These columns power the permission-tree UI (group by module → resource →
-- action) and let the sync engine validate code structure. All three are
-- nullable so existing rows survive; the sync engine backfills them.
--
-- Rollback:
--   ALTER TABLE permissions DROP COLUMN action, DROP COLUMN resource, DROP COLUMN module;
-- ============================================================================

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS module   VARCHAR(40) NULL AFTER code,
  ADD COLUMN IF NOT EXISTS resource VARCHAR(40) NULL AFTER module,
  ADD COLUMN IF NOT EXISTS action   VARCHAR(40) NULL AFTER resource;

CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module, resource, action);
