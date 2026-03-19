-- ============================================================
-- Migration: Add missing subscription columns to schools table
-- Generated: 2026-03-19
-- Safe to run multiple times (checks column existence first)
-- ============================================================

-- TiDB / MySQL 8+ support ADD COLUMN IF NOT EXISTS
-- For MySQL 5.7 / MariaDB, use the stored-procedure approach below.

-- ---- Option A: TiDB / MySQL 8.0+ ----
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(50) NOT NULL DEFAULT 'trial' AFTER subscription_status,
  ADD COLUMN IF NOT EXISTS trial_start_date  DATETIME NULL                         AFTER subscription_type,
  ADD COLUMN IF NOT EXISTS trial_end_date    DATETIME NULL                         AFTER trial_start_date;

-- Backfill existing rows
UPDATE schools
SET subscription_type = COALESCE(subscription_plan, 'trial')
WHERE subscription_type IS NULL OR subscription_type = '';

-- ---- Option B: MySQL 5.7 (run each block separately if needed) ----
-- The application code uses INFORMATION_SCHEMA checks and graceful fallbacks,
-- so partial schema states are handled. Still, apply the ALTER before deploying.

/*
-- Add subscription_type (skip if already exists)
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools' AND COLUMN_NAME = 'subscription_type'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE schools ADD COLUMN subscription_type VARCHAR(50) NOT NULL DEFAULT 'trial' AFTER subscription_status",
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add trial_start_date
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools' AND COLUMN_NAME = 'trial_start_date'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE schools ADD COLUMN trial_start_date DATETIME NULL AFTER subscription_type',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add trial_end_date
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools' AND COLUMN_NAME = 'trial_end_date'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE schools ADD COLUMN trial_end_date DATETIME NULL AFTER trial_start_date',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
*/
