-- DRAIS V1 Schema Alignment Migration
-- Date: March 8, 2026
-- Purpose: Align database schema with application expectations

-- ============================================
-- ROLES TABLE ENHANCEMENTS
-- ============================================

-- Add slug column for role identification
ALTER TABLE roles ADD COLUMN IF NOT EXISTS slug VARCHAR(50) AFTER name;

-- Add is_super_admin flag for permission bypass
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_super_admin TINYINT(1) DEFAULT 0;

-- Add is_active for soft disable
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1;

-- Update existing roles with slugs
UPDATE roles SET slug = LOWER(REPLACE(REPLACE(name, ' ', '_'), '-', '_')) WHERE slug IS NULL;

-- Flag super admin roles
UPDATE roles SET is_super_admin = 1 WHERE name IN ('SuperAdmin', 'Super Admin');

-- Ensure all roles are active
UPDATE roles SET is_active = 1 WHERE is_active IS NULL;

-- ============================================
-- SCHOOLS TABLE ENHANCEMENTS
-- ============================================

-- Add status column
ALTER TABLE schools ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Add setup_complete flag
ALTER TABLE schools ADD COLUMN IF NOT EXISTS setup_complete TINYINT(1) DEFAULT 1;

-- Add school_type classification
ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_type VARCHAR(50) DEFAULT 'secondary';

-- Update existing schools
UPDATE schools SET status = 'active' WHERE status IS NULL;
UPDATE schools SET setup_complete = 1 WHERE setup_complete IS NULL;
UPDATE schools SET school_type = 'secondary' WHERE school_type IS NULL;

-- ============================================
-- PERMISSIONS TABLE ENHANCEMENTS  
-- ============================================

-- Add is_active flag
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1;

-- Update existing permissions
UPDATE permissions SET is_active = 1 WHERE is_active IS NULL;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify roles structure
SELECT 'ROLES TABLE' as '=== TABLE ===';
DESCRIBE roles;

-- Verify schools structure
SELECT 'SCHOOLS TABLE' as '=== TABLE ===';
DESCRIBE schools;

-- Verify permissions structure
SELECT 'PERMISSIONS TABLE' as '=== TABLE ===';
DESCRIBE permissions;

-- Show updated data
SELECT 'UPDATED ROLES' as '=== DATA ===';
SELECT id, school_id, name, slug, is_super_admin, is_active FROM roles WHERE school_id = 1;

SELECT 'UPDATED SCHOOLS' as '=== DATA ===';
SELECT id, name, status, setup_complete, school_type FROM schools;
