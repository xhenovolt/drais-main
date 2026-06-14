// 017_drop_stale_punch_keys.mjs
// Migration 016 swapped the dedup keys from the stored punch time to the
// device-reported identity, but its `DROP INDEX IF EXISTS` was silently
// no-op'd on TiDB Cloud, leaving the old uk_raw_punch / uk_punch (keyed on
// punch_at / check_time) in place. Those are now WRONG: punch_at /
// check_time hold the actual receive instant, which is not unique per punch
// (a backlog batch can share a second), so the stale unique keys could drop
// legitimate distinct punches. This drops them conditionally (idempotent,
// environment-safe) — the device-identity keys (uk_raw_identity /
// uk_punch_identity) from 016 remain the sole dedup keys.

async function indexExists(query, table, index) {
  const rows = await query(
    `SELECT 1 FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
      LIMIT 1`,
    [table, index],
  );
  return Array.isArray(rows) && rows.length > 0;
}

export default async function up({ query, log }) {
  const drops = [
    ['attendance_raw_events', 'uk_raw_punch'],
    ['zk_attendance_logs', 'uk_punch'],
  ];
  for (const [table, index] of drops) {
    if (await indexExists(query, table, index)) {
      await query(`ALTER TABLE ${table} DROP INDEX ${index}`);
      log(`dropped stale unique key ${index} on ${table}`);
    } else {
      log(`${index} on ${table} already absent — skipping`);
    }
  }
}
