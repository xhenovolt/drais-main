-- 055 - Per-school SMS provider routing (set from the Control Center).
--
-- One row per school that has an explicit route. No row (or mode 'inherit') = today's behaviour,
-- so nothing changes for any school until the platform operator assigns a route.
--   inherit  : legacy behaviour (unchanged)
--   central  : use a specific central provider (sms_provider_configs.id) - e.g. Yoola, UgaText, Africa's Talking
--   own      : use the school's own comm_settings credentials, ignoring the platform's active provider
--   same_as  : use whatever school source_school_id uses (no secret is copied; changes to that school's
--              account follow automatically)
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS school_sms_routes;

CREATE TABLE IF NOT EXISTS school_sms_routes (
  school_id           BIGINT NOT NULL PRIMARY KEY,
  mode                VARCHAR(12) NOT NULL DEFAULT 'inherit',
  central_provider_id BIGINT DEFAULT NULL,
  source_school_id    BIGINT DEFAULT NULL,
  note                VARCHAR(255) DEFAULT NULL,
  updated_by          BIGINT DEFAULT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_route_source (source_school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
