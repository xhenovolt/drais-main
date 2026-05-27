-- DRAIS Parent Portal — identity + isolation foundation
-- Additive. Parents are GLOBAL identities (one human spans schools); access is
-- strictly per-(school, learner) via parent_student_links. Nothing here touches
-- the existing contact/guardian tables — those become *evidence* for a link
-- request, never the grant itself.

-- ---------------------------------------------------------------------------
-- Identity: above the school boundary, keyed on a verified phone.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_accounts (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone           VARCHAR(20)  NOT NULL UNIQUE,         -- E.164, the identity anchor
  full_name       VARCHAR(150) NULL,
  email           VARCHAR(150) NULL,
  password_hash   VARCHAR(255) NOT NULL,                -- bcrypt; required (phone+password auth)
  phone_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
  status          ENUM('active','suspended') NOT NULL DEFAULT 'active',
  failed_logins   INT          NOT NULL DEFAULT 0,
  locked_until    DATETIME     NULL,
  last_login_at   DATETIME     NULL,
  last_login_ip   VARCHAR(64)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_parent_accounts_status (status)
);

-- ---------------------------------------------------------------------------
-- Authorization: THE source of truth for "which learners can this parent see".
-- Only status='active' rows grant access. Consulted on every portal request.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_student_links (
  id                 BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parent_account_id  BIGINT      NOT NULL,
  school_id          BIGINT      NOT NULL,
  student_id         BIGINT      NOT NULL,
  relationship       VARCHAR(40) NOT NULL DEFAULT 'guardian',
  status             ENUM('pending','active','revoked') NOT NULL DEFAULT 'pending',
  verified_via       ENUM('admin','otp_contact_match','import') NULL,
  requested_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by        BIGINT      NULL,                  -- staff users.id (admin/approval path)
  approved_at        DATETIME    NULL,
  revoked_at         DATETIME    NULL,
  revoked_by         BIGINT      NULL,
  UNIQUE KEY uq_parent_school_student (parent_account_id, school_id, student_id),
  KEY ix_psl_parent_status (parent_account_id, status),
  KEY ix_psl_school_student (school_id, student_id),
  KEY ix_psl_school_status (school_id, status)
);

-- ---------------------------------------------------------------------------
-- OTP codes: phone verification at signup + password reset + link claim.
-- Codes are stored hashed; raw code only ever exists in the SMS.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_otp_codes (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone        VARCHAR(20)  NOT NULL,
  code_hash    VARCHAR(255) NOT NULL,
  purpose      ENUM('verify','reset','link') NOT NULL,
  expires_at   DATETIME     NOT NULL,
  consumed_at  DATETIME     NULL,
  attempts     TINYINT      NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_parent_otp_phone_purpose (phone, purpose),
  KEY ix_parent_otp_expires (expires_at)
);

-- ---------------------------------------------------------------------------
-- Sessions: a SEPARATE namespace from staff `sessions`. A parent token can
-- never satisfy getSessionSchoolId() and vice-versa — no privilege confusion.
-- active_school_id is the single active tenant context for this session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_sessions (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parent_account_id BIGINT       NOT NULL,
  session_token     VARCHAR(128) NOT NULL UNIQUE,
  active_school_id  BIGINT       NULL,                  -- chosen via school picker
  expires_at        DATETIME     NOT NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  ip_address        VARCHAR(64)  NULL,
  user_agent        VARCHAR(512) NULL,
  last_activity_at  DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_parent_sessions_account (parent_account_id),
  KEY ix_parent_sessions_active (is_active, expires_at)
);

-- ---------------------------------------------------------------------------
-- Per-school setting: whether an OTP-contact-matched link auto-activates or
-- waits for staff approval. Default FALSE = staff approval required.
-- Stored in the existing school_settings key/value table.
-- ---------------------------------------------------------------------------
INSERT INTO school_settings (school_id, key_name, value_text)
SELECT s.id, 'parent_link_auto_approve', 'false'
  FROM schools s
 WHERE NOT EXISTS (
   SELECT 1 FROM school_settings ss
    WHERE ss.school_id = s.id AND ss.key_name = 'parent_link_auto_approve'
 );
