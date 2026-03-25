-- User Sessions Table for Session/Device Management
-- Tracks active sessions across devices for security monitoring

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  device_name VARCHAR(255),
  device_type VARCHAR(50), -- 'desktop', 'mobile', 'tablet'
  device_os VARCHAR(100), -- 'Windows', 'MacOS', 'iOS', 'Android', etc
  browser_name VARCHAR(100),
  ip_address VARCHAR(45), -- Supports IPv4 and IPv6
  user_agent TEXT,
  is_current BOOLEAN DEFAULT FALSE,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  
  INDEX idx_school_user (school_id, user_id),
  INDEX idx_user_id (user_id),
  INDEX idx_is_current (is_current),
  INDEX idx_last_active (last_active),
  CONSTRAINT fk_user_sessions_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create index for finding active sessions by user
CREATE INDEX idx_user_active_sessions ON user_sessions(user_id, is_current, expires_at);
