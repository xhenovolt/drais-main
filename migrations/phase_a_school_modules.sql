-- ============================================================================
-- Phase A — Institution foundation
--
-- Goals:
--   1. Lock `schools.school_type` to an ENUM so the application can rely on
--      a finite set of institution categories.
--   2. Create `school_modules` — a per-school flag table that gates feature
--      modules (tahfiz, payroll, examinations, etc.) at the API and UI layers.
--   3. Seed every existing school with EVERY module enabled (least-surprise
--      default; admins explicitly opt out). The Phase F wiring later
--      consumes these rows; until then the table exists but does not block
--      anything.
--
-- Backward-compat invariants:
--   * `school_type` rows are normalized to lowercase before the ENUM swap
--     so the 14 'secondary' + 3 'Primary' rows survive without data loss.
--   * Every existing school is auto-seeded for every module — no school
--     suddenly loses access to a feature when this migration applies.
--
-- Rollback:
--   ALTER TABLE schools MODIFY COLUMN school_type VARCHAR(50);
--   DROP TABLE school_modules;
-- ============================================================================

-- 1. Normalize existing school_type values (lowercase) so the ENUM swap
--    is non-lossy.
UPDATE schools
   SET school_type = LOWER(school_type)
 WHERE school_type IS NOT NULL
   AND school_type != LOWER(school_type);

-- 2. Lock school_type to the institution-catalog ENUM. 'secondary' default
--    matches the prior column default.
ALTER TABLE schools
  MODIFY COLUMN school_type
    ENUM('nursery','primary','secondary','combined','tahfiz',
         'college','university','vocational','training','mixed')
    NOT NULL DEFAULT 'secondary';

-- 3. Per-school module flag table. The catalog of module codes is declared
--    here so the constraint enforces it at the DB layer; adding a module
--    later requires an ENUM-extension migration.
CREATE TABLE IF NOT EXISTS school_modules (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  school_id     INT          NOT NULL,
  module_code   ENUM(
                  'academics',
                  'finance',
                  'payroll',
                  'tahfiz',
                  'attendance',
                  'inventory',
                  'examinations',
                  'analytics',
                  'fingerprint_auth',
                  'intelligence',
                  'work_plans'
                ) NOT NULL,
  is_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
  enabled_at    DATETIME     NULL,
  expires_at    DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_school_module (school_id, module_code),
  KEY idx_module_school (module_code, school_id, is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed every existing school with every module enabled.
--    INSERT IGNORE makes the migration idempotent — re-running adds nothing
--    new but does not error.
INSERT IGNORE INTO school_modules (school_id, module_code, is_enabled, enabled_at)
SELECT s.id, m.code, 1, NOW()
  FROM schools s
  CROSS JOIN (
    SELECT 'academics'        AS code UNION ALL
    SELECT 'finance'                  UNION ALL
    SELECT 'payroll'                  UNION ALL
    SELECT 'tahfiz'                   UNION ALL
    SELECT 'attendance'               UNION ALL
    SELECT 'inventory'                UNION ALL
    SELECT 'examinations'             UNION ALL
    SELECT 'analytics'                UNION ALL
    SELECT 'fingerprint_auth'         UNION ALL
    SELECT 'intelligence'             UNION ALL
    SELECT 'work_plans'
  ) m;
