-- 012 — store the device LAN IP so DRAIS can auto-poll its user count.
-- devices.ip_address is the PUBLIC/WAN source IP from ADMS; it is not
-- reachable over TCP. The LAN IP (e.g. 192.168.1.17) is entered once
-- (during a sync) and persisted here so /attendance/devices can poll
-- each machine's count automatically without re-prompting.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS lan_ip VARCHAR(50) DEFAULT NULL;
