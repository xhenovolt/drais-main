-- Parent Portal canonical schema (Phase 1)
-- The four tables the existing src/lib/portal/* code depends on. None of these
-- existed in the DB, which is why the portal was non-functional. Idempotent:
-- every table uses CREATE TABLE IF NOT EXISTS. Column set matches exactly what
-- the code reads/writes (audited route-by-route). No cross-table FKs (TiDB
-- tenant tables here avoid them); we rely on indexes + app-level scoping.

-- ---------------------------------------------------------------------------
-- parent_accounts — parent identity. Separate from staff `users` by design.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_accounts (
  id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
  phone          VARCHAR(20)  NOT NULL,                 -- normalized +2567... ; login identity
  full_name      VARCHAR(150) NULL,
  email          VARCHAR(190) NULL,
  password_hash  VARCHAR(255) NOT NULL,
  phone_verified TINYINT(1)   NOT NULL DEFAULT 0,
  status         ENUM('active','suspended') NOT NULL DEFAULT 'active',
  failed_logins  INT          NOT NULL DEFAULT 0,
  locked_until   DATETIME     NULL,
  last_login_at  DATETIME     NULL,
  last_login_ip  VARCHAR(45)  NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parent_phone (phone)
);

-- ---------------------------------------------------------------------------
-- parent_sessions — opaque cookie tokens, own table (no shared path w/ staff).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_sessions (
  id                BIGINT      PRIMARY KEY AUTO_INCREMENT,
  parent_account_id BIGINT      NOT NULL,
  session_token     VARCHAR(96) NOT NULL,               -- 48 random bytes -> 96 hex chars
  active_school_id  BIGINT      NULL,                    -- chosen tenant; NULL until picked
  expires_at        DATETIME    NOT NULL,
  ip_address        VARCHAR(45) NULL,
  user_agent        VARCHAR(512) NULL,
  last_activity_at  DATETIME    NULL,
  is_active         TINYINT(1)  NOT NULL DEFAULT 1,
  created_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parent_session_token (session_token),
  KEY idx_parent_session_account (parent_account_id),
  KEY idx_parent_session_active (is_active, expires_at)
);

-- ---------------------------------------------------------------------------
-- parent_otp_codes — hashed 6-digit codes (verify | reset | link). Raw code
-- only ever lives in the SMS. Throttling/attempt-lock handled in otp.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_otp_codes (
  id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
  phone       VARCHAR(20)  NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  purpose     ENUM('verify','reset','link') NOT NULL,
  attempts    INT          NOT NULL DEFAULT 0,
  expires_at  DATETIME     NOT NULL,
  consumed_at DATETIME     NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_otp_phone_purpose (phone, purpose),
  KEY idx_otp_created (created_at)
);

-- ---------------------------------------------------------------------------
-- parent_student_links — THE access grant. A row here (status='active') is the
-- ONLY thing that lets a parent see a learner. School-scoped. Created pending
-- from phone-match evidence, then staff-approved (auto-approve OFF by default).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_student_links (
  id                BIGINT      PRIMARY KEY AUTO_INCREMENT,
  parent_account_id BIGINT      NOT NULL,
  school_id         BIGINT      NOT NULL,
  student_id        BIGINT      NOT NULL,
  relationship      VARCHAR(50) NULL DEFAULT 'guardian',
  status            ENUM('pending','active','revoked') NOT NULL DEFAULT 'pending',
  verified_via      VARCHAR(50) NULL,                    -- e.g. 'otp_contact_match'
  requested_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at       DATETIME    NULL,
  approved_by       BIGINT      NULL,                    -- staff users.id
  revoked_at        DATETIME    NULL,
  revoked_by        BIGINT      NULL,
  UNIQUE KEY uq_parent_student (parent_account_id, school_id, student_id),
  KEY idx_link_school_status (school_id, status),
  KEY idx_link_student (student_id),
  KEY idx_link_account_active (parent_account_id, school_id, status)
);
