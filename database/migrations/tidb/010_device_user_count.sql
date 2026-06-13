-- 010 — store the REAL on-device user count.
--
-- The /attendance/devices "users" figure was derived from
-- zk_user_mapping (with an `OR device_sn IS NULL` bug) and from
-- device_sync_state's command-ack proxy — both wildly inflated
-- (1230/1846 vs a real 45 on the K40). The true count is the device's
-- own counter (ZK getInfo().userCounts over TCP, or a fresh ADMS
-- DATA QUERY USERINFO push). We persist it here so the UI shows the
-- real number, with the time it was last established.

ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_user_count INT DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_user_count_at DATETIME DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_user_count_source VARCHAR(16) DEFAULT NULL;
