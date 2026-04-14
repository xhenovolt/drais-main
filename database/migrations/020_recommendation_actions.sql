-- ============================================================
-- Migration 020: Recommendation Actions Tracking
-- Tracks which recommendations the school acts on / dismisses.
-- Powers the adaptive self-learning layer.
-- ============================================================

CREATE TABLE IF NOT EXISTS recommendation_actions (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id     BIGINT NOT NULL,
  rec_type      VARCHAR(50) NOT NULL  COMMENT 'Matches Recommendation.type',
  rec_key       VARCHAR(120) NOT NULL COMMENT 'Stable key for this recommendation class',
  action_taken  ENUM('acted','dismissed','snoozed') NOT NULL DEFAULT 'dismissed',
  user_id       BIGINT DEFAULT NULL,
  meta          JSON DEFAULT NULL     COMMENT 'Optional: entity IDs, notes, etc.',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_school_key   (school_id, rec_key),
  INDEX idx_school_type  (school_id, rec_type),
  INDEX idx_created_at   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Tracks recommendation interactions — drives adaptive suppression';
