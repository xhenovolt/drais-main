-- ============================================
-- DRAIS V1 — Subscription & Free Trial System
-- Migration: 017_subscription_system.sql
-- Date: 2026-03-16
-- ============================================
-- Adds full subscription management to the schools table:
--   subscription_type, trial_start_date, trial_end_date,
--   subscription_start_date, subscription_end_date
-- Updates subscription_status ENUM to include 'expired'
-- Activates Albayan Quran Memorization Centre for 1 year
-- Creates test schools for all subscription states
-- ============================================

-- ============================================
-- PHASE 1: EXTEND schools TABLE
-- ============================================

-- Upgrade subscription_status ENUM to include 'expired'
ALTER TABLE schools
  MODIFY COLUMN subscription_status
    ENUM('active', 'inactive', 'trial', 'expired') DEFAULT 'trial';

-- Add subscription_type
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS subscription_type
    ENUM('none', 'trial', 'monthly', 'yearly') DEFAULT 'none';

-- Add trial window columns
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP NULL DEFAULT NULL;

-- Add paid subscription window columns
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP NULL DEFAULT NULL;

-- Index for fast subscription expiry lookups
ALTER TABLE schools
  ADD INDEX IF NOT EXISTS idx_subscription_status (subscription_status),
  ADD INDEX IF NOT EXISTS idx_trial_end_date (trial_end_date),
  ADD INDEX IF NOT EXISTS idx_subscription_end_date (subscription_end_date);

-- ============================================
-- PHASE 2: BACKFILL EXISTING RECORDS
-- ============================================

-- Sync legacy trial_ends_at → trial_end_date for any existing trial schools
UPDATE schools
SET
  trial_end_date  = trial_ends_at,
  subscription_type = 'trial'
WHERE
  trial_ends_at IS NOT NULL
  AND trial_end_date IS NULL
  AND subscription_status = 'trial';

-- Mark any schools whose trial has already passed as 'expired'
UPDATE schools
SET subscription_status = 'expired'
WHERE
  subscription_status = 'trial'
  AND trial_end_date IS NOT NULL
  AND trial_end_date < NOW();

-- ============================================
-- PHASE 3: ALBAYAN — ACTIVATE YEARLY SUBSCRIPTION
-- NOTE: Albayan Quran Memorization Centre has school id = 1
-- ============================================

UPDATE schools
SET
  subscription_status    = 'active',
  subscription_type      = 'yearly',
  trial_start_date       = NULL,
  trial_end_date         = NULL,
  subscription_start_date = CURDATE(),
  subscription_end_date  = DATE_ADD(CURDATE(), INTERVAL 365 DAY)
WHERE id = 1;

-- Also target by name in case id differs in dev/staging
UPDATE schools
SET
  subscription_status    = 'active',
  subscription_type      = 'yearly',
  trial_start_date       = NULL,
  trial_end_date         = NULL,
  subscription_start_date = CURDATE(),
  subscription_end_date  = DATE_ADD(CURDATE(), INTERVAL 365 DAY)
WHERE
  id != 1
  AND (
    name LIKE '%Albayan%'
    OR name LIKE '%albayan%'
    OR email LIKE '%albayan%'
  );

-- ============================================
-- PHASE 4: TEST SCHOOLS
-- ============================================

-- School A — Active trial (30 days from now)
INSERT INTO schools (
  name, status,
  subscription_status, subscription_type,
  trial_start_date, trial_end_date,
  setup_complete, created_at, updated_at
)
SELECT
  'Test School Alpha (Trial)',
  'active',
  'trial',
  'trial',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 30 DAY),
  TRUE,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM schools WHERE name = 'Test School Alpha (Trial)'
);

-- School B — Active yearly subscription
INSERT INTO schools (
  name, status,
  subscription_status, subscription_type,
  subscription_start_date, subscription_end_date,
  setup_complete, created_at, updated_at
)
SELECT
  'Test School Beta (Active)',
  'active',
  'active',
  'yearly',
  CURDATE(),
  DATE_ADD(CURDATE(), INTERVAL 365 DAY),
  TRUE,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM schools WHERE name = 'Test School Beta (Active)'
);

-- School C — Expired trial (ended 5 days ago)
INSERT INTO schools (
  name, status,
  subscription_status, subscription_type,
  trial_start_date, trial_end_date,
  setup_complete, created_at, updated_at
)
SELECT
  'Test School Gamma (Expired)',
  'active',
  'expired',
  'trial',
  DATE_SUB(NOW(), INTERVAL 35 DAY),
  DATE_SUB(NOW(), INTERVAL 5 DAY),
  TRUE,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM schools WHERE name = 'Test School Gamma (Expired)'
);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

SELECT
  id,
  name,
  subscription_status,
  subscription_type,
  trial_start_date,
  trial_end_date,
  subscription_start_date,
  subscription_end_date
FROM schools
ORDER BY id;
