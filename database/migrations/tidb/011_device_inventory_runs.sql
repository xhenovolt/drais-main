-- 011 — device inventory polling runs.
--
-- A "device inventory" is the device's OWN answer to "who is stored on
-- you right now" — pulled either over LAN TCP (getUsers) or via the
-- ADMS DATA QUERY USERINFO command. The displayed on-device user count
-- MUST come from the latest completed run here, never from DRAIS-side
-- tables (zk_user_mapping / biometric_enrollments). If no completed run
-- exists, the UI shows "unknown / not recently synced", not a guess.

CREATE TABLE IF NOT EXISTS device_inventory_runs (
  id                   BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id            BIGINT NOT NULL,
  device_sn            VARCHAR(100) NOT NULL,
  method               ENUM('tcp','adms') NOT NULL DEFAULT 'tcp',
  status               ENUM('pending','running','completed','failed','timeout') NOT NULL DEFAULT 'pending',
  command_id           BIGINT DEFAULT NULL,
  users_returned_count INT DEFAULT NULL,
  started_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at         DATETIME DEFAULT NULL,
  error_message        TEXT DEFAULT NULL,
  triggered_by         BIGINT DEFAULT NULL,
  KEY idx_inv_device (device_sn, started_at),
  KEY idx_inv_school (school_id, started_at),
  KEY idx_inv_status (device_sn, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
