/**
 * Phase 1A — canonical `devices` schema ensure.
 *
 * The forensic audit found that the ADMS-shaped `devices` table the
 * entire ZKTeco pipeline depends on (sn-keyed, ip_address, is_online,
 * last_seen, deleted_at, …) was defined in NO schema file — it existed
 * only as runtime drift in production. The only committed definition
 * (database/device_integration_schema.sql) has no `sn` column at all.
 *
 * This helper makes the canonical shape reproducible:
 *
 *   - table absent → CREATE the full canonical shape.
 *   - table present (either historical shape) → ADD the missing
 *     columns additively. Nothing is renamed or dropped, so the old
 *     integration-shape columns (device_name, device_type, device_ip…)
 *     keep working for their readers while the ADMS columns become
 *     guaranteed.
 *
 * `sn` is the REAL device serial number (ADMS ?SN= query param). It is
 * never an IP address — Phase 1B fixed the local-TCP enroller that
 * used to violate this.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

const CANONICAL_CREATE = `CREATE TABLE IF NOT EXISTS devices (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id        BIGINT DEFAULT NULL,
  sn               VARCHAR(100) DEFAULT NULL,
  device_name      VARCHAR(100) DEFAULT NULL,
  device_type      VARCHAR(50)  DEFAULT NULL,
  model_name       VARCHAR(100) DEFAULT NULL,
  firmware_version VARCHAR(100) DEFAULT NULL,
  ip_address       VARCHAR(50)  DEFAULT NULL,
  location         VARCHAR(255) DEFAULT NULL,
  options          TEXT         DEFAULT NULL,
  push_version     VARCHAR(50)  DEFAULT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'active',
  is_online        TINYINT(1)   NOT NULL DEFAULT 0,
  last_seen        DATETIME     DEFAULT NULL,
  last_activity    DATETIME     DEFAULT NULL,
  deleted_at       DATETIME     DEFAULT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_devices_sn (sn),
  KEY idx_devices_school (school_id),
  KEY idx_devices_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

/** Columns the ADMS pipeline requires, with the DDL to add each. */
const REQUIRED_COLUMNS: Array<[string, string]> = [
  ['sn',               'ADD COLUMN sn VARCHAR(100) DEFAULT NULL'],
  ['school_id',        'ADD COLUMN school_id BIGINT DEFAULT NULL'],
  ['device_name',      'ADD COLUMN device_name VARCHAR(100) DEFAULT NULL'],
  ['model_name',       'ADD COLUMN model_name VARCHAR(100) DEFAULT NULL'],
  ['firmware_version', 'ADD COLUMN firmware_version VARCHAR(100) DEFAULT NULL'],
  ['ip_address',       'ADD COLUMN ip_address VARCHAR(50) DEFAULT NULL'],
  ['location',         'ADD COLUMN location VARCHAR(255) DEFAULT NULL'],
  ['options',          'ADD COLUMN options TEXT DEFAULT NULL'],
  ['push_version',     'ADD COLUMN push_version VARCHAR(50) DEFAULT NULL'],
  ['status',           "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'"],
  ['is_online',        'ADD COLUMN is_online TINYINT(1) NOT NULL DEFAULT 0'],
  ['last_seen',        'ADD COLUMN last_seen DATETIME DEFAULT NULL'],
  ['last_activity',    'ADD COLUMN last_activity DATETIME DEFAULT NULL'],
  ['deleted_at',       'ADD COLUMN deleted_at DATETIME DEFAULT NULL'],
];

export function ensureDevicesCanonicalSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      const existing = (await query(
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'devices'`,
        [],
      )) as Array<{ COLUMN_NAME: string }>;

      if (existing.length === 0) {
        await query(CANONICAL_CREATE, []);
        return;
      }

      const cols = new Set(existing.map(r => r.COLUMN_NAME.toLowerCase()));
      const missing = REQUIRED_COLUMNS.filter(([name]) => !cols.has(name));
      for (const [name, ddl] of missing) {
        try {
          await query(`ALTER TABLE devices ${ddl}`, []);
          console.log(`[devices-schema] added missing column: ${name}`);
        } catch (err) {
          console.warn(`[devices-schema] could not add column ${name}:`, err);
        }
      }

      // Unique key on sn (required by zk-handler's ON DUPLICATE KEY
      // upsert). Added only when absent; fails harmlessly if duplicate
      // sn values exist (operator must dedupe first — see migration
      // 020 notes).
      if (missing.some(([n]) => n === 'sn') || !(await hasIndex('devices', 'uk_devices_sn'))) {
        try {
          await query(`ALTER TABLE devices ADD UNIQUE KEY uk_devices_sn (sn)`, []);
        } catch { /* exists or duplicates present — non-fatal */ }
      }
    } catch (err) {
      ensured = null;
      throw err;
    }
  })();
  return ensured;
}

async function hasIndex(table: string, indexName: string): Promise<boolean> {
  try {
    const rows = (await query(
      `SELECT 1
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?
        LIMIT 1`,
      [table, indexName],
    )) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Every table the ADMS pipeline writes school_id into on a brand-new,
 * never-seen device serial. These predate multitenancy and were
 * declared `school_id BIGINT NOT NULL DEFAULT 1` — `getDeviceSchoolId`
 * correctly resolves an unknown SN to `null` so the device registers
 * as UNASSIGNED, but every INSERT bound to that null then violated the
 * NOT NULL constraint and was swallowed by the handler's fire-and-
 * forget try/catch (required so a device only ever sees HTTP 200
 * "OK"). Net effect: new devices heartbeated forever but never got a
 * row in `devices`, so they never appeared — assigned OR unassigned —
 * in /control/devices.
 *
 * database/migrations/tidb/046_devices_school_id_nullable.sql is the
 * managed fix; this is the runtime defensive fallback for databases
 * that haven't had it applied yet (see migrate.mjs's own doc comment:
 * "Runtime ensure* modules remain as DEFENSIVE FALLBACK only").
 */
const SCHOOL_ID_NULLABLE_TABLES = [
  'devices',
  'zk_raw_logs',
  'zk_device_logs',
  'zk_parsed_logs',
  'device_sync_state',
] as const;

let schoolIdNullableEnsured: Promise<void> | null = null;

export function ensureDeviceSchoolIdNullable(): Promise<void> {
  if (schoolIdNullableEnsured) return schoolIdNullableEnsured;
  schoolIdNullableEnsured = (async () => {
    for (const table of SCHOOL_ID_NULLABLE_TABLES) {
      try {
        const rows = (await query(
          `SELECT IS_NULLABLE
             FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = ?
              AND COLUMN_NAME = 'school_id'`,
          [table],
        )) as Array<{ IS_NULLABLE: string }>;
        // No row = table/column doesn't exist here yet — nothing to fix.
        if (rows[0]?.IS_NULLABLE === 'NO') {
          await query(`ALTER TABLE ${table} MODIFY COLUMN school_id BIGINT DEFAULT NULL`, []);
          console.log(`[devices-schema] relaxed ${table}.school_id to accept NULL (unassigned devices)`);
        }
      } catch (err) {
        console.warn(`[devices-schema] could not relax ${table}.school_id:`, err);
      }
    }
  })();
  return schoolIdNullableEnsured;
}
