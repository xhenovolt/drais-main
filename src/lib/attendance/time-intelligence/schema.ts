/**
 * Time Intelligence Engine — storage (runtime ensure, promise-gated).
 *
 *   attendance_time_baselines   each school+device's learned attendance
 *                               fingerprint (median first arrival, spread,
 *                               earliest-ever…). Recomputed from history —
 *                               never hardcoded.
 *   device_clock_health         one row per (device, local day): confidence,
 *                               estimated offset, likely cause, status.
 *   attendance_time_corrections full audit of every batch correction —
 *                               affected row ids + original punch_at values
 *                               (JSON) so any correction can be UNDONE.
 *
 * The original device timestamp is NEVER overwritten: device_reported_time
 * stays verbatim on attendance_raw_events, ingested_at is the server-received
 * instant, and punch_at is the corrected instant — with its pre-correction
 * value preserved here.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureTimeIntelligenceSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS attendance_time_baselines (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         school_id BIGINT NOT NULL,
         device_sn VARCHAR(64) NOT NULL DEFAULT '',
         median_first_minute INT DEFAULT NULL,     -- minute-of-day, school-local
         mad_minutes INT DEFAULT NULL,             -- median absolute deviation
         p10_first_minute INT DEFAULT NULL,
         p90_first_minute INT DEFAULT NULL,
         earliest_minute INT DEFAULT NULL,         -- earliest first-arrival ever seen
         latest_first_minute INT DEFAULT NULL,
         median_daily_punches INT DEFAULT NULL,
         sample_days INT NOT NULL DEFAULT 0,
         window_days INT NOT NULL DEFAULT 90,
         computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uk_school_device (school_id, device_sn)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
    await query(
      `CREATE TABLE IF NOT EXISTS device_clock_health (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         school_id BIGINT NOT NULL,
         device_sn VARCHAR(64) NOT NULL,
         local_date DATE NOT NULL,
         confidence INT NOT NULL,                  -- 0..100
         status VARCHAR(16) NOT NULL,              -- trusted | review | anomaly
         offset_estimate_min INT DEFAULT NULL,     -- +ve = device ahead
         likely_cause VARCHAR(64) DEFAULT NULL,
         detail VARCHAR(255) DEFAULT NULL,
         batch_size INT DEFAULT 0,
         first_arrival_minute INT DEFAULT NULL,
         corrected TINYINT NOT NULL DEFAULT 0,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uk_device_day (school_id, device_sn, local_date)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
    await query(
      `CREATE TABLE IF NOT EXISTS attendance_time_corrections (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         school_id BIGINT NOT NULL,
         device_sn VARCHAR(64) NOT NULL,
         local_date DATE NOT NULL,
         shift_minutes INT NOT NULL,               -- applied to punch_at (signed)
         affected_rows INT NOT NULL DEFAULT 0,
         original_times LONGTEXT,                  -- JSON [{id, punch_at}] for undo
         source VARCHAR(20) NOT NULL DEFAULT 'assisted',  -- assisted | manual | script
         applied_by BIGINT DEFAULT NULL,
         applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         undone_by BIGINT DEFAULT NULL,
         undone_at TIMESTAMP NULL DEFAULT NULL,
         KEY idx_school_device (school_id, device_sn, local_date)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
  })();
  return ensured;
}
