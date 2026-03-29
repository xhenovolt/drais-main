-- ═══════════════════════════════════════════════════════════════════════════════
-- DRAIS System Logs Table (for error tracking and debugging)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create system logs table
CREATE TABLE IF NOT EXISTS `system_logs` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `school_id` BIGINT DEFAULT NULL COMMENT 'Optional school context',
  `level` VARCHAR(20) NOT NULL COMMENT 'INFO, WARNING, ERROR, CRITICAL',
  `source` VARCHAR(100) COMMENT 'API route, service, or module name',
  `message` TEXT NOT NULL COMMENT 'Error or event message',
  `context` JSON DEFAULT NULL COMMENT 'Additional context (stack trace, request data, etc)',
  `status_code` INT DEFAULT NULL COMMENT 'HTTP status code if applicable',
  `user_id` BIGINT DEFAULT NULL COMMENT 'Associated user if applicable',
  `request_id` VARCHAR(255) DEFAULT NULL COMMENT 'Unique request identifier for tracing',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the event occurred',
  KEY `idx_level` (`level`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_school_id` (`school_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_request_id` (`request_id`),
  KEY `idx_level_school` (`level`, `school_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='System-wide error and event logging';

-- Verify audit_logs table (should already exist)
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `school_id` BIGINT NOT NULL,
  `user_id` BIGINT DEFAULT NULL,
  `action` VARCHAR(255) NOT NULL COMMENT 'Action performed (e.g., CREATED_STAFF)',
  `entity_type` VARCHAR(100) DEFAULT 'system' COMMENT 'Staff, Student, User, etc',
  `entity_id` BIGINT DEFAULT NULL,
  `metadata` JSON DEFAULT NULL COMMENT 'Additional details',
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `source` VARCHAR(50) DEFAULT 'WEB' COMMENT 'WEB, MOBILE, API, JETON, SYSTEM',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_action` (`action`),
  KEY `idx_entity` (`entity_type`, `entity_id`),
  KEY `idx_school_user` (`school_id`, `user_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_school_action` (`school_id`, `action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit trail for all significant actions';

-- Verify notifications table (should already exist)
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `school_id` BIGINT NOT NULL,
  `actor_user_id` BIGINT DEFAULT NULL COMMENT 'Who triggered the notification',
  `action` VARCHAR(255) COMMENT 'Action that triggered notification',
  `entity_type` VARCHAR(100) COMMENT 'Staff, Student, etc',
  `entity_id` BIGINT DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `metadata` JSON DEFAULT NULL,
  `priority` VARCHAR(50) DEFAULT 'normal' COMMENT 'low, normal, high, critical',
  `channel` VARCHAR(50) DEFAULT 'in_app' COMMENT 'in_app, email, sms, push',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_school_created` (`school_id`, `created_at`),
  KEY `idx_priority` (`priority`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Notifications triggered by system events';

-- Verify user_notifications table (should already exist)
CREATE TABLE IF NOT EXISTS `user_notifications` (
  `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
  `notification_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `school_id` BIGINT NOT NULL,
  `is_read` BOOLEAN DEFAULT FALSE,
  `read_at` TIMESTAMP NULL DEFAULT NULL,
  `channel` VARCHAR(50) DEFAULT 'in_app',
  `delivery_status` VARCHAR(50) DEFAULT 'pending' COMMENT 'pending, delivered, failed',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_notification_user` (`notification_id`, `user_id`, `channel`),
  KEY `idx_user_created` (`user_id`, `created_at`),
  KEY `idx_is_read` (`is_read`),
  FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tracks delivery and read status of notifications to users';
