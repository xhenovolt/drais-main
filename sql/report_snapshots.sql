-- ============================================================================
-- DRAIS — report_snapshots
-- Index + payload for the snapshot-driven report-cards engine.
-- One row per (school, term, year, type) snapshot. Snapshot JSON lives in
-- the LONGTEXT column to avoid filesystem dependency on serverless hosts.
--
-- The uk_inflight UNIQUE KEY is the single-flight concurrency lock. It is
-- enforced via a STORED generated column `inflight_lock` that is non-NULL
-- only while status='generating'. InnoDB allows multiple NULLs in a UNIQUE
-- index, so terminal-state rows ('ready'/'failed') coexist freely while a
-- second concurrent 'generating' row for the same key fails with
-- ER_DUP_ENTRY (1062).
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_snapshots (
  id                   BIGINT       NOT NULL AUTO_INCREMENT,
  snapshot_id          CHAR(36)     NOT NULL,
  school_id            INT          NOT NULL,
  type                 ENUM('theology','secular','mixed') NOT NULL,
  term_id              INT          NOT NULL,
  year_id              INT          NOT NULL,
  result_type_id       INT          NULL,
  status               ENUM('generating','ready','failed') NOT NULL DEFAULT 'generating',
  snapshot_json        LONGTEXT     NULL,
  data_hash            CHAR(64)     NULL,
  class_count          INT          NOT NULL DEFAULT 0,
  student_count        INT          NOT NULL DEFAULT 0,
  result_count         INT          NOT NULL DEFAULT 0,
  generated_by         INT          NOT NULL,
  generated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at         DATETIME     NULL,
  generation_ms        INT          NULL,
  error_message        TEXT         NULL,
  is_legacy_fallback   TINYINT(1)   NOT NULL DEFAULT 0,
  inflight_lock        VARCHAR(64)
    GENERATED ALWAYS AS (
      CASE WHEN status = 'generating'
           THEN CONCAT_WS('|', school_id, term_id, year_id, type)
           ELSE NULL END
    ) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_snapshot_id (snapshot_id),
  UNIQUE KEY uk_inflight (inflight_lock),
  KEY idx_listing (school_id, type, status, generated_at DESC),
  KEY idx_school_term (school_id, term_id, year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
