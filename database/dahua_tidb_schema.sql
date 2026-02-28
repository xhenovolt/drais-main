/**
 * Dahua Device Integration - TiDB Cloud Compatible Schema
 * 
 * This schema creates tables for managing Dahua fingerprint devices
 * Compatible with TiDB Cloud, which is MySQL 5.7+ compatible
 */

-- ============================================================
-- Table 1: device_configs
-- Stores encrypted device credentials and configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS device_configs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  device_name VARCHAR(255) NOT NULL COMMENT 'Friendly name for the device',
  device_ip VARCHAR(45) NOT NULL COMMENT 'IPv4 or IPv6 address',
  device_port INT NOT NULL DEFAULT 80 COMMENT 'HTTP port (usually 80 or 443)',
  device_username VARCHAR(255) NOT NULL COMMENT 'Device admin username',
  device_password_encrypted LONGTEXT NOT NULL COMMENT 'AES-256-GCM encrypted password',
  device_serial_number VARCHAR(255) UNIQUE KEY COMMENT 'Device serial number from info',
  device_type VARCHAR(255) COMMENT 'Device type/model from device',
  connection_status ENUM('connected', 'disconnected', 'error') DEFAULT 'disconnected' COMMENT 'Current connection status',
  last_connection_attempt TIMESTAMP NULL DEFAULT NULL COMMENT 'Last connection attempt time',
  last_successful_connection TIMESTAMP NULL DEFAULT NULL COMMENT 'Last successful connection time',
  last_error_message TEXT COMMENT 'Error message from last failed attempt',
  is_active BOOLEAN DEFAULT TRUE COMMENT 'Whether this device config is active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  KEY idx_school_id (school_id),
  KEY idx_serial_number (device_serial_number),
  KEY idx_connection_status (connection_status),
  KEY idx_is_active (is_active),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Device configuration and encrypted credentials';

-- ============================================================
-- Table 2: device_access_logs
-- Stores real access events from Dahua device
-- ============================================================
CREATE TABLE IF NOT EXISTS device_access_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_config_id BIGINT NOT NULL COMMENT 'Reference to device_configs',
  device_serial_number VARCHAR(255) COMMENT 'For fast filtering',
  event_timestamp TIMESTAMP NOT NULL COMMENT 'When the access event occurred',
  user_id VARCHAR(255) COMMENT 'User ID from device',
  card_number VARCHAR(255) COMMENT 'Card/employee number',
  person_name VARCHAR(255) COMMENT 'Person name from device',
  access_result ENUM('granted', 'denied', 'unknown') DEFAULT 'unknown' COMMENT 'Access grant/deny result',
  device_event_id VARCHAR(255) COMMENT 'Unique event ID from device',
  device_event_type VARCHAR(100) COMMENT 'Event type code from device',
  raw_payload JSON COMMENT 'Raw response data from device',
  is_synced BOOLEAN DEFAULT FALSE COMMENT 'Whether synced from device',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (device_config_id) REFERENCES device_configs(id) ON DELETE CASCADE,
  KEY idx_device_config (device_config_id),
  KEY idx_device_serial (device_serial_number),
  KEY idx_event_timestamp (event_timestamp),
  KEY idx_access_result (access_result),
  KEY idx_is_synced (is_synced),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Real access events from Dahua devices';

-- ============================================================
-- Table 3: device_connection_history
-- Tracks every connection attempt for debugging & monitoring
-- ============================================================
CREATE TABLE IF NOT EXISTS device_connection_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_config_id BIGINT NOT NULL COMMENT 'Reference to device_configs',
  connection_attempt_type ENUM('test', 'scheduled_check', 'manual_reconnect', 'system_startup') 
    DEFAULT 'test' COMMENT 'Type of connection attempt',
  status ENUM('success', 'failed', 'timeout', 'unauthorized', 'unreachable', 'api_error') 
    DEFAULT 'failed' COMMENT 'Connection attempt status',
  http_status_code INT COMMENT 'HTTP status code from device (200, 401, 404, etc)',
  error_message TEXT COMMENT 'Error message for debugging',
  response_time_ms INT COMMENT 'Response time in milliseconds',
  ip_address VARCHAR(45) COMMENT 'IP used for this attempt',
  port INT COMMENT 'Port used for this attempt',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (device_config_id) REFERENCES device_configs(id) ON DELETE CASCADE,
  KEY idx_device_config (device_config_id),
  KEY idx_status (status),
  KEY idx_created_at (created_at),
  KEY idx_attempt_type (connection_attempt_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Connection attempt history and statistics';

-- ============================================================
-- Create Views for Common Queries
-- ============================================================

-- Connection statistics view
CREATE OR REPLACE VIEW v_device_connection_stats AS
SELECT 
  dc.id,
  dc.device_name,
  dc.connection_status,
  COUNT(dch.id) as total_attempts,
  SUM(CASE WHEN dch.status = 'success' THEN 1 ELSE 0 END) as successful_attempts,
  ROUND(SUM(CASE WHEN dch.status = 'success' THEN 1 ELSE 0 END) * 100 / COUNT(dch.id), 2) as success_rate,
  ROUND(AVG(dch.response_time_ms), 2) as avg_response_ms,
  MAX(dch.created_at) as last_attempt_time,
  MAX(CASE WHEN dch.status = 'success' THEN dch.created_at END) as last_success_time
FROM device_configs dc
LEFT JOIN device_connection_history dch ON dc.id = dch.device_config_id
WHERE dc.is_active = 1
GROUP BY dc.id, dc.device_name, dc.connection_status;

-- Recent access events view
CREATE OR REPLACE VIEW v_recent_access_events AS
SELECT 
  dal.id,
  dal.device_config_id,
  dc.device_name,
  dal.event_timestamp,
  dal.person_name,
  dal.card_number,
  dal.access_result,
  dal.device_event_type
FROM device_access_logs dal
JOIN device_configs dc ON dal.device_config_id = dc.id
WHERE dal.event_timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY dal.event_timestamp DESC;

-- Device status summary view
CREATE OR REPLACE VIEW v_device_status_summary AS
SELECT 
  dc.id,
  dc.device_name,
  dc.device_ip,
  dc.device_port,
  dc.connection_status,
  dc.last_connection_attempt,
  dc.last_error_message,
  COUNT(DISTINCT dal.id) as total_events_24h,
  SUM(CASE WHEN dal.access_result = 'granted' THEN 1 ELSE 0 END) as granted_24h,
  SUM(CASE WHEN dal.access_result = 'denied' THEN 1 ELSE 0 END) as denied_24h
FROM device_configs dc
LEFT JOIN device_access_logs dal ON dc.id = dal.device_config_id 
  AND dal.event_timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)
WHERE dc.is_active = 1
GROUP BY dc.id, dc.device_name, dc.device_ip, dc.device_port, 
  dc.connection_status, dc.last_connection_attempt, dc.last_error_message;

-- ============================================================
-- Indexes Summary
-- ============================================================
-- device_configs: 5 indexes (school_id, serial_number, connection_status, is_active, created_at)
-- device_access_logs: 6 indexes (device_config, serial, timestamp, result, synced, created_at)
-- device_connection_history: 4 indexes (device_config, status, created_at, attempt_type)

-- Total tables: 3
-- Total views: 3
-- TiDB Cloud Compatible: YES
-- UTF-8 Support: YES (utf8mb4_unicode_ci)
-- JSON Support: YES
-- ENUM Support: YES
