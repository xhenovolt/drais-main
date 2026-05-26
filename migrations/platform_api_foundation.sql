-- DRAIS Platform API Foundation
-- Tables that back /api/platform/v1/*: API keys, audit, events, webhooks, idempotency.
-- All additive; legacy /api/internal/* and /api/control remain functional until cut-over.

CREATE TABLE IF NOT EXISTS platform_api_keys (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  key_id          VARCHAR(64)  NOT NULL UNIQUE,           -- public id, e.g. pk_live_a3f9...
  secret_hash     VARCHAR(255) NOT NULL,                  -- bcrypt of the secret half
  consumer        VARCHAR(64)  NOT NULL,                  -- jeton, xhaira, consty, jorc, xheton, internal_ops
  label           VARCHAR(255) NULL,
  scopes          JSON         NOT NULL,                  -- ["schools:read","schools:write",...]
  allowed_ips     JSON         NULL,                      -- null = any
  rate_limit_per_min INT       NOT NULL DEFAULT 600,
  expires_at      DATETIME     NULL,
  revoked_at      DATETIME     NULL,
  revoked_by      BIGINT       NULL,
  last_used_at    DATETIME     NULL,
  last_used_ip    VARCHAR(64)  NULL,
  created_by      BIGINT       NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_platform_api_keys_consumer (consumer),
  KEY ix_platform_api_keys_active (revoked_at, expires_at)
);

CREATE TABLE IF NOT EXISTS platform_api_audit (
  id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id       VARCHAR(64)  NOT NULL,
  key_id           VARCHAR(64)  NULL,
  consumer         VARCHAR(64)  NULL,
  method           VARCHAR(8)   NOT NULL,
  path             VARCHAR(512) NOT NULL,
  status_code      INT          NOT NULL,
  ip               VARCHAR(64)  NULL,
  user_agent       VARCHAR(512) NULL,
  idempotency_key  VARCHAR(128) NULL,
  payload_bytes    INT          NULL,
  response_ms      INT          NULL,
  error_code       VARCHAR(64)  NULL,
  school_id        BIGINT       NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_platform_audit_key_time (key_id, created_at),
  KEY ix_platform_audit_path_time (path(191), created_at),
  KEY ix_platform_audit_req (request_id)
);

CREATE TABLE IF NOT EXISTS platform_events (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_type  VARCHAR(128) NOT NULL,
  school_id   BIGINT       NULL,
  payload     JSON         NOT NULL,
  emitted_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_platform_events_type_time (event_type, emitted_at),
  KEY ix_platform_events_school_time (school_id, emitted_at)
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  consumer          VARCHAR(64)  NOT NULL,
  url               VARCHAR(1024) NOT NULL,
  secret            VARCHAR(255) NOT NULL,                -- HMAC signing secret (raw, server-side only)
  event_types       JSON         NOT NULL,                -- ["school.created","subscription.expired"] or ["*"]
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  last_delivery_at  DATETIME     NULL,
  last_status       VARCHAR(32)  NULL,
  created_by_key    VARCHAR(64)  NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_webhook_sub_consumer (consumer),
  KEY ix_webhook_sub_active (is_active)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscription_id  BIGINT       NOT NULL,
  event_id         BIGINT       NOT NULL,
  event_type       VARCHAR(128) NOT NULL,
  payload          JSON         NOT NULL,
  attempt          INT          NOT NULL DEFAULT 0,
  max_attempts     INT          NOT NULL DEFAULT 6,
  status           VARCHAR(16)  NOT NULL DEFAULT 'pending', -- pending|delivered|failed|dead
  response_code    INT          NULL,
  response_ms      INT          NULL,
  response_body    TEXT         NULL,
  next_retry_at    DATETIME     NULL,
  delivered_at     DATETIME     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_webhook_del_status_retry (status, next_retry_at),
  KEY ix_webhook_del_sub (subscription_id),
  KEY ix_webhook_del_event (event_id)
);

CREATE TABLE IF NOT EXISTS platform_idempotency_keys (
  key_id            VARCHAR(64)  NOT NULL,
  idempotency_key   VARCHAR(128) NOT NULL,
  request_hash      CHAR(64)     NOT NULL,
  response_status   INT          NOT NULL,
  response_body     MEDIUMTEXT   NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (key_id, idempotency_key),
  KEY ix_platform_idem_created (created_at)
);

CREATE TABLE IF NOT EXISTS platform_rate_limits (
  bucket_key   VARCHAR(128) NOT NULL,                     -- key_id|window_minute
  window_start DATETIME     NOT NULL,
  count        INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key),
  KEY ix_platform_rl_window (window_start)
);
