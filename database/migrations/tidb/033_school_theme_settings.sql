-- Per-school branding (Phase 3 of the design-system roadmap). One row per
-- school; absence = the default DRAIS theme. Colours are hex strings applied
-- to the design tokens (--primary/--secondary/--accent) at runtime as the
-- baseline; a user's personal appearance choice still overrides for them.
CREATE TABLE IF NOT EXISTS school_theme_settings (
  school_id        BIGINT       NOT NULL,
  primary_color    VARCHAR(9)   NULL,           -- #RRGGBB(AA); NULL = DRAIS default
  secondary_color  VARCHAR(9)   NULL,
  accent_color     VARCHAR(9)   NULL,
  logo_url         VARCHAR(512) NULL,           -- overrides schools.logo_url for UI chrome
  glass_enabled    TINYINT      NOT NULL DEFAULT 1,
  border_radius    VARCHAR(8)   NOT NULL DEFAULT 'lg',     -- none|sm|md|lg|full
  button_style     VARCHAR(16)  NOT NULL DEFAULT 'solid',  -- solid|gradient|outline
  card_style       VARCHAR(16)  NOT NULL DEFAULT 'elevated',-- elevated|flat|glass
  sidebar_style    VARCHAR(16)  NOT NULL DEFAULT 'solid',  -- solid|glass
  report_branding  VARCHAR(16)  NOT NULL DEFAULT 'logo',   -- logo|name|both
  receipt_branding VARCHAR(16)  NOT NULL DEFAULT 'logo',
  updated_by       BIGINT       NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (school_id)
);
