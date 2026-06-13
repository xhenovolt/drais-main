-- 004 — canonical ADMS devices columns (additive only).
-- Production already has `sn` (runtime drift); this makes the full
-- shape reproducible and guarantees every column the code reads.

ALTER TABLE devices ADD COLUMN IF NOT EXISTS sn VARCHAR(100) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS school_id BIGINT DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_name VARCHAR(100) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS model_name VARCHAR(100) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(100) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS location VARCHAR(255) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS options TEXT DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS push_version VARCHAR(50) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_online TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_seen DATETIME DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_activity DATETIME DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS deleted_at DATETIME DEFAULT NULL;

-- TiDB does not parse ADD UNIQUE INDEX IF NOT EXISTS; the runner
-- tolerates errno 1061 (duplicate key name) so this is idempotent.
-- Duplicate sn VALUES (errno 1062) fail loudly on purpose.
ALTER TABLE devices ADD UNIQUE INDEX uk_devices_sn (sn);
ALTER TABLE devices ADD INDEX IF NOT EXISTS idx_devices_school (school_id);
ALTER TABLE devices ADD INDEX IF NOT EXISTS idx_devices_ip (ip_address);
