-- ============================================================
-- Migration 020: Enrollment Lifecycle Fix + Observability
-- Fixes all schema mismatches between DB and API code.
-- SAFE: all operations use IF NOT EXISTS / IF EXISTS guards.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. FIX enrollments TABLE — add all columns the API expects
-- ────────────────────────────────────────────────────────────

ALTER TABLE `enrollments`
  -- Multi-tenant isolation (queries use WHERE school_id = ?)
  ADD COLUMN IF NOT EXISTS `school_id`        BIGINT DEFAULT NULL         AFTER `id`,
  -- Study mode FK (required when enrolling via the full enroll endpoint)
  ADD COLUMN IF NOT EXISTS `study_mode_id`    BIGINT DEFAULT NULL         AFTER `stream_id`,
  -- 'new' | 'continuing' | 're-admitted'
  ADD COLUMN IF NOT EXISTS `enrollment_type`  VARCHAR(30) DEFAULT 'new'   AFTER `study_mode_id`,
  -- When the enrollment started
  ADD COLUMN IF NOT EXISTS `enrollment_date`  DATE DEFAULT NULL           AFTER `enrollment_type`,
  -- Precise timestamp for queries
  ADD COLUMN IF NOT EXISTS `enrolled_at`      TIMESTAMP NULL DEFAULT NULL AFTER `enrollment_date`,
  -- When enrollment closed (promotion / transfer / withdrawal)
  ADD COLUMN IF NOT EXISTS `end_date`         DATE DEFAULT NULL           AFTER `enrolled_at`,
  ADD COLUMN IF NOT EXISTS `end_reason`       VARCHAR(100) DEFAULT NULL   AFTER `end_date`,
  -- Auto-updated on any change
  ADD COLUMN IF NOT EXISTS `updated_at`       TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;

-- Fix created_at: if it's still an INT column, add a proper timestamp alias
-- (We add enrolled_at above and keep created_at for backward compat)

-- Backfill school_id from students table where possible
UPDATE `enrollments` e
  JOIN `students` s ON s.id = e.student_id
SET e.school_id = s.school_id
WHERE e.school_id IS NULL AND s.school_id IS NOT NULL;

-- Backfill enrollment_date from created_at if created_at looks like a unix timestamp
UPDATE `enrollments`
SET enrollment_date = FROM_UNIXTIME(`created_at`)
WHERE enrollment_date IS NULL
  AND `created_at` > 1000000000   -- sanity: unix epoch > year 2001
  AND `created_at` < 9999999999;  -- sanity: before year 2286

-- ────────────────────────────────────────────────────────────
-- 2. INDEXES for enrollments
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS `idx_enroll_school_student`   ON `enrollments` (`school_id`, `student_id`);
CREATE INDEX IF NOT EXISTS `idx_enroll_school_class`     ON `enrollments` (`school_id`, `class_id`);
CREATE INDEX IF NOT EXISTS `idx_enroll_status`           ON `enrollments` (`status`);
CREATE INDEX IF NOT EXISTS `idx_enroll_student_status`   ON `enrollments` (`student_id`, `status`);
CREATE INDEX IF NOT EXISTS `idx_enroll_academic_year`    ON `enrollments` (`academic_year_id`);

-- ────────────────────────────────────────────────────────────
-- 3. CREATE audit_logs (plural — expected by src/lib/audit.ts)
--    Keep existing audit_log (singular) for backward compat.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`            BIGINT NOT NULL AUTO_INCREMENT,
  `school_id`     BIGINT DEFAULT NULL,
  `user_id`       BIGINT DEFAULT NULL,
  `action`        VARCHAR(100) NOT NULL,
  `action_type`   VARCHAR(100) DEFAULT NULL,
  `entity_type`   VARCHAR(100) NOT NULL DEFAULT 'system',
  `entity_id`     BIGINT DEFAULT NULL,
  `details`       JSON DEFAULT NULL,
  `changes_json`  LONGTEXT DEFAULT NULL,
  `ip_address`    VARCHAR(64) DEFAULT NULL,
  `user_agent`    VARCHAR(255) DEFAULT NULL,
  `source`        ENUM('WEB','MOBILE','API','JETON','SYSTEM') DEFAULT 'WEB',
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_school`  (`school_id`),
  KEY `idx_audit_user`    (`user_id`),
  KEY `idx_audit_entity`  (`entity_type`, `entity_id`),
  KEY `idx_audit_action`  (`action`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Authoritative audit log (plural) — used by src/lib/audit.ts';

-- ────────────────────────────────────────────────────────────
-- 4. CREATE system_errors — captures all server-side failures
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `system_errors` (
  `id`          BIGINT NOT NULL AUTO_INCREMENT,
  `school_id`   BIGINT DEFAULT NULL,
  `user_id`     BIGINT DEFAULT NULL,
  `endpoint`    VARCHAR(255) DEFAULT NULL,
  `method`      VARCHAR(10) DEFAULT NULL,
  `error_code`  VARCHAR(50) DEFAULT NULL,
  `error_msg`   TEXT DEFAULT NULL,
  `stack_trace` LONGTEXT DEFAULT NULL,
  `request_id`  VARCHAR(64) DEFAULT NULL,
  `ip_address`  VARCHAR(64) DEFAULT NULL,
  `metadata`    JSON DEFAULT NULL,
  `resolved`    TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_syserr_school`    (`school_id`),
  KEY `idx_syserr_endpoint`  (`endpoint`),
  KEY `idx_syserr_resolved`  (`resolved`),
  KEY `idx_syserr_created`   (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Server-side error log — shown in admin observability dashboard';

-- ────────────────────────────────────────────────────────────
-- 5. CREATE migration_runs — tracks which migrations were applied
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `migration_runs` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `filename`   VARCHAR(200) NOT NULL,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_migration_filename` (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `migration_runs` (`filename`) VALUES ('020_enrollment_lifecycle_fix.sql');

-- ────────────────────────────────────────────────────────────
-- 6. CREATE enrollment_history — full audit trail of class moves
--    Used by /api/students/reassign-class
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `enrollment_history` (
  `id`            BIGINT NOT NULL AUTO_INCREMENT,
  `school_id`     BIGINT NOT NULL,
  `enrollment_id` BIGINT DEFAULT NULL,
  `student_id`    BIGINT NOT NULL,
  `old_class_id`  BIGINT DEFAULT NULL,
  `new_class_id`  BIGINT NOT NULL,
  `old_stream_id` BIGINT DEFAULT NULL,
  `new_stream_id` BIGINT DEFAULT NULL,
  `changed_by`    BIGINT DEFAULT NULL   COMMENT 'users.id',
  `reason`        VARCHAR(255) DEFAULT NULL,
  `metadata`      JSON DEFAULT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eh_school`   (`school_id`),
  KEY `idx_eh_student`  (`student_id`),
  KEY `idx_eh_enroll`   (`enrollment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  COMMENT='Full history of every class reassignment';

-- ────────────────────────────────────────────────────────────
-- 7. Apply the migration on load (idempotent run marker)
-- ────────────────────────────────────────────────────────────

INSERT IGNORE INTO `migration_runs` (`filename`) VALUES ('020_enrollment_history_table');
