-- Dahua Device Configuration Table
-- Stores device credentials and configuration securely

CREATE TABLE IF NOT EXISTS device_configs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  device_name VARCHAR(100) NOT NULL DEFAULT 'Access Control Device',
  device_ip VARCHAR(50) NOT NULL,
  device_port INT DEFAULT 80,
  device_username VARCHAR(100) NOT NULL,
  device_password_encrypted VARCHAR(255) NOT NULL,
  device_serial_number VARCHAR(100) UNIQUE,
  device_type VARCHAR(50),
  connection_status ENUM('connected', 'disconnected', 'error') DEFAULT 'disconnected',
  last_connection_attempt TIMESTAMP,
  last_successful_connection TIMESTAMP,
  last_error_message VARCHAR(255),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_school_id (school_id),
  INDEX idx_serial_number (device_serial_number),
  INDEX idx_connection_status (connection_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Device Access Logs Table
-- Stores real access logs fetched from the device

CREATE TABLE IF NOT EXISTS device_access_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_config_id BIGINT NOT NULL,
  device_serial_number VARCHAR(100),
  event_timestamp DATETIME NOT NULL,
  user_id VARCHAR(50),
  card_number VARCHAR(50),
  person_name VARCHAR(100),
  access_result ENUM('granted', 'denied', 'unknown') DEFAULT 'unknown',
  device_event_id VARCHAR(50),
  device_event_type VARCHAR(100),
  raw_payload JSON,
  is_synced TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_config_id) REFERENCES device_configs(id) ON DELETE CASCADE,
  INDEX idx_device_config (device_config_id),
  INDEX idx_device_serial (device_serial_number),
  INDEX idx_event_timestamp (event_timestamp),
  INDEX idx_access_result (access_result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Device Connection History Table
-- Tracks all connection attempts for monitoring and debugging

CREATE TABLE IF NOT EXISTS device_connection_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_config_id BIGINT NOT NULL,
  connection_attempt_type ENUM('test', 'scheduled_check', 'manual_reconnect', 'system_startup') DEFAULT 'test',
  status ENUM('success', 'failed', 'timeout', 'unauthorized', 'unreachable', 'api_error') DEFAULT 'failed',
  http_status_code INT,
  error_message VARCHAR(255),
  response_time_ms INT,
  ip_address VARCHAR(50),
  port INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_config_id) REFERENCES device_configs(id) ON DELETE CASCADE,
  INDEX idx_device_config (device_config_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- Grant privileges (if needed)
-- GRANT ALL ON ibunbaz_drais.device_configs TO 'app_user'@'localhost';
-- GRANT ALL ON ibunbaz_drais.device_access_logs TO 'app_user'@'localhost';
-- GRANT ALL ON ibunbaz_drais.device_connection_history TO 'app_user'@'localhost';
