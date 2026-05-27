-- DRAIS Global Command Search — projection index.
-- ONE denormalized, pre-computed table instead of joining N source tables per
-- keystroke. Each row is one searchable entity, tenant-scoped, RBAC-tagged by
-- entity_type. Query path is a single indexed scan + weighted ranking — works
-- on TiDB without depending on FULLTEXT (which TiDB doesn't support here).

CREATE TABLE IF NOT EXISTS search_index (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id     BIGINT       NOT NULL,
  entity_type   VARCHAR(32)  NOT NULL,    -- student | staff | class | subject | invoice | payment | sms | ...
  entity_id     BIGINT       NOT NULL,
  title         VARCHAR(255) NOT NULL,    -- primary display line
  subtitle      VARCHAR(255) NULL,        -- secondary line (adm no, class, status…)
  search_text   TEXT         NOT NULL,    -- lowercased haystack: title + all keywords/aliases
  rank_weight   INT          NOT NULL DEFAULT 100,  -- entity-type base weight for ranking
  url_path      VARCHAR(255) NULL,        -- where a click navigates
  metadata      JSON         NULL,        -- quick-action payload (class_id, balance, phone…)
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_search_entity (school_id, entity_type, entity_id),
  KEY ix_search_school_type (school_id, entity_type),
  KEY ix_search_school_updated (school_id, updated_at),
  KEY ix_search_title (school_id, title)
);
