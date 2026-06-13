-- 009 — Phase 3 device directory + reconciliation model.
--
-- Adds the run/item audit tables for device-vs-DRAIS reconciliation,
-- and extends device_user_directory with the sync-run linkage and
-- triage state the Phase 3 UI needs. All additive / idempotent.

-- ── device_user_directory: sync-run linkage + triage ────────────────
ALTER TABLE device_user_directory ADD COLUMN IF NOT EXISTS card_number VARCHAR(64) DEFAULT NULL;
ALTER TABLE device_user_directory ADD COLUMN IF NOT EXISTS last_sync_run_id BIGINT DEFAULT NULL;
ALTER TABLE device_user_directory ADD COLUMN IF NOT EXISTS has_recent_echo TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE device_user_directory ADD COLUMN IF NOT EXISTS directory_status VARCHAR(24) NOT NULL DEFAULT 'active';
ALTER TABLE device_user_directory ADD INDEX IF NOT EXISTS idx_dud_run (last_sync_run_id);

-- ── device_reconciliation_runs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_reconciliation_runs (
  id                   BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id            BIGINT NOT NULL,
  device_sn            VARCHAR(100) NOT NULL,
  started_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at         DATETIME DEFAULT NULL,
  status               ENUM('running','completed','failed','partial') NOT NULL DEFAULT 'running',
  trigger_source       VARCHAR(40) DEFAULT NULL,
  requested_by         BIGINT DEFAULT NULL,
  device_user_count    INT NOT NULL DEFAULT 0,
  drais_expected_count INT NOT NULL DEFAULT 0,
  mapped_count         INT NOT NULL DEFAULT 0,
  mismatch_count       INT NOT NULL DEFAULT 0,
  directory_is_partial TINYINT(1) NOT NULL DEFAULT 1,
  error_message        TEXT DEFAULT NULL,
  KEY idx_recon_device (device_sn, started_at),
  KEY idx_recon_school (school_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── device_reconciliation_items ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_reconciliation_items (
  id                    BIGINT PRIMARY KEY AUTO_INCREMENT,
  run_id                BIGINT NOT NULL,
  school_id             BIGINT NOT NULL,
  device_sn             VARCHAR(100) NOT NULL,
  device_user_pin       VARCHAR(100) DEFAULT NULL,
  device_name           VARCHAR(255) DEFAULT NULL,
  matched_person_id     BIGINT DEFAULT NULL,
  matched_role_type     ENUM('student','staff') DEFAULT NULL,
  matched_role_ref_id   BIGINT DEFAULT NULL,
  canonical_enrollment_id BIGINT DEFAULT NULL,
  mismatch_type         VARCHAR(40) NOT NULL,
  confidence            DECIMAL(4,3) DEFAULT NULL,
  candidates_json       TEXT DEFAULT NULL,
  action_status         ENUM('open','resolved','ignored','quarantined') NOT NULL DEFAULT 'open',
  action_taken          VARCHAR(40) DEFAULT NULL,
  resolved_by           BIGINT DEFAULT NULL,
  resolved_at           DATETIME DEFAULT NULL,
  notes                 VARCHAR(255) DEFAULT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_item_run (run_id),
  KEY idx_item_device_type (device_sn, mismatch_type, action_status),
  KEY idx_item_school (school_id, action_status),
  KEY idx_item_pin (device_sn, device_user_pin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── device_directory_audit — append-only action trail ───────────────
CREATE TABLE IF NOT EXISTS device_directory_audit (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id       BIGINT NOT NULL,
  device_sn       VARCHAR(100) NOT NULL,
  device_user_pin VARCHAR(100) DEFAULT NULL,
  action          VARCHAR(48) NOT NULL,
  actor_user_id   BIGINT DEFAULT NULL,
  detail_json     TEXT DEFAULT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_dda_device (device_sn, created_at),
  KEY idx_dda_school (school_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
