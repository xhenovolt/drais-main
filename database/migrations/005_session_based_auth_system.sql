-- ============================================
-- DRAIS V1 Session-Based Authentication System
-- ============================================
-- Migration for converting from JWT to session-based auth
-- Created: March 1, 2026

-- ============================================
-- 1. SESSIONS TABLE
-- ============================================
-- Fast session lookup with automatic expiration
-- HTTP-only cookies will store only the session_token
CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  school_id BIGINT NOT NULL,
  
  -- Session token: secure random string
  session_token VARCHAR(255) NOT NULL UNIQUE,
  
  -- Session expiry (default: 7 days)
  expires_at TIMESTAMP NOT NULL,
  
  -- Optional: IP validation for extra security
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE KEY uq_session_token (session_token),
  INDEX idx_user_id (user_id),
  INDEX idx_school_id (school_id),
  INDEX idx_expires_at (expires_at),  -- For cleanup queries
  INDEX idx_user_school (user_id, school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. UPDATE USERS TABLE IF NEEDED
-- ============================================
-- Add display_name column for easier user display
-- (This is optional if you want to derive from first_name + last_name)
-- ALTER TABLE users ADD COLUMN preferred_name VARCHAR(100) NULL AFTER last_name;

-- Index for faster display_name queries
-- ALTER TABLE users ADD INDEX idx_email_school (email, school_id);

-- ============================================
-- 3. CLEANUP JOB FOR EXPIRED SESSIONS
-- ============================================
-- Optional: Create event to automatically clean up expired sessions
-- This can be run manually or via a cron job

-- DELETE FROM sessions WHERE expires_at < NOW() AND is_active = TRUE;

-- ============================================
-- 4. CONSTRAINTS AND SECURITY
-- ============================================
-- Ensure sessions are properly isolated by school_id
-- Queries MUST ALWAYS include: WHERE session_token = ? AND school_id = ? AND expires_at > NOW()

-- ============================================
-- 5. SAMPLE SESSION LOOKUP QUERY (for reference)
-- ============================================
-- SELECT u.*, s.school_id
-- FROM sessions s
-- JOIN users u ON s.user_id = u.id
-- WHERE s.session_token = ?
--   AND s.school_id = ?
--   AND s.expires_at > NOW()
--   AND s.is_active = TRUE
--   AND u.is_active = TRUE;
